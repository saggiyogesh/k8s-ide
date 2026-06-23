package k8s

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/cursor/k8s-ide/apps/backend/internal/session"
	watchpkg "github.com/cursor/k8s-ide/apps/backend/internal/watch"
	"sigs.k8s.io/yaml"
)

const backendVersion = "0.1.0"

type Engine struct {
	mu         sync.RWMutex
	session    *session.Service
	watches    *watchpkg.Manager[WatchEvent]
	discovery  []ApiResourceDescriptor
	byKind     map[string]ApiResourceDescriptor
	byResource map[string]ApiResourceDescriptor
	resources  map[string][]KubeResource
}

func NewEngine(sessionService *session.Service, watchManager *watchpkg.Manager[WatchEvent]) *Engine {
	engine := &Engine{
		session:    sessionService,
		watches:    watchManager,
		discovery:  defaultDiscovery(),
		byKind:     map[string]ApiResourceDescriptor{},
		byResource: map[string]ApiResourceDescriptor{},
		resources:  map[string][]KubeResource{},
	}

	for _, descriptor := range engine.discovery {
		engine.byKind[descriptor.Kind] = descriptor
		engine.byResource[gvrKey(descriptor.Group, descriptor.Version, descriptor.Resource)] = descriptor
	}

	engine.seedSampleData()
	return engine
}

func (e *Engine) ListContexts() ([]ClusterContext, error) {
	contexts, err := e.session.ListContexts()
	if err != nil {
		return nil, err
	}

	output := make([]ClusterContext, 0, len(contexts))
	for _, item := range contexts {
		output = append(output, ClusterContext{
			Name:      item.Name,
			Cluster:   item.Cluster,
			User:      item.User,
			Namespace: item.Namespace,
			IsCurrent: item.IsCurrent,
		})
	}

	return output, nil
}

func (e *Engine) OpenSession(contextName, namespace string) (SessionInfo, error) {
	contexts, err := e.session.ListContexts()
	if err != nil {
		return SessionInfo{}, err
	}

	for _, candidate := range contexts {
		if candidate.Name != contextName {
			continue
		}

		if namespace == "" {
			namespace = candidate.Namespace
		}
		if namespace == "" {
			namespace = "default"
		}

		sessionInfo := SessionInfo{
			Context:        candidate.Name,
			Namespace:      namespace,
			ConnectedAt:    time.Now().UTC().Format(time.RFC3339),
			BackendVersion: backendVersion,
		}
		e.session.SetSession(session.SessionState{
			Context:        sessionInfo.Context,
			Namespace:      sessionInfo.Namespace,
			ConnectedAt:    sessionInfo.ConnectedAt,
			BackendVersion: sessionInfo.BackendVersion,
		})
		return sessionInfo, nil
	}

	return SessionInfo{}, fmt.Errorf("context %q not found", contextName)
}

func (e *Engine) GetDiscovery() ([]ApiResourceDescriptor, error) {
	return slices.Clone(e.discovery), nil
}

func (e *Engine) ListResources(_ context.Context, opts ListResourcesOptions) (ResourceListResult, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	items := make([]KubeResource, 0)
	for _, item := range e.resources[gvrKey(opts.Group, opts.Version, opts.Resource)] {
		if opts.Namespace != "" && item.Ref.Namespace != "" && item.Ref.Namespace != opts.Namespace {
			continue
		}

		if opts.Search != "" {
			needle := strings.ToLower(opts.Search)
			if !strings.Contains(strings.ToLower(item.Ref.Name), needle) &&
				!strings.Contains(strings.ToLower(item.Ref.Namespace), needle) &&
				!strings.Contains(strings.ToLower(item.Kind), needle) {
				continue
			}
		}

		items = append(items, item)
	}

	return ResourceListResult{
		Items:           items,
		Total:           len(items),
		ResourceVersion: fmt.Sprintf("%d", time.Now().Unix()),
	}, nil
}

func (e *Engine) GetResource(_ context.Context, ref ResourceRef) (KubeResource, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	for _, item := range e.resources[gvrKey(ref.Group, ref.Version, ref.Resource)] {
		if item.Ref.Name == ref.Name && item.Ref.Namespace == ref.Namespace {
			return item, nil
		}
	}

	return KubeResource{}, fmt.Errorf("resource %s not found", ref.Name)
}

