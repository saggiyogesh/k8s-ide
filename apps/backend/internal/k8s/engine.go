package k8s

import (
	"context"
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

type ApiResourceDescriptor struct {
	Group      string   `json:"group"`
	Version    string   `json:"version"`
	Resource   string   `json:"resource"`
	Kind       string   `json:"kind"`
	Namespaced bool     `json:"namespaced"`
	Verbs      []string `json:"verbs"`
	ShortNames []string `json:"shortNames,omitempty"`
	Categories []string `json:"categories,omitempty"`
}

type Engine struct {
	discovery discovery.DiscoveryInterface
	dynamic   dynamic.Interface
}

func NewEngine(restConfig *rest.Config) (*Engine, error) {
	discoveryClient, err := discovery.NewDiscoveryClientForConfig(restConfig)
	if err != nil {
		return nil, err
	}

	dynamicClient, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		return nil, err
	}

	return &Engine{
		discovery: discoveryClient,
		dynamic:   dynamicClient,
	}, nil
}

func NewEngineFromClientset(clientset kubernetes.Interface, restConfig *rest.Config) (*Engine, error) {
	dynamicClient, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		return nil, err
	}
	return &Engine{
		discovery: clientset.Discovery(),
		dynamic:   dynamicClient,
	}, nil
}

func (e *Engine) Discover(ctx context.Context) ([]ApiResourceDescriptor, error) {
	groups, err := e.discovery.ServerGroups()
	if err != nil {
		return nil, err
	}

	descriptors := make([]ApiResourceDescriptor, 0, 256)
	for _, group := range groups.Groups {
		for _, version := range group.Versions {
			resources, err := e.discovery.ServerResourcesForGroupVersion(version.GroupVersion)
			if err != nil {
				continue
			}
			for _, resource := range resources.APIResources {
				if strings.Contains(resource.Name, "/") {
					continue
				}
				descriptors = append(descriptors, ApiResourceDescriptor{
					Group:      group.Name,
					Version:    version.Version,
					Resource:   resource.Name,
					Kind:       resource.Kind,
					Namespaced: resource.Namespaced,
					Verbs:      resource.Verbs,
					ShortNames: resource.ShortNames,
					Categories: resource.Categories,
				})
			}
		}
	}

	return descriptors, nil
}

func (e *Engine) GVR(group, version, resource string) schema.GroupVersionResource {
	return schema.GroupVersionResource{
		Group:    group,
		Version:  version,
		Resource: resource,
	}
}

func (e *Engine) List(ctx context.Context, group, version, resource, namespace, labelSelector, fieldSelector, continueToken string, limit int64) (map[string]interface{}, error) {
	gvr := e.GVR(group, version, resource)
	var resourceInterface dynamic.ResourceInterface
	if namespace != "" {
		resourceInterface = e.dynamic.Resource(gvr).Namespace(namespace)
	} else {
		resourceInterface = e.dynamic.Resource(gvr)
	}

	opts := metav1.ListOptions{
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Continue:      continueToken,
	}
	if limit > 0 {
		opts.Limit = limit
	}

	list, err := resourceInterface.List(ctx, opts)
	if err != nil {
		return nil, err
	}
	return list.UnstructuredContent(), nil
}

func (e *Engine) Get(ctx context.Context, group, version, resource, namespace, name string) (map[string]interface{}, error) {
	gvr := e.GVR(group, version, resource)
	var resourceInterface dynamic.ResourceInterface
	if namespace != "" {
		resourceInterface = e.dynamic.Resource(gvr).Namespace(namespace)
	} else {
		resourceInterface = e.dynamic.Resource(gvr)
	}

	obj, err := resourceInterface.Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	return obj.UnstructuredContent(), nil
}

func (e *Engine) Delete(ctx context.Context, group, version, resource, namespace, name string) error {
	gvr := e.GVR(group, version, resource)
	var resourceInterface dynamic.ResourceInterface
	if namespace != "" {
		resourceInterface = e.dynamic.Resource(gvr).Namespace(namespace)
	} else {
		resourceInterface = e.dynamic.Resource(gvr)
	}
	return resourceInterface.Delete(ctx, name, metav1.DeleteOptions{})
}

func (e *Engine) Dynamic() dynamic.Interface {
	return e.dynamic
}

func ParseGroupVersion(apiVersion string) (string, string, error) {
	if apiVersion == "" {
		return "", "", fmt.Errorf("missing apiVersion")
	}
	if !strings.Contains(apiVersion, "/") {
		return "", apiVersion, nil
	}
	parts := strings.SplitN(apiVersion, "/", 2)
	return parts[0], parts[1], nil
}
