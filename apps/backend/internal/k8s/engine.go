package k8s

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/restmapper"
	"k8s.io/utils/ptr"

	"github.com/k8s-ide/backend/internal/session"
)

type Engine struct {
	sessions *session.Store
	now      func() time.Time
}

func NewEngine(store *session.Store) *Engine {
	return &Engine{
		sessions: store,
		now:      time.Now,
	}
}

func (e *Engine) ListContexts(_ context.Context) ([]ClusterContext, error) {
	config, err := e.sessions.LoadConfig()
	if err != nil {
		return nil, err
	}

	items := make([]ClusterContext, 0, len(config.Contexts))
	for name, ctx := range config.Contexts {
		items = append(items, ClusterContext{
			Name:      name,
			Cluster:   ctx.Cluster,
			User:      ctx.AuthInfo,
			Namespace: ctx.Namespace,
			Current:   name == config.CurrentContext,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].Name < items[j].Name
	})

	return items, nil
}

func (e *Engine) OpenSession(_ context.Context, contextName string) (*SessionInfo, error) {
	if err := e.sessions.SetCurrentContext(contextName); err != nil {
		return nil, err
	}

	return e.GetSession(context.Background()), nil
}

func (e *Engine) GetSession(_ context.Context) *SessionInfo {
	current := e.sessions.CurrentContext()
	if current == "" {
		return nil
	}

	return &SessionInfo{
		Context:        current,
		KubeconfigPath: e.sessions.KubeconfigPath(),
		OpenedAt:       e.now().UTC().Format(time.RFC3339),
	}
}

func (e *Engine) Discovery(ctx context.Context) ([]ApiResourceDescriptor, error) {
	_, discoveryClient, err := e.clients()
	if err != nil {
		return nil, err
	}

	_, resourceLists, err := discoveryClient.ServerGroupsAndResources()
	if err != nil && !discovery.IsGroupDiscoveryFailedError(err) {
		return nil, err
	}

	descriptors := make([]ApiResourceDescriptor, 0)
	for _, list := range resourceLists {
		groupVersion, err := schema.ParseGroupVersion(list.GroupVersion)
		if err != nil {
			return nil, fmt.Errorf("parse group version %q: %w", list.GroupVersion, err)
		}

		for _, resource := range list.APIResources {
			if strings.Contains(resource.Name, "/") {
				continue
			}

			descriptors = append(descriptors, ApiResourceDescriptor{
				Group:        groupVersion.Group,
				Version:      groupVersion.Version,
				Kind:         resource.Kind,
				Resource:     resource.Name,
				SingularName: resource.SingularName,
				ShortNames:   append([]string{}, resource.ShortNames...),
				Categories:   append([]string{}, resource.Categories...),
				Namespaced:   resource.Namespaced,
				Verbs:        append([]string{}, resource.Verbs...),
			})
		}
	}

	sort.Slice(descriptors, func(i, j int) bool {
		left := []string{descriptors[i].Kind, descriptors[i].Group, descriptors[i].Version, descriptors[i].Resource}
		right := []string{descriptors[j].Kind, descriptors[j].Group, descriptors[j].Version, descriptors[j].Resource}
		return strings.Join(left, "/") < strings.Join(right, "/")
	})

	return descriptors, nil
}

func (e *Engine) ListResources(ctx context.Context, request ListResourcesRequest) (*ResourceListResult, error) {
	dynamicClient, discoveryClient, err := e.clients()
	if err != nil {
		return nil, err
	}

	gvr := requestToGVR(request.Group, request.Version, request.Resource)
	resourceClient, err := e.resourceClient(ctx, dynamicClient, discoveryClient, gvr, request.Namespace)
	if err != nil {
		return nil, err
	}

	result, err := resourceClient.List(ctx, metav1.ListOptions{
		LabelSelector: request.LabelSelector,
		FieldSelector: request.FieldSelector,
		Limit:         request.Limit,
		Continue:      request.Continue,
	})
	if err != nil {
		return nil, err
	}

	items := make([]map[string]any, 0, len(result.Items))
	for _, item := range result.Items {
		items = append(items, item.Object)
	}

	return &ResourceListResult{
		Items:           items,
		Continue:        result.GetContinue(),
		ResourceVersion: result.GetResourceVersion(),
	}, nil
}

