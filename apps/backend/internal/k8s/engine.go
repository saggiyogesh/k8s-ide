package k8s

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"
	"time"

	apimeta "k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	utilyaml "k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/restmapper"

	"github.com/k8s-ide/backend/internal/session"
)

type ApiResourceDescriptor struct {
	Group        string   `json:"group"`
	Version      string   `json:"version"`
	Kind         string   `json:"kind"`
	Resource     string   `json:"resource"`
	SingularName string   `json:"singularName,omitempty"`
	Scope        string   `json:"scope"`
	ShortNames   []string `json:"shortNames,omitempty"`
	Categories   []string `json:"categories,omitempty"`
	Verbs        []string `json:"verbs,omitempty"`
}

type ResourceRef struct {
	Context   string `json:"context"`
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
}

type ListOptions struct {
	Context       string
	Group         string
	Version       string
	Resource      string
	Namespace     string
	LabelSelector string
	FieldSelector string
	Continue      string
	Limit         int64
}

type GetOptions struct {
	Context   string
	Group     string
	Version   string
	Resource  string
	Namespace string
	Name      string
}

type DeleteOptions = GetOptions

type ResourceListResult struct {
	Items           []map[string]any `json:"items"`
	ResourceVersion string           `json:"resourceVersion,omitempty"`
	Continue        string           `json:"continue,omitempty"`
}

type ApplyRequest struct {
	Context string `json:"context"`
	YAML    string `json:"yaml"`
}

type ApplyResult struct {
	Applied  []ResourceRef `json:"applied"`
	Warnings []string      `json:"warnings"`
}

type ScaleActionRequest struct {
	Context   string `json:"context"`
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
	Replicas  int64  `json:"replicas"`
}

type RestartActionRequest struct {
	Context   string `json:"context"`
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
}

type ActionResult struct {
	Action   string       `json:"action"`
	Message  string       `json:"message"`
	Resource *ResourceRef `json:"resource,omitempty"`
}

type Engine struct {
	sessions       *session.Manager
	mu             sync.RWMutex
	discoveryCache map[string][]ApiResourceDescriptor
}

func NewEngine(sessions *session.Manager) *Engine {
	return &Engine{
		sessions:       sessions,
		discoveryCache: map[string][]ApiResourceDescriptor{},
	}
}

func normalizeGroup(group string) string {
	if group == "core" {
		return ""
	}
	return group
}

func (e *Engine) gvr(group, version, resource string) schema.GroupVersionResource {
	return schema.GroupVersionResource{Group: normalizeGroup(group), Version: version, Resource: resource}
}

func (e *Engine) dynamicClient(contextName string) (dynamic.Interface, error) {
	config, err := e.sessions.RESTConfig(contextName)
	if err != nil {
		return nil, err
	}
	return dynamic.NewForConfig(config)
}

func (e *Engine) discoveryClient(contextName string) (*discovery.DiscoveryClient, error) {
	config, err := e.sessions.RESTConfig(contextName)
	if err != nil {
		return nil, err
	}
	return discovery.NewDiscoveryClientForConfig(config)
}

func (e *Engine) ListContexts(ctx context.Context) ([]session.ClusterContext, error) {
	return e.sessions.ListContexts(ctx)
}

func (e *Engine) OpenSession(ctx context.Context, contextName string) (session.SessionInfo, error) {
	return e.sessions.OpenSession(ctx, contextName)
}

