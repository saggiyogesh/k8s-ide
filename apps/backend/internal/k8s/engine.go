package k8s

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
	"k8s.io/client-go/tools/clientcmd"
)

type ClusterContext struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	User      string `json:"user"`
	Namespace string `json:"namespace,omitempty"`
	Current   bool   `json:"current"`
}

type ApiResourceDescriptor struct {
	Group            string   `json:"group"`
	Version          string   `json:"version"`
	Resource         string   `json:"resource"`
	Kind             string   `json:"kind"`
	SingularResource string   `json:"singularResource"`
	Namespaced       bool     `json:"namespaced"`
	Verbs            []string `json:"verbs"`
	ShortNames       []string `json:"shortNames"`
	Categories       []string `json:"categories"`
}

type ResourceRef struct {
	Context   string `json:"context"`
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
}

type ResourceListResult struct {
	Items           []unstructured.Unstructured `json:"items"`
	ContinueToken   string                     `json:"continue,omitempty"`
	ResourceVersion string                     `json:"resourceVersion,omitempty"`
}

type ActionResult struct {
	OK      bool                   `json:"ok"`
	Message string                 `json:"message,omitempty"`
	Details map[string]interface{} `json:"details,omitempty"`
}

type Engine struct {
	kubeconfigPath string
}

func NewEngine(kubeconfigPath string) *Engine {
	return &Engine{kubeconfigPath: kubeconfigPath}
}

func defaultKubeconfigPath() string {
	if explicit := os.Getenv("KUBECONFIG"); explicit != "" {
		return explicit
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	return filepath.Join(home, ".kube", "config")
}

func normalizeGroup(group string) string {
	if group == "" || group == "core" {
		return ""
	}

	return group
}

func (e *Engine) resolvedKubeconfigPath() string {
	if e.kubeconfigPath != "" {
		return e.kubeconfigPath
	}

	return defaultKubeconfigPath()
}

func (e *Engine) loadConfig() (*clientcmdapi.Config, error) {
	path := e.resolvedKubeconfigPath()
	if path == "" {
		return nil, errors.New("unable to resolve kubeconfig path")
	}

	config, err := clientcmd.LoadFromFile(path)
	if err != nil {
		return nil, fmt.Errorf("load kubeconfig: %w", err)
	}

	return config, nil
}

func (e *Engine) restConfigForContext(contextName string) (*rest.Config, *clientcmdapi.Config, error) {
	rawConfig, err := e.loadConfig()
	if err != nil {
		return nil, nil, err
	}

	if contextName == "" {
		contextName = rawConfig.CurrentContext
	}

	if _, ok := rawConfig.Contexts[contextName]; !ok {
		return nil, nil, fmt.Errorf("context %q not found in kubeconfig", contextName)
	}

	overrides := &clientcmd.ConfigOverrides{CurrentContext: contextName}
	clientConfig := clientcmd.NewDefaultClientConfig(*rawConfig, overrides)
	restConfig, err := clientConfig.ClientConfig()
	if err != nil {
		return nil, nil, fmt.Errorf("build rest config: %w", err)
	}

	return restConfig, rawConfig, nil
}

func (e *Engine) dynamicForContext(contextName string) (dynamic.Interface, *restmapper.DeferredDiscoveryRESTMapper, error) {
	restConfig, _, err := e.restConfigForContext(contextName)
	if err != nil {
		return nil, nil, err
	}

	dynamicClient, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		return nil, nil, fmt.Errorf("create dynamic client: %w", err)
	}

	discoveryClient, err := discovery.NewDiscoveryClientForConfig(restConfig)
	if err != nil {
		return nil, nil, fmt.Errorf("create discovery client: %w", err)
	}

	mapper := restmapper.NewDeferredDiscoveryRESTMapper(memoryCachedDiscovery{DiscoveryInterface: discoveryClient})
	return dynamicClient, mapper, nil
}

type memoryCachedDiscovery struct {
	discovery.DiscoveryInterface
}

func (memoryCachedDiscovery) Fresh() bool { return true }
func (memoryCachedDiscovery) Invalidate() {}

