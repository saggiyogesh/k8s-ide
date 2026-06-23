package k8s

import (
	"context"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	utilyaml "k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/discovery"
	cachedmemory "k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/restmapper"

	"github.com/example/k8s-ide/apps/backend/internal/session"
	backendwatch "github.com/example/k8s-ide/apps/backend/internal/watch"
)

type SessionInfo struct {
	ActiveContext  string `json:"activeContext"`
	Namespace      string `json:"namespace,omitempty"`
	BackendVersion string `json:"backendVersion"`
	Mode           string `json:"mode"`
}

type ApiResourceDescriptor struct {
	Group            string   `json:"group"`
	Version          string   `json:"version"`
	Kind             string   `json:"kind"`
	Resource         string   `json:"resource"`
	SingularResource string   `json:"singularResource"`
	ShortNames       []string `json:"shortNames"`
	Namespaced       bool     `json:"namespaced"`
	Verbs            []string `json:"verbs"`
	Categories       []string `json:"categories"`
}

type ResourceTarget struct {
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Kind      string `json:"kind,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
}

type ResourceQuery struct {
	Group         string
	Version       string
	Resource      string
	Namespace     string
	Name          string
	LabelSelector string
	FieldSelector string
	Limit         int64
}

type ResourceListResult struct {
	Items           []map[string]any `json:"items"`
	Count           int              `json:"count"`
	ResourceVersion string           `json:"resourceVersion,omitempty"`
}

type ApplyResult struct {
	Applied []ResourceTarget `json:"applied"`
	Message string           `json:"message"`
}

type ActionRequest struct {
	Action  string         `json:"action"`
	Target  ResourceTarget `json:"target"`
	Payload map[string]any `json:"payload,omitempty"`
}

type ActionResult struct {
	OK      bool           `json:"ok"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type PortForwardSession struct {
	ID         string `json:"id"`
	LocalPort  int    `json:"localPort"`
	RemotePort int    `json:"remotePort"`
	Status     string `json:"status"`
}

type Engine struct {
	loader       *session.Loader
	watchManager *backendwatch.Manager

	mu            sync.RWMutex
	activeContext string
}

func NewEngine(loader *session.Loader, watchManager *backendwatch.Manager) *Engine {
	return &Engine{
		loader:       loader,
		watchManager: watchManager,
	}
}

func (e *Engine) ListContexts() ([]session.ContextInfo, error) {
	return e.loader.Contexts()
}

func (e *Engine) OpenSession(_ context.Context, contextName string) (SessionInfo, error) {
	resolvedContext, err := e.loader.ResolveContextName(contextName)
	if err != nil {
		return SessionInfo{}, err
	}

	config, err := e.loader.RawConfig()
	if err != nil {
		return SessionInfo{}, err
	}

	ctxConfig, ok := config.Contexts[resolvedContext]
	if !ok {
		return SessionInfo{}, fmt.Errorf("context %q was not found in kubeconfig", resolvedContext)
	}

	e.mu.Lock()
	e.activeContext = resolvedContext
	e.mu.Unlock()

	return SessionInfo{
		ActiveContext:  resolvedContext,
		Namespace:      ctxConfig.Namespace,
		BackendVersion: "0.1.0",
		Mode:           "desktop",
	}, nil
}

func (e *Engine) DiscoverResources(ctx context.Context) ([]ApiResourceDescriptor, error) {
	_, discoveryClient, _, activeContext, err := e.clients(ctx)
	if err != nil {
		return nil, err
	}

	resourceLists, err := discoveryClient.ServerPreferredResources()
	if err != nil && !discovery.IsGroupDiscoveryFailedError(err) {
		return nil, err
	}

	descriptors := make([]ApiResourceDescriptor, 0)
	for _, resourceList := range resourceLists {
		groupVersion, parseErr := schema.ParseGroupVersion(resourceList.GroupVersion)
		if parseErr != nil {
			continue
		}

		for _, resource := range resourceList.APIResources {
			if strings.Contains(resource.Name, "/") {
				continue
			}

			descriptors = append(descriptors, ApiResourceDescriptor{
				Group:            groupVersion.Group,
				Version:          groupVersion.Version,
				Kind:             resource.Kind,
				Resource:         resource.Name,
				SingularResource: resource.SingularName,
				ShortNames:       resource.ShortNames,
				Namespaced:       resource.Namespaced,
				Verbs:            resource.Verbs,
				Categories:       resource.Categories,
			})
		}
	}

	sort.Slice(descriptors, func(i, j int) bool {
		left := descriptors[i]
		right := descriptors[j]
		return strings.Join([]string{left.Group, left.Version, left.Resource}, "/") <
			strings.Join([]string{right.Group, right.Version, right.Resource}, "/")
	})

	e.watchManager.Touch("discovery:" + activeContext)
	return descriptors, nil
}

func (e *Engine) ListResources(ctx context.Context, query ResourceQuery) (ResourceListResult, error) {
	client, _, _, _, err := e.clients(ctx)
	if err != nil {
		return ResourceListResult{}, err
	}

	list, err := e.resourceInterface(client, query).List(ctx, metav1.ListOptions{
		LabelSelector: query.LabelSelector,
		FieldSelector: query.FieldSelector,
		Limit:         query.Limit,
	})
	if err != nil {
		return ResourceListResult{}, err
	}

	items := make([]map[string]any, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, item.Object)
	}

	return ResourceListResult{
		Items:           items,
		Count:           len(items),
		ResourceVersion: list.GetResourceVersion(),
	}, nil
}

