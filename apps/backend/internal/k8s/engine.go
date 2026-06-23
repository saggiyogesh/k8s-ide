package k8s

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	meta "k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	k8syaml "k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/discovery"
	cachedmemory "k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
	"k8s.io/client-go/restmapper"
	"k8s.io/client-go/tools/clientcmd"
)

type Engine struct{}

type ClusterContext struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	User      string `json:"user"`
	Namespace string `json:"namespace,omitempty"`
	Current   bool   `json:"current"`
}

type SessionInfo struct {
	ContextName    string `json:"contextName"`
	Cluster        string `json:"cluster"`
	Namespace      string `json:"namespace,omitempty"`
	KubeconfigPath string `json:"kubeconfigPath"`
	OpenedAt       string `json:"openedAt"`
	Connected      bool   `json:"connected"`
}

type ResourceCapabilities struct {
	ViewYAML    bool `json:"viewYaml"`
	EditYAML    bool `json:"editYaml"`
	Delete      bool `json:"delete"`
	Watch       bool `json:"watch"`
	Logs        bool `json:"logs"`
	Exec        bool `json:"exec"`
	Scale       bool `json:"scale"`
	Restart     bool `json:"restart"`
	PortForward bool `json:"portForward"`
}

type ResourceDescriptor struct {
	Group        string               `json:"group"`
	Version      string               `json:"version"`
	Kind         string               `json:"kind"`
	Resource     string               `json:"resource"`
	SingularName string               `json:"singularName"`
	Namespaced   bool                 `json:"namespaced"`
	Verbs        []string             `json:"verbs"`
	ShortNames   []string             `json:"shortNames,omitempty"`
	Categories   []string             `json:"categories,omitempty"`
	Scope        string               `json:"scope"`
	Capabilities ResourceCapabilities `json:"capabilities"`
}

type ResourceListResult struct {
	Items           []map[string]any `json:"items"`
	ContinueToken   string           `json:"continue,omitempty"`
	ResourceVersion string           `json:"resourceVersion,omitempty"`
}