func (e *Engine) ListContexts() ([]ClusterContext, error) {
	config, err := e.loadConfig()
	if err != nil {
		return nil, err
	}

	result := make([]ClusterContext, 0, len(config.Contexts))
	for name, ctx := range config.Contexts {
		result = append(result, ClusterContext{
			Name:      name,
			Cluster:   ctx.Cluster,
			User:      ctx.AuthInfo,
			Namespace: ctx.Namespace,
			Current:   name == config.CurrentContext,
		})
	}

	return result, nil
}

func (e *Engine) OpenSession(contextName string) (map[string]string, error) {
	_, rawConfig, err := e.restConfigForContext(contextName)
	if err != nil {
		return nil, err
	}

	if contextName == "" {
		contextName = rawConfig.CurrentContext
	}

	namespace := rawConfig.Contexts[contextName].Namespace

	return map[string]string{
		"context":     contextName,
		"namespace":   namespace,
		"connectedAt": time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (e *Engine) Discovery(contextName string) ([]ApiResourceDescriptor, error) {
	restConfig, _, err := e.restConfigForContext(contextName)
	if err != nil {
		return nil, err
	}

	discoveryClient, err := discovery.NewDiscoveryClientForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("create discovery client: %w", err)
	}

	resourceLists, err := discoveryClient.ServerPreferredResources()
	if err != nil && !discovery.IsGroupDiscoveryFailedError(err) {
		return nil, fmt.Errorf("fetch preferred resources: %w", err)
	}

	result := make([]ApiResourceDescriptor, 0)
	for _, resourceList := range resourceLists {
		gv, parseErr := schema.ParseGroupVersion(resourceList.GroupVersion)
		if parseErr != nil {
			continue
		}

		for _, resource := range resourceList.APIResources {
			if strings.Contains(resource.Name, "/") {
				continue
			}

			result = append(result, ApiResourceDescriptor{
				Group:            gv.Group,
				Version:          gv.Version,
				Resource:         resource.Name,
				Kind:             resource.Kind,
				SingularResource: resource.SingularName,
				Namespaced:       resource.Namespaced,
				Verbs:            resource.Verbs,
				ShortNames:       resource.ShortNames,
				Categories:       resource.Categories,
			})
		}
	}

	return result, nil
}

func (e *Engine) resourceInterface(contextName, group, version, resource, namespace string) (dynamic.ResourceInterface, schema.GroupVersionResource, error) {
	gvr := schema.GroupVersionResource{
		Group:    normalizeGroup(group),
		Version:  version,
		Resource: resource,
	}

	dynamicClient, _, err := e.dynamicForContext(contextName)
	if err != nil {
		return nil, schema.GroupVersionResource{}, err
	}

	if namespace != "" {
		return dynamicClient.Resource(gvr).Namespace(namespace), gvr, nil
	}

	return dynamicClient.Resource(gvr), gvr, nil
}

func (e *Engine) ListResources(
	ctx context.Context,
	contextName, group, version, resource, namespace, labelSelector, fieldSelector string,
) (*ResourceListResult, error) {
	resourceClient, _, err := e.resourceInterface(contextName, group, version, resource, namespace)
	if err != nil {
		return nil, err
	}

	list, err := resourceClient.List(ctx, metav1.ListOptions{
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return nil, fmt.Errorf("list resources: %w", err)
	}

	return &ResourceListResult{
		Items:           list.Items,
		ContinueToken:   list.GetContinue(),
		ResourceVersion: list.GetResourceVersion(),
	}, nil
}

func (e *Engine) GetResource(ctx context.Context, ref ResourceRef) (*unstructured.Unstructured, error) {
	resourceClient, _, err := e.resourceInterface(ref.Context, ref.Group, ref.Version, ref.Resource, ref.Namespace)
	if err != nil {
		return nil, err
	}

	item, err := resourceClient.Get(ctx, ref.Name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("get resource: %w", err)
	}

	return item, nil
}

func (e *Engine) DeleteResource(ctx context.Context, ref ResourceRef) error {
	resourceClient, _, err := e.resourceInterface(ref.Context, ref.Group, ref.Version, ref.Resource, ref.Namespace)
	if err != nil {
		return err
	}

	if err := resourceClient.Delete(ctx, ref.Name, metav1.DeleteOptions{}); err != nil {
		return fmt.Errorf("delete resource: %w", err)
	}

	return nil
}

func (e *Engine) ApplyYAML(ctx context.Context, contextName string, manifest string) ([]ResourceRef, error) {
	dynamicClient, mapper, err := e.dynamicForContext(contextName)
	if err != nil {
		return nil, err
	}

	decoder := yaml.NewYAMLOrJSONDecoder(bytes.NewBufferString(manifest), 4096)
	appliedRefs := make([]ResourceRef, 0)

	for {
		var obj map[string]interface{}
		if err := decoder.Decode(&obj); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return nil, fmt.Errorf("decode manifest: %w", err)
		}
		if len(obj) == 0 {
			continue
		}

		item := &unstructured.Unstructured{Object: obj}
		mapping, err := mapper.RESTMapping(item.GroupVersionKind().GroupKind(), item.GroupVersionKind().Version)
		if err != nil {
			return nil, fmt.Errorf("resolve rest mapping: %w", err)
		}

		rawJSON, err := json.Marshal(item.Object)
		if err != nil {
			return nil, fmt.Errorf("encode manifest: %w", err)
		}

		namespace := item.GetNamespace()
		var resourceClient dynamic.ResourceInterface
		if namespace != "" {
			resourceClient = dynamicClient.Resource(mapping.Resource).Namespace(namespace)
		} else {
			resourceClient = dynamicClient.Resource(mapping.Resource)
		}

		if _, err := resourceClient.Patch(ctx, item.GetName(), types.ApplyPatchType, rawJSON, metav1.PatchOptions{
			FieldManager: "k8s-ide",
		}); err != nil {
			return nil, fmt.Errorf("apply resource %s: %w", item.GetName(), err)
		}

		appliedRefs = append(appliedRefs, ResourceRef{
			Context:   contextName,
			Group:     mapping.Resource.Group,
			Version:   mapping.Resource.Version,
			Resource:  mapping.Resource.Resource,
			Namespace: namespace,
			Name:      item.GetName(),
		})
	}

	return appliedRefs, nil
}

func (e *Engine) ScaleResource(ctx context.Context, ref ResourceRef, replicas int64) (*ActionResult, error) {
	resourceClient, _, err := e.resourceInterface(ref.Context, ref.Group, ref.Version, ref.Resource, ref.Namespace)
	if err != nil {
		return nil, err
	}

	patch := map[string]any{
		"spec": map[string]any{
			"replicas": replicas,
		},
	}

	body, err := json.Marshal(patch)
	if err != nil {
		return nil, err
	}

	if _, err := resourceClient.Patch(ctx, ref.Name, types.MergePatchType, body, metav1.PatchOptions{}); err != nil {
		return nil, fmt.Errorf("scale resource: %w", err)
	}

	return &ActionResult{
		OK:      true,
		Message: fmt.Sprintf("scaled %s to %d replicas", ref.Name, replicas),
	}, nil
}

func (e *Engine) RestartResource(ctx context.Context, ref ResourceRef) (*ActionResult, error) {
	resourceClient, _, err := e.resourceInterface(ref.Context, ref.Group, ref.Version, ref.Resource, ref.Namespace)
	if err != nil {
		return nil, err
	}

	patch := map[string]any{
		"spec": map[string]any{
			"template": map[string]any{
				"metadata": map[string]any{
					"annotations": map[string]string{
						"kubectl.kubernetes.io/restartedAt": time.Now().UTC().Format(time.RFC3339),
					},
				},
			},
		},
	}

	body, err := json.Marshal(patch)
	if err != nil {
		return nil, err
	}

	if _, err := resourceClient.Patch(ctx, ref.Name, types.MergePatchType, body, metav1.PatchOptions{}); err != nil {
		return nil, fmt.Errorf("restart resource: %w", err)
	}

	return &ActionResult{
		OK:      true,
		Message: fmt.Sprintf("restarted %s", ref.Name),
	}, nil
}