func (e *Engine) GetResource(ctx context.Context, target ResourceTarget) (map[string]any, error) {
	client, _, _, _, err := e.clients(ctx)
	if err != nil {
		return nil, err
	}

	resource, err := e.resourceInterface(client, ResourceQuery{
		Group:     target.Group,
		Version:   target.Version,
		Resource:  target.Resource,
		Namespace: target.Namespace,
	}).Get(ctx, target.Name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	return resource.Object, nil
}

func (e *Engine) DeleteResource(ctx context.Context, target ResourceTarget) error {
	client, _, _, _, err := e.clients(ctx)
	if err != nil {
		return err
	}

	return e.resourceInterface(client, ResourceQuery{
		Group:     target.Group,
		Version:   target.Version,
		Resource:  target.Resource,
		Namespace: target.Namespace,
	}).Delete(ctx, target.Name, metav1.DeleteOptions{})
}

func (e *Engine) ApplyYAML(ctx context.Context, manifest string) (ApplyResult, error) {
	client, _, mapper, _, err := e.clients(ctx)
	if err != nil {
		return ApplyResult{}, err
	}

	decoder := utilyaml.NewYAMLOrJSONDecoder(strings.NewReader(manifest), 4096)
	applied := make([]ResourceTarget, 0)

	for {
		payload := map[string]any{}
		if err := decoder.Decode(&payload); err != nil {
			if err == io.EOF {
				break
			}
			return ApplyResult{}, err
		}

		if len(payload) == 0 {
			continue
		}

		object := &unstructured.Unstructured{Object: payload}
		gvk := object.GroupVersionKind()
		mapping, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
		if err != nil {
			return ApplyResult{}, err
		}

		namespace := object.GetNamespace()
		var resourceClient dynamic.ResourceInterface
		if mapping.Scope.Name() == "namespace" && namespace != "" {
			resourceClient = client.Resource(mapping.Resource).Namespace(namespace)
		} else {
			resourceClient = client.Resource(mapping.Resource)
		}

		current, err := resourceClient.Get(ctx, object.GetName(), metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			if _, err := resourceClient.Create(ctx, object, metav1.CreateOptions{}); err != nil {
				return ApplyResult{}, err
			}
		} else if err != nil {
			return ApplyResult{}, err
		} else {
			object.SetResourceVersion(current.GetResourceVersion())
			if _, err := resourceClient.Update(ctx, object, metav1.UpdateOptions{}); err != nil {
				return ApplyResult{}, err
			}
		}

		applied = append(applied, ResourceTarget{
			Group:     mapping.Resource.Group,
			Version:   mapping.Resource.Version,
			Resource:  mapping.Resource.Resource,
			Kind:      gvk.Kind,
			Namespace: namespace,
			Name:      object.GetName(),
		})
	}

	return ApplyResult{
		Applied: applied,
		Message: fmt.Sprintf("applied %d manifest(s)", len(applied)),
	}, nil
}

func (e *Engine) InvokeAction(ctx context.Context, request ActionRequest) (ActionResult, error) {
	switch request.Action {
	case "restart":
		return e.restartWorkload(ctx, request.Target)
	case "scale":
		return e.scaleWorkload(ctx, request.Target, request.Payload)
	default:
		return ActionResult{
			OK:      false,
			Message: fmt.Sprintf("action %q is not implemented in this scaffold yet", request.Action),
		}, nil
	}
}

func (e *Engine) StartPortForward(_ context.Context, request ActionRequest) (PortForwardSession, error) {
	localPort := int(fromPayloadNumber(request.Payload, "localPort"))
	remotePort := int(fromPayloadNumber(request.Payload, "remotePort"))

	if localPort == 0 || remotePort == 0 {
		return PortForwardSession{}, fmt.Errorf("localPort and remotePort are required")
	}

	return PortForwardSession{
		ID:         fmt.Sprintf("%s-%d-%d", request.Target.Name, localPort, remotePort),
		LocalPort:  localPort,
		RemotePort: remotePort,
		Status:     "starting",
	}, nil
}

func (e *Engine) resourceInterface(client dynamic.Interface, query ResourceQuery) dynamic.ResourceInterface {
	gvr := schema.GroupVersionResource{
		Group:    query.Group,
		Version:  query.Version,
		Resource: query.Resource,
	}

	resourceClient := client.Resource(gvr)
	if query.Namespace != "" {
		return resourceClient.Namespace(query.Namespace)
	}

	return resourceClient
}

func (e *Engine) clients(ctx context.Context) (dynamic.Interface, discovery.DiscoveryInterface, *restmapper.DeferredDiscoveryRESTMapper, string, error) {
	if err := ctx.Err(); err != nil {
		return nil, nil, nil, "", err
	}

	activeContext, err := e.activeContextName()
	if err != nil {
		return nil, nil, nil, "", err
	}

	restConfig, err := e.loader.RestConfig(activeContext)
	if err != nil {
		return nil, nil, nil, "", err
	}

	dynamicClient, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		return nil, nil, nil, "", err
	}

	discoveryClient, err := discovery.NewDiscoveryClientForConfig(restConfig)
	if err != nil {
		return nil, nil, nil, "", err
	}

	mapper := restmapper.NewDeferredDiscoveryRESTMapper(cachedmemory.NewMemCacheClient(discoveryClient))
	return dynamicClient, discoveryClient, mapper, activeContext, nil
}