func (e *Engine) Discovery(contextName string) ([]ApiResourceDescriptor, error) {
	cacheKey := contextName
	e.mu.RLock()
	if cached, ok := e.discoveryCache[cacheKey]; ok && len(cached) > 0 {
		e.mu.RUnlock()
		return cached, nil
	}
	e.mu.RUnlock()

	client, err := e.discoveryClient(contextName)
	if err != nil {
		return nil, err
	}

	resourceLists, err := client.ServerPreferredResources()
	if err != nil && len(resourceLists) == 0 {
		return nil, err
	}

	descriptors := make([]ApiResourceDescriptor, 0)
	for _, list := range resourceLists {
		groupVersion, parseErr := schema.ParseGroupVersion(list.GroupVersion)
		if parseErr != nil {
			continue
		}

		for _, resource := range list.APIResources {
			if strings.Contains(resource.Name, "/") {
				continue
			}

			scope := "Cluster"
			if resource.Namespaced {
				scope = "Namespaced"
			}

			descriptors = append(descriptors, ApiResourceDescriptor{
				Group:        groupVersion.Group,
				Version:      groupVersion.Version,
				Kind:         resource.Kind,
				Resource:     resource.Name,
				SingularName: resource.SingularName,
				Scope:        scope,
				ShortNames:   resource.ShortNames,
				Categories:   resource.Categories,
				Verbs:        resource.Verbs,
			})
		}
	}

	sort.Slice(descriptors, func(i, j int) bool {
		left := descriptors[i]
		right := descriptors[j]
		leftKey := strings.Join([]string{left.Group, left.Version, left.Kind, left.Resource}, "/")
		rightKey := strings.Join([]string{right.Group, right.Version, right.Kind, right.Resource}, "/")
		return leftKey < rightKey
	})

	e.mu.Lock()
	e.discoveryCache[cacheKey] = descriptors
	e.mu.Unlock()

	return descriptors, nil
}

func (e *Engine) ResourceInterface(contextName string, gvr schema.GroupVersionResource, namespace string) (dynamic.ResourceInterface, error) {
	client, err := e.dynamicClient(contextName)
	if err != nil {
		return nil, err
	}

	resourceClient := client.Resource(gvr)
	if namespace != "" {
		return resourceClient.Namespace(namespace), nil
	}
	return resourceClient, nil
}