type ResourceRef struct {
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`
}

type ApplyResult struct {
	Resources []ResourceRef `json:"resources"`
}

type ListOptions struct {
	Group         string
	Version       string
	Resource      string
	Namespace     string
	ContinueToken string
	FieldSelector string
	LabelSelector string
	Limit         int64
}

type GetOptions struct {
	Group     string
	Version   string
	Resource  string
	Namespace string
	Name      string
}

type DeleteOptions struct {
	Group     string
	Version   string
	Resource  string
	Namespace string
	Name      string
}

func NewEngine() *Engine {
	return &Engine{}
}

func (e *Engine) ResolveKubeconfig(path string) string {
	if path != "" {
		return path
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return ".kube/config"
	}

	return filepath.Join(home, ".kube", "config")
}

func (e *Engine) ListContexts(path string) ([]ClusterContext, error) {
	rawConfig, err := e.loadRawConfig(e.ResolveKubeconfig(path))
	if err != nil {
		return nil, err
	}

	contexts := make([]ClusterContext, 0, len(rawConfig.Contexts))
	for name, ctx := range rawConfig.Contexts {
		contexts = append(contexts, ClusterContext{
			Name:      name,
			Cluster:   ctx.Cluster,
			User:      ctx.AuthInfo,
			Namespace: ctx.Namespace,
			Current:   name == rawConfig.CurrentContext,
		})
	}

	sort.Slice(contexts, func(i, j int) bool {
		if contexts[i].Current != contexts[j].Current {
			return contexts[i].Current
		}
		return contexts[i].Name < contexts[j].Name
	})

	return contexts, nil
}

func (e *Engine) OpenSession(path, contextName string) (SessionInfo, error) {
	resolvedPath := e.ResolveKubeconfig(path)
	contexts, err := e.ListContexts(resolvedPath)
	if err != nil {
		return SessionInfo{}, err
	}
	if len(contexts) == 0 {
		return SessionInfo{}, fmt.Errorf("no kubeconfig contexts found at %s", resolvedPath)
	}

	selected := contexts[0]
	if contextName != "" {
		found := false
		for _, item := range contexts {
			if item.Name == contextName {
				selected = item
				found = true
				break
			}
		}
		if !found {
			return SessionInfo{}, fmt.Errorf("context %q was not found in %s", contextName, resolvedPath)
		}
	}

	return SessionInfo{
		ContextName:    selected.Name,
		Cluster:        selected.Cluster,
		Namespace:      selected.Namespace,
		KubeconfigPath: resolvedPath,
		OpenedAt:       time.Now().UTC().Format(time.RFC3339),
		Connected:      true,
	}, nil
}

func (e *Engine) Discovery(session SessionInfo) ([]ResourceDescriptor, error) {
	discoveryClient, _, err := e.clientsForSession(session)
	if err != nil {
		return nil, err
	}

	preferred, err := discoveryClient.ServerPreferredResources()
	if err != nil && !discovery.IsGroupDiscoveryFailedError(err) {
		return nil, err
	}

	resources := make([]ResourceDescriptor, 0)
	for _, resourceList := range preferred {
		groupVersion, err := schema.ParseGroupVersion(resourceList.GroupVersion)
		if err != nil {
			continue
		}

		for _, item := range resourceList.APIResources {
			if strings.Contains(item.Name, "/") {
				continue
			}

			resources = append(resources, ResourceDescriptor{
				Group:        groupVersion.Group,
				Version:      groupVersion.Version,
				Kind:         item.Kind,
				Resource:     item.Name,
				SingularName: item.SingularName,
				Namespaced:   item.Namespaced,
				Verbs:        item.Verbs,
				ShortNames:   item.ShortNames,
				Categories:   item.Categories,
				Scope:        scopeFor(item.Namespaced),
				Capabilities: capabilitiesFor(item.Kind, item.Verbs),
			})
		}
	}

	sort.Slice(resources, func(i, j int) bool {
		if resources[i].Group == resources[j].Group {
			if resources[i].Version == resources[j].Version {
				return resources[i].Resource < resources[j].Resource
			}
			return resources[i].Version < resources[j].Version
		}
		return resources[i].Group < resources[j].Group
	})

	return resources, nil
}

func (e *Engine) ListResources(ctx context.Context, session SessionInfo, opts ListOptions) (ResourceListResult, error) {
	_, dynamicClient, err := e.clientsForSession(session)
	if err != nil {
		return ResourceListResult{}, err
	}

	resourceClient := dynamicClient.Resource(schema.GroupVersionResource{Group: opts.Group, Version: opts.Version, Resource: opts.Resource})
	var client dynamic.ResourceInterface = resourceClient
	if opts.Namespace != "" {
		client = resourceClient.Namespace(opts.Namespace)
	}

	list, err := client.List(ctx, metav1.ListOptions{
		Continue:      opts.ContinueToken,
		FieldSelector: opts.FieldSelector,
		LabelSelector: opts.LabelSelector,
		Limit:         opts.Limit,
	})
	if err != nil {
		return ResourceListResult{}, err
	}

	items := make([]map[string]any, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, item.UnstructuredContent())
	}

	return ResourceListResult{
		Items:           items,
		ContinueToken:   list.GetContinue(),
		ResourceVersion: list.GetResourceVersion(),
	}, nil
}

func (e *Engine) GetResource(ctx context.Context, session SessionInfo, opts GetOptions) (map[string]any, error) {
	_, dynamicClient, err := e.clientsForSession(session)
	if err != nil {
		return nil, err
	}

	resourceClient := dynamicClient.Resource(schema.GroupVersionResource{Group: opts.Group, Version: opts.Version, Resource: opts.Resource})
	var client dynamic.ResourceInterface = resourceClient
	if opts.Namespace != "" {
		client = resourceClient.Namespace(opts.Namespace)
	}

	resource, err := client.Get(ctx, opts.Name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	return resource.UnstructuredContent(), nil
}

func (e *Engine) DeleteResource(ctx context.Context, session SessionInfo, opts DeleteOptions) error {
	_, dynamicClient, err := e.clientsForSession(session)
	if err != nil {
		return err
	}

	resourceClient := dynamicClient.Resource(schema.GroupVersionResource{Group: opts.Group, Version: opts.Version, Resource: opts.Resource})
	var client dynamic.ResourceInterface = resourceClient
	if opts.Namespace != "" {
		client = resourceClient.Namespace(opts.Namespace)
	}

	return client.Delete(ctx, opts.Name, metav1.DeleteOptions{})
}

func (e *Engine) ApplyYAML(ctx context.Context, session SessionInfo, manifest string) (ApplyResult, error) {
	discoveryClient, dynamicClient, err := e.clientsForSession(session)
	if err != nil {
		return ApplyResult{}, err
	}

	mapper := restmapper.NewDeferredDiscoveryRESTMapper(cachedmemory.NewMemCacheClient(discoveryClient))
	decoder := k8syaml.NewYAMLOrJSONDecoder(strings.NewReader(manifest), 4096)
	result := ApplyResult{Resources: []ResourceRef{}}

	for {
		raw := map[string]any{}
		if err := decoder.Decode(&raw); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return ApplyResult{}, err
		}
		if len(raw) == 0 {
			continue
		}

		object := &unstructured.Unstructured{Object: raw}
		if object.GetName() == "" {
			return ApplyResult{}, fmt.Errorf("manifest for kind %q is missing metadata.name", object.GetKind())
		}

		mapping, err := mapper.RESTMapping(object.GroupVersionKind().GroupKind(), object.GroupVersionKind().Version)
		if err != nil {
			return ApplyResult{}, err
		}

		namespaceableClient := dynamicClient.Resource(mapping.Resource)
		var resourceClient dynamic.ResourceInterface = namespaceableClient
		if mapping.Scope.Name() != meta.RESTScopeNameRoot {
			namespace := object.GetNamespace()
			if namespace == "" {
				namespace = session.Namespace
				if namespace == "" {
					namespace = "default"
				}
				object.SetNamespace(namespace)
			}
			resourceClient = namespaceableClient.Namespace(object.GetNamespace())
		}

		payload, err := json.Marshal(object.Object)
		if err != nil {
			return ApplyResult{}, err
		}

		force := true
		applied, err := resourceClient.Patch(ctx, object.GetName(), types.ApplyPatchType, payload, metav1.PatchOptions{
			FieldManager: "k8s-ide",
			Force:        &force,
		})
		if err != nil {
			return ApplyResult{}, err
		}

		result.Resources = append(result.Resources, ResourceRef{
			Group:     mapping.Resource.Group,
			Version:   mapping.Resource.Version,
			Resource:  mapping.Resource.Resource,
			Namespace: applied.GetNamespace(),
			Name:      applied.GetName(),
			Kind:      applied.GetKind(),
		})
	}

	return result, nil
}

func (e *Engine) loadRawConfig(path string) (clientcmdapi.Config, error) {
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return clientcmdapi.Config{}, nil
		}
		return clientcmdapi.Config{}, err
	}

	config, err := clientcmd.LoadFromFile(path)
	if err != nil {
		return clientcmdapi.Config{}, err
	}

	return *config, nil
}

func (e *Engine) clientsForSession(session SessionInfo) (discovery.DiscoveryInterface, dynamic.Interface, error) {
	rawConfig, err := e.loadRawConfig(session.KubeconfigPath)
	if err != nil {
		return nil, nil, err
	}

	clientConfig := clientcmd.NewNonInteractiveClientConfig(rawConfig, session.ContextName, &clientcmd.ConfigOverrides{}, nil)
	restConfig, err := clientConfig.ClientConfig()
	if err != nil {
		return nil, nil, err
	}

	discoveryClient, err := discovery.NewDiscoveryClientForConfig(restConfig)
	if err != nil {
		return nil, nil, err
	}

	dynamicClient, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		return nil, nil, err
	}

	return discoveryClient, dynamicClient, nil
}

func scopeFor(namespaced bool) string {
	if namespaced {
		return "Namespaced"
	}
	return "Cluster"
}

func capabilitiesFor(kind string, verbs []string) ResourceCapabilities {
	verbSet := map[string]bool{}
	for _, verb := range verbs {
		verbSet[verb] = true
	}

	workloadKind := strings.EqualFold(kind, "Deployment") ||
		strings.EqualFold(kind, "StatefulSet") ||
		strings.EqualFold(kind, "DaemonSet")

	podLike := strings.EqualFold(kind, "Pod")
	serviceLike := strings.EqualFold(kind, "Service")

	return ResourceCapabilities{
		ViewYAML:    true,
		EditYAML:    verbSet["patch"] || verbSet["update"],
		Delete:      verbSet["delete"],
		Watch:       verbSet["watch"],
		Logs:        podLike || workloadKind,
		Exec:        podLike || workloadKind,
		Scale:       workloadKind,
		Restart:     workloadKind,
		PortForward: podLike || workloadKind || serviceLike,
	}
}