func (e *Engine) GetResource(ctx context.Context, request GetResourceRequest) (map[string]any, error) {
	dynamicClient, discoveryClient, err := e.clients()
	if err != nil {
		return nil, err
	}

	gvr := requestToGVR(request.Group, request.Version, request.Resource)
	resourceClient, err := e.resourceClient(ctx, dynamicClient, discoveryClient, gvr, request.Namespace)
	if err != nil {
		return nil, err
	}

	result, err := resourceClient.Get(ctx, request.Name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	return result.Object, nil
}

func (e *Engine) DeleteResource(ctx context.Context, request DeleteResourceRequest) error {
	dynamicClient, discoveryClient, err := e.clients()
	if err != nil {
		return err
	}

	gvr := requestToGVR(request.Group, request.Version, request.Resource)
	resourceClient, err := e.resourceClient(ctx, dynamicClient, discoveryClient, gvr, request.Namespace)
	if err != nil {
		return err
	}

	return resourceClient.Delete(ctx, request.Name, metav1.DeleteOptions{})
}

func (e *Engine) ApplyResources(ctx context.Context, request ApplyRequest) (*ApplyResult, error) {
	dynamicClient, discoveryClient, err := e.clients()
	if err != nil {
		return nil, err
	}

	groupResources, err := restmapper.GetAPIGroupResources(discoveryClient)
	if err != nil {
		return nil, fmt.Errorf("build rest mapper: %w", err)
	}

	mapper := restmapper.NewDiscoveryRESTMapper(groupResources)
	decoder := yaml.NewYAMLOrJSONDecoder(bytes.NewBufferString(request.YAML), 4096)

	result := &ApplyResult{Resources: make([]ResourceRef, 0)}
	fieldManager := request.FieldManager
	if fieldManager == "" {
		fieldManager = "k8s-ide"
	}

	for {
		var object map[string]any
		if err := decoder.Decode(&object); err != nil {
			if strings.Contains(err.Error(), "EOF") {
				break
			}
			return nil, fmt.Errorf("decode manifest: %w", err)
		}
		if len(object) == 0 {
			continue
		}

		resource := &unstructured.Unstructured{Object: object}
		gvk := resource.GroupVersionKind()
		if gvk.Empty() {
			return nil, fmt.Errorf("manifest missing apiVersion or kind")
		}

		mapping, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
		if err != nil {
			return nil, fmt.Errorf("map %s: %w", gvk.String(), err)
		}

		name := resource.GetName()
		if name == "" {
			return nil, fmt.Errorf("manifest missing metadata.name")
		}

		var resourceClient dynamic.ResourceInterface = dynamicClient.Resource(mapping.Resource)
		namespace := resource.GetNamespace()
		if mapping.Scope.Name() == meta.RESTScopeNameNamespace {
			if namespace == "" {
				namespace = "default"
			}
			resource.SetNamespace(namespace)
			resourceClient = dynamicClient.Resource(mapping.Resource).Namespace(namespace)
		}

		data, err := json.Marshal(resource.Object)
		if err != nil {
			return nil, fmt.Errorf("marshal manifest: %w", err)
		}

		if _, err := resourceClient.Patch(
			ctx,
			name,
			types.ApplyPatchType,
			data,
			metav1.PatchOptions{
				FieldManager: fieldManager,
				Force:        ptr.To(request.Force),
			},
		); err != nil {
			return nil, fmt.Errorf("apply %s/%s: %w", mapping.Resource.Resource, name, err)
		}

		result.Resources = append(result.Resources, ResourceRef{
			Group:     mapping.Resource.Group,
			Version:   mapping.Resource.Version,
			Resource:  mapping.Resource.Resource,
			Namespace: namespace,
			Name:      name,
		})
	}

	return result, nil
}

func (e *Engine) ScaleResource(ctx context.Context, request ScaleActionRequest) (*ActionResult, error) {
	dynamicClient, discoveryClient, err := e.clients()
	if err != nil {
		return nil, err
	}

	gvr := requestToGVR(request.Group, request.Version, request.Resource)
	resourceClient, err := e.resourceClient(ctx, dynamicClient, discoveryClient, gvr, request.Namespace)
	if err != nil {
		return nil, err
	}

	patch, err := json.Marshal(map[string]any{
		"spec": map[string]any{
			"replicas": request.Replicas,
		},
	})
	if err != nil {
		return nil, err
	}

	if _, err := resourceClient.Patch(ctx, request.Name, types.MergePatchType, patch, metav1.PatchOptions{}); err != nil {
		return nil, err
	}

	return &ActionResult{
		OK:      true,
		Message: fmt.Sprintf("scaled %s/%s to %d replicas", request.Resource, request.Name, request.Replicas),
	}, nil
}

func (e *Engine) RestartResource(ctx context.Context, request RestartActionRequest) (*ActionResult, error) {
	dynamicClient, discoveryClient, err := e.clients()
	if err != nil {
		return nil, err
	}

	gvr := requestToGVR(request.Group, request.Version, request.Resource)
	resourceClient, err := e.resourceClient(ctx, dynamicClient, discoveryClient, gvr, request.Namespace)
	if err != nil {
		return nil, err
	}

	patch, err := json.Marshal(map[string]any{
		"spec": map[string]any{
			"template": map[string]any{
				"metadata": map[string]any{
					"annotations": map[string]string{
						"kubectl.kubernetes.io/restartedAt": e.now().UTC().Format(time.RFC3339),
					},
				},
			},
		},
	})
	if err != nil {
		return nil, err
	}

	if _, err := resourceClient.Patch(ctx, request.Name, types.MergePatchType, patch, metav1.PatchOptions{}); err != nil {
		return nil, err
	}

	return &ActionResult{
		OK:      true,
		Message: fmt.Sprintf("restarted %s/%s", request.Resource, request.Name),
	}, nil
}

func (e *Engine) WatchResources(ctx context.Context, request ListResourcesRequest) (watch.Interface, error) {
	dynamicClient, discoveryClient, err := e.clients()
	if err != nil {
		return nil, err
	}

	gvr := requestToGVR(request.Group, request.Version, request.Resource)
	resourceClient, err := e.resourceClient(ctx, dynamicClient, discoveryClient, gvr, request.Namespace)
	if err != nil {
		return nil, err
	}

	return resourceClient.Watch(ctx, metav1.ListOptions{
		LabelSelector: request.LabelSelector,
		FieldSelector: request.FieldSelector,
		Watch:         true,
	})
}

func (e *Engine) clients() (dynamic.Interface, discovery.DiscoveryInterface, error) {
	config, err := e.sessions.ClientConfig().ClientConfig()
	if err != nil {
		return nil, nil, fmt.Errorf("build rest config: %w", err)
	}

	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, nil, fmt.Errorf("create dynamic client: %w", err)
	}

	discoveryClient, err := discovery.NewDiscoveryClientForConfig(config)
	if err != nil {
		return nil, nil, fmt.Errorf("create discovery client: %w", err)
	}

	return dynamicClient, discoveryClient, nil
}

func (e *Engine) resourceClient(
	ctx context.Context,
	dynamicClient dynamic.Interface,
	discoveryClient discovery.DiscoveryInterface,
	gvr schema.GroupVersionResource,
	namespace string,
) (dynamic.ResourceInterface, error) {
	resourceList, err := discoveryClient.ServerResourcesForGroupVersion(gvr.GroupVersion().String())
	if err != nil {
		return nil, err
	}

	namespaced := false
	for _, resource := range resourceList.APIResources {
		if resource.Name == gvr.Resource {
			namespaced = resource.Namespaced
			break
		}
	}

	if namespaced {
		if namespace == "" {
			namespace = metav1.NamespaceAll
		}
		return dynamicClient.Resource(gvr).Namespace(namespace), nil
	}

	return dynamicClient.Resource(gvr), nil
}

func requestToGVR(group, version, resource string) schema.GroupVersionResource {
	group = normalizeGroup(group)
	return schema.GroupVersionResource{
		Group:    group,
		Version:  version,
		Resource: resource,
	}
}

func normalizeGroup(group string) string {
	if group == "_" {
		return ""
	}

	return group
}