func (e *Engine) ApplyYAML(_ context.Context, input string) (ApplyResult, error) {
	documents := splitYAMLDocuments(input)
	if len(documents) == 0 {
		return ApplyResult{}, errors.New("yaml payload was empty")
	}

	applied := make([]ResourceRef, 0, len(documents))
	warnings := make([]string, 0)

	for _, document := range documents {
		var manifest map[string]any
		if err := yaml.Unmarshal([]byte(document), &manifest); err != nil {
			warnings = append(warnings, fmt.Sprintf("skipped invalid document: %v", err))
			continue
		}

		apiVersion, _ := manifest["apiVersion"].(string)
		kind, _ := manifest["kind"].(string)
		metadata, _ := manifest["metadata"].(map[string]any)
		name, _ := metadata["name"].(string)
		namespace, _ := metadata["namespace"].(string)

		if name == "" || kind == "" || apiVersion == "" {
			warnings = append(warnings, "skipped document without apiVersion/kind/metadata.name")
			continue
		}

		descriptor, ok := e.byKind[kind]
		if !ok {
			warnings = append(warnings, fmt.Sprintf("skipped unsupported kind %s", kind))
			continue
		}

		if !descriptor.Namespaced {
			namespace = ""
		}
		if descriptor.Namespaced && namespace == "" {
			namespace = "default"
		}

		spec, _ := manifest["spec"].(map[string]any)
		status, _ := manifest["status"].(map[string]any)

		rendered, err := yaml.Marshal(manifest)
		if err != nil {
			return ApplyResult{}, err
		}

		resource := KubeResource{
			Ref: ResourceRef{
				Group:     descriptor.Group,
				Version:   descriptor.Version,
				Resource:  descriptor.Resource,
				Name:      name,
				Namespace: namespace,
			},
			Kind:       descriptor.Kind,
			APIVersion: apiVersion,
			Metadata: ResourceMetadata{
				UID:               fmt.Sprintf("%s-%d", strings.ToLower(name), time.Now().UnixNano()),
				CreationTimestamp: time.Now().UTC().Format(time.RFC3339),
			},
			Spec:    cloneMap(spec),
			Status:  cloneMap(status),
			Summary: map[string]any{"status": "Applied", "age": "just now"},
			YAML:    string(rendered),
			Phase:   "ready",
		}

		e.upsertResource(resource)
		applied = append(applied, resource.Ref)
	}

	return ApplyResult{
		Applied:  applied,
		Warnings: warnings,
	}, nil
}

func (e *Engine) DeleteResource(_ context.Context, ref ResourceRef) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	key := gvrKey(ref.Group, ref.Version, ref.Resource)
	items := e.resources[key]
	next := make([]KubeResource, 0, len(items))
	found := false

	for _, item := range items {
		if item.Ref.Name == ref.Name && item.Ref.Namespace == ref.Namespace {
			found = true
			continue
		}
		next = append(next, item)
	}

	if !found {
		return fmt.Errorf("resource %s not found", ref.Name)
	}

	e.resources[key] = next
	e.watches.Publish(watchKey(ref.Group, ref.Version, ref.Resource, ref.Namespace), WatchEvent{
		Type: "DELETED",
		Ref:  ref,
	})
	return nil
}