func (e *Engine) activeContextName() (string, error) {
	e.mu.RLock()
	activeContext := e.activeContext
	e.mu.RUnlock()

	return e.loader.ResolveContextName(activeContext)
}

func (e *Engine) restartWorkload(ctx context.Context, target ResourceTarget) (ActionResult, error) {
	client, _, _, _, err := e.clients(ctx)
	if err != nil {
		return ActionResult{}, err
	}

	resourceClient := e.resourceInterface(client, ResourceQuery{
		Group:     target.Group,
		Version:   target.Version,
		Resource:  target.Resource,
		Namespace: target.Namespace,
	})

	workload, err := resourceClient.Get(ctx, target.Name, metav1.GetOptions{})
	if err != nil {
		return ActionResult{}, err
	}

	annotationKey := "kubectl.kubernetes.io/restartedAt"
	if err := unstructured.SetNestedField(
		workload.Object,
		time.Now().UTC().Format(time.RFC3339),
		"spec",
		"template",
		"metadata",
		"annotations",
		annotationKey,
	); err != nil {
		return ActionResult{}, err
	}

	if _, err := resourceClient.Update(ctx, workload, metav1.UpdateOptions{}); err != nil {
		return ActionResult{}, err
	}

	return ActionResult{
		OK:      true,
		Message: fmt.Sprintf("triggered rollout restart for %s", target.Name),
	}, nil
}

func (e *Engine) scaleWorkload(ctx context.Context, target ResourceTarget, payload map[string]any) (ActionResult, error) {
	replicas := int64(fromPayloadNumber(payload, "replicas"))
	if replicas <= 0 {
		replicas = 1
	}

	client, _, _, _, err := e.clients(ctx)
	if err != nil {
		return ActionResult{}, err
	}

	resourceClient := e.resourceInterface(client, ResourceQuery{
		Group:     target.Group,
		Version:   target.Version,
		Resource:  target.Resource,
		Namespace: target.Namespace,
	})

	workload, err := resourceClient.Get(ctx, target.Name, metav1.GetOptions{})
	if err != nil {
		return ActionResult{}, err
	}

	if err := unstructured.SetNestedField(workload.Object, replicas, "spec", "replicas"); err != nil {
		return ActionResult{}, err
	}

	if _, err := resourceClient.Update(ctx, workload, metav1.UpdateOptions{}); err != nil {
		return ActionResult{}, err
	}

	return ActionResult{
		OK:      true,
		Message: fmt.Sprintf("scaled %s to %d replicas", target.Name, replicas),
		Details: map[string]any{"replicas": replicas},
	}, nil
}

func fromPayloadNumber(payload map[string]any, key string) int64 {
	if payload == nil {
		return 0
	}

	switch value := payload[key].(type) {
	case float64:
		return int64(value)
	case float32:
		return int64(value)
	case int:
		return int64(value)
	case int64:
		return value
	case string:
		parsed, _ := strconv.ParseInt(value, 10, 64)
		return parsed
	default:
		return 0
	}
}