func (e *Engine) ListResources(opts ListOptions) (ResourceListResult, error) {
	resourceClient, err := e.ResourceInterface(opts.Context, e.gvr(opts.Group, opts.Version, opts.Resource), opts.Namespace)
	if err != nil {
		return ResourceListResult{}, err
	}

	list, err := resourceClient.List(context.Background(), metav1.ListOptions{
		LabelSelector: opts.LabelSelector,
		FieldSelector: opts.FieldSelector,
		Continue:      opts.Continue,
		Limit:         opts.Limit,
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
		ResourceVersion: list.GetResourceVersion(),
		Continue:        list.GetContinue(),
	}, nil
}

func (e *Engine) GetResource(opts GetOptions) (map[string]any, error) {
	resourceClient, err := e.ResourceInterface(opts.Context, e.gvr(opts.Group, opts.Version, opts.Resource), opts.Namespace)
	if err != nil {
		return nil, err
	}

	item, err := resourceClient.Get(context.Background(), opts.Name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	return item.Object, nil
}

func (e *Engine) DeleteResource(opts DeleteOptions) error {
	resourceClient, err := e.ResourceInterface(opts.Context, e.gvr(opts.Group, opts.Version, opts.Resource), opts.Namespace)
	if err != nil {
		return err
	}
	return resourceClient.Delete(context.Background(), opts.Name, metav1.DeleteOptions{})
}

func (e *Engine) mapper(contextName string) (apimeta.RESTMapper, error) {
	client, err := e.discoveryClient(contextName)
	if err != nil {
		return nil, err
	}
	groupResources, err := restmapper.GetAPIGroupResources(client)
	if err != nil {
		return nil, err
	}
	return restmapper.NewDiscoveryRESTMapper(groupResources), nil
}

func (e *Engine) ApplyYAML(request ApplyRequest) (ApplyResult, error) {
	if strings.TrimSpace(request.YAML) == "" {
		return ApplyResult{}, fmt.Errorf("yaml payload cannot be empty")
	}

	mapper, err := e.mapper(request.Context)
	if err != nil {
		return ApplyResult{}, err
	}

	client, err := e.dynamicClient(request.Context)
	if err != nil {
		return ApplyResult{}, err
	}

	defaultNamespace, err := e.sessions.Namespace(request.Context)
	if err != nil {
		return ApplyResult{}, err
	}

	decoder := utilyaml.NewYAMLOrJSONDecoder(bytes.NewReader([]byte(request.YAML)), 4096)
	result := ApplyResult{Applied: []ResourceRef{}, Warnings: []string{}}

	for {
		raw := map[string]any{}
		if err := decoder.Decode(&raw); err != nil {
			if err == io.EOF {
				break
			}
			return ApplyResult{}, err
		}
		if len(raw) == 0 {
			continue
		}

		object := &unstructured.Unstructured{Object: raw}
		gvk := object.GroupVersionKind()
		if gvk.Empty() {
			return ApplyResult{}, fmt.Errorf("resource document is missing apiVersion or kind")
		}
		if object.GetName() == "" {
			return ApplyResult{}, fmt.Errorf("resource %s/%s is missing metadata.name", gvk.Group, gvk.Kind)
		}

		mapping, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
		if err != nil {
			return ApplyResult{}, err
		}

		namespace := object.GetNamespace()
		resourceClient := client.Resource(mapping.Resource)
		if mapping.Scope.Name() == apimeta.RESTScopeNameNamespace {
			if namespace == "" {
				namespace = defaultNamespace
				object.SetNamespace(namespace)
			}
			resourceClient = resourceClient.Namespace(namespace)
		}

		payload, err := json.Marshal(object.Object)
		if err != nil {
			return ApplyResult{}, err
		}

		force := true
		if _, err := resourceClient.Patch(context.Background(), object.GetName(), types.ApplyPatchType, payload, metav1.PatchOptions{
			FieldManager: "k8s-ide",
			Force:        &force,
		}); err != nil {
			return ApplyResult{}, err
		}

		result.Applied = append(result.Applied, ResourceRef{
			Context:   request.Context,
			Group:     mapping.Resource.Group,
			Version:   mapping.Resource.Version,
			Resource:  mapping.Resource.Resource,
			Namespace: namespace,
			Name:      object.GetName(),
		})
	}

	e.mu.Lock()
	delete(e.discoveryCache, request.Context)
	e.mu.Unlock()

	return result, nil
}

func (e *Engine) ScaleWorkload(request ScaleActionRequest) (ActionResult, error) {
	resourceClient, err := e.ResourceInterface(request.Context, e.gvr(request.Group, request.Version, request.Resource), request.Namespace)
	if err != nil {
		return ActionResult{}, err
	}

	object, err := resourceClient.Get(context.Background(), request.Name, metav1.GetOptions{})
	if err != nil {
		return ActionResult{}, err
	}

	if err := unstructured.SetNestedField(object.Object, request.Replicas, "spec", "replicas"); err != nil {
		return ActionResult{}, err
	}

	if _, err := resourceClient.Update(context.Background(), object, metav1.UpdateOptions{}); err != nil {
		return ActionResult{}, err
	}

	return ActionResult{
		Action:  "scale",
		Message: fmt.Sprintf("Scaled %s/%s to %d replicas", request.Resource, request.Name, request.Replicas),
		Resource: &ResourceRef{
			Context:   request.Context,
			Group:     normalizeGroup(request.Group),
			Version:   request.Version,
			Resource:  request.Resource,
			Namespace: request.Namespace,
			Name:      request.Name,
		},
	}, nil
}

func (e *Engine) RestartWorkload(request RestartActionRequest) (ActionResult, error) {
	resourceClient, err := e.ResourceInterface(request.Context, e.gvr(request.Group, request.Version, request.Resource), request.Namespace)
	if err != nil {
		return ActionResult{}, err
	}

	object, err := resourceClient.Get(context.Background(), request.Name, metav1.GetOptions{})
	if err != nil {
		return ActionResult{}, err
	}

	annotations, _, err := unstructured.NestedStringMap(object.Object, "spec", "template", "metadata", "annotations")
	if err != nil {
		return ActionResult{}, err
	}
	if annotations == nil {
		annotations = map[string]string{}
	}
	annotations["kubectl.kubernetes.io/restartedAt"] = time.Now().UTC().Format(time.RFC3339)

	if err := unstructured.SetNestedStringMap(object.Object, annotations, "spec", "template", "metadata", "annotations"); err != nil {
		return ActionResult{}, err
	}

	if _, err := resourceClient.Update(context.Background(), object, metav1.UpdateOptions{}); err != nil {
		return ActionResult{}, err
	}

	return ActionResult{
		Action:  "restart",
		Message: fmt.Sprintf("Triggered rollout restart for %s/%s", request.Resource, request.Name),
		Resource: &ResourceRef{
			Context:   request.Context,
			Group:     normalizeGroup(request.Group),
			Version:   request.Version,
			Resource:  request.Resource,
			Namespace: request.Namespace,
			Name:      request.Name,
		},
	}, nil
}