func (e *Engine) InvokeAction(ctx context.Context, request ResourceActionRequest) (ActionResult, error) {
	switch request.Action {
	case "delete":
		if err := e.DeleteResource(ctx, request.Ref); err != nil {
			return ActionResult{}, err
		}
		return ActionResult{Action: request.Action, Success: true, Message: "Resource deleted"}, nil
	case "scale":
		resource, err := e.GetResource(ctx, request.Ref)
		if err != nil {
			return ActionResult{}, err
		}

		replicas := 2
		if raw, ok := request.Args["replicas"].(float64); ok {
			replicas = int(raw)
		}

		resource.Summary["replicas"] = replicas
		resource.Status["replicas"] = replicas
		e.upsertResource(resource)

		return ActionResult{
			Action:  request.Action,
			Success: true,
			Message: fmt.Sprintf("Scaled %s to %d replicas", request.Ref.Name, replicas),
			Data:    map[string]any{"replicas": replicas},
		}, nil
	case "restart":
		return ActionResult{
			Action:  request.Action,
			Success: true,
			Message: fmt.Sprintf("Triggered rollout restart for %s", request.Ref.Name),
		}, nil
	case "logs", "exec", "port-forward", "apply":
		return ActionResult{
			Action:  request.Action,
			Success: true,
			Message: fmt.Sprintf("%s is wired through the shared action contract", request.Action),
		}, nil
	default:
		return ActionResult{}, fmt.Errorf("unsupported action %q", request.Action)
	}
}

func (e *Engine) OpenExecSession(_ context.Context, namespace, pod, container string) ExecSession {
	return ExecSession{
		SessionID: fmt.Sprintf("exec-%d", time.Now().UnixNano()),
		StreamURL: fmt.Sprintf("/ws/exec/%s/%s?container=%s", namespace, pod, container),
	}
}

func (e *Engine) OpenPortForwardSession(_ context.Context, namespace, resource, name string, remotePort int) PortForwardSession {
	return PortForwardSession{
		SessionID: fmt.Sprintf("pf-%d", time.Now().UnixNano()),
		Address:   fmt.Sprintf("127.0.0.1:%d", remotePort),
		LocalPort: remotePort,
	}
}

func (e *Engine) SubscribeWatch(ctx context.Context, group, version, resource, namespace string) <-chan WatchEvent {
	return e.watches.Subscribe(ctx, watchKey(group, version, resource, namespace))
}

func (e *Engine) seedSampleData() {
	samples := []KubeResource{
		e.sampleResource("core", "v1", "pods", "Pod", "api-7c4f8c9dd9-2nsw5", "default", "Running"),
		e.sampleResource("apps", "v1", "deployments", "Deployment", "api", "default", "Available"),
		e.sampleResource("core", "v1", "services", "Service", "api", "default", "ClusterIP"),
		e.sampleResource("apps", "v1", "statefulsets", "StatefulSet", "postgres", "data", "Ready"),
	}

	for _, sample := range samples {
		e.upsertResource(sample)
	}
}

func (e *Engine) sampleResource(group, version, resource, kind, name, namespace, status string) KubeResource {
	descriptor := e.byResource[gvrKey(group, version, resource)]

	manifest := map[string]any{
		"apiVersion": fmt.Sprintf("%s/%s", group, version),
		"kind":       kind,
		"metadata": map[string]any{
			"name":      name,
			"namespace": namespace,
			"labels": map[string]string{
				"app.kubernetes.io/name": name,
			},
		},
		"spec": map[string]any{
			"replicas": 1,
		},
		"status": map[string]any{
			"phase": status,
		},
	}

	if group == "core" {
		manifest["apiVersion"] = version
	}

	rendered, _ := yaml.Marshal(manifest)

	return KubeResource{
		Ref: ResourceRef{
			Group:     descriptor.Group,
			Version:   descriptor.Version,
			Resource:  descriptor.Resource,
			Name:      name,
			Namespace: namespace,
		},
		Kind:       kind,
		APIVersion: manifest["apiVersion"].(string),
		Metadata: ResourceMetadata{
			UID:               fmt.Sprintf("%s-%s", resource, name),
			CreationTimestamp: time.Now().Add(-12 * time.Minute).UTC().Format(time.RFC3339),
			Labels: map[string]string{
				"app.kubernetes.io/name": name,
			},
		},
		Spec: map[string]any{
			"replicas": 1,
		},
		Status: map[string]any{
			"phase": status,
		},
		Summary: map[string]any{
			"status":   status,
			"age":      "12m",
			"replicas": 1,
		},
		YAML:  string(rendered),
		Phase: "ready",
	}
}

func (e *Engine) upsertResource(resource KubeResource) {
	e.mu.Lock()
	defer e.mu.Unlock()

	key := gvrKey(resource.Ref.Group, resource.Ref.Version, resource.Ref.Resource)
	items := e.resources[key]
	replaced := false

	for index, item := range items {
		if item.Ref.Name == resource.Ref.Name && item.Ref.Namespace == resource.Ref.Namespace {
			items[index] = resource
			replaced = true
			break
		}
	}

	if !replaced {
		items = append(items, resource)
	}

	e.resources[key] = items
	e.watches.Publish(watchKey(resource.Ref.Group, resource.Ref.Version, resource.Ref.Resource, resource.Ref.Namespace), WatchEvent{
		Type:     "MODIFIED",
		Ref:      resource.Ref,
		Resource: &resource,
	})
}

func defaultDiscovery() []ApiResourceDescriptor {
	return []ApiResourceDescriptor{
		{
			Group:            "core",
			Version:          "v1",
			Kind:             "Pod",
			Resource:         "pods",
			SingularResource: "pod",
			Namespaced:       true,
			Verbs:            []string{"get", "list", "watch", "delete", "patch", "update"},
			ShortNames:       []string{"po"},
			Categories:       []string{"all"},
			Scope:            "Namespaced",
		},
		{
			Group:            "core",
			Version:          "v1",
			Kind:             "Service",
			Resource:         "services",
			SingularResource: "service",
			Namespaced:       true,
			Verbs:            []string{"get", "list", "watch", "delete", "patch", "update"},
			ShortNames:       []string{"svc"},
			Categories:       []string{"all"},
			Scope:            "Namespaced",
		},
		{
			Group:            "core",
			Version:          "v1",
			Kind:             "ConfigMap",
			Resource:         "configmaps",
			SingularResource: "configmap",
			Namespaced:       true,
			Verbs:            []string{"get", "list", "watch", "delete", "patch", "update"},
			Categories:       []string{"all"},
			Scope:            "Namespaced",
		},
		{
			Group:            "core",
			Version:          "v1",
			Kind:             "Namespace",
			Resource:         "namespaces",
			SingularResource: "namespace",
			Namespaced:       false,
			Verbs:            []string{"get", "list", "watch", "delete", "patch", "update"},
			ShortNames:       []string{"ns"},
			Categories:       []string{"all"},
			Scope:            "Cluster",
		},
		{
			Group:            "apps",
			Version:          "v1",
			Kind:             "Deployment",
			Resource:         "deployments",
			SingularResource: "deployment",
			Namespaced:       true,
			Verbs:            []string{"get", "list", "watch", "delete", "patch", "update"},
			ShortNames:       []string{"deploy"},
			Categories:       []string{"all"},
			Scope:            "Namespaced",
		},
		{
			Group:            "apps",
			Version:          "v1",
			Kind:             "StatefulSet",
			Resource:         "statefulsets",
			SingularResource: "statefulset",
			Namespaced:       true,
			Verbs:            []string{"get", "list", "watch", "delete", "patch", "update"},
			ShortNames:       []string{"sts"},
			Categories:       []string{"all"},
			Scope:            "Namespaced",
		},
		{
			Group:            "apps",
			Version:          "v1",
			Kind:             "DaemonSet",
			Resource:         "daemonsets",
			SingularResource: "daemonset",
			Namespaced:       true,
			Verbs:            []string{"get", "list", "watch", "delete", "patch", "update"},
			ShortNames:       []string{"ds"},
			Categories:       []string{"all"},
			Scope:            "Namespaced",
		},
	}
}

func cloneMap(input map[string]any) map[string]any {
	if input == nil {
		return map[string]any{}
	}

	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}

func splitYAMLDocuments(input string) []string {
	docs := strings.Split(input, "\n---")
	filtered := make([]string, 0, len(docs))
	for _, doc := range docs {
		trimmed := strings.TrimSpace(doc)
		if trimmed != "" {
			filtered = append(filtered, trimmed)
		}
	}
	return filtered
}

func gvrKey(group, version, resource string) string {
	return fmt.Sprintf("%s/%s/%s", group, version, resource)
}

func watchKey(group, version, resource, namespace string) string {
	if namespace == "" {
		namespace = "_cluster"
	}
	return fmt.Sprintf("%s/%s/%s/%s", group, version, resource, namespace)
}
