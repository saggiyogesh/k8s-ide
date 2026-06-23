package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/discovery"
	cacheddiscovery "k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
	"sigs.k8s.io/yaml"
)

type ApiResourceDescriptor struct {
	Group        string   `json:"group"`
	Version      string   `json:"version"`
	Resource     string   `json:"resource"`
	Kind         string   `json:"kind"`
	Namespaced   bool     `json:"namespaced"`
	Verbs        []string `json:"verbs"`
	ShortNames   []string `json:"shortNames,omitempty"`
	Categories   []string `json:"categories,omitempty"`
	SingularName string   `json:"singularName,omitempty"`
}

type ResourceListResult struct {
	Items            []unstructured.Unstructured `json:"items"`
	Continue         string                      `json:"continue,omitempty"`
	ResourceVersion  string                      `json:"resourceVersion,omitempty"`
}

type ApplyResult struct {
	Action   string                    `json:"action"`
	Resource unstructured.Unstructured `json:"resource"`
}

type Engine struct {
	restConfig *rest.Config
	clientset  kubernetes.Interface
	discovery  discovery.DiscoveryInterface
	dynamic    dynamic.Interface
}

func NewEngine(restConfig *rest.Config, clientset kubernetes.Interface) (*Engine, error) {
	dyn, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("dynamic client: %w", err)
	}

	return &Engine{
		restConfig: restConfig,
		clientset:  clientset,
		discovery:  clientset.Discovery(),
		dynamic:    dyn,
	}, nil
}

func (e *Engine) Discover() ([]ApiResourceDescriptor, error) {
	groups, err := e.discovery.ServerGroups()
	if err != nil {
		return nil, err
	}

	var resources []ApiResourceDescriptor
	for _, group := range groups.Groups {
		gvList, err := e.discovery.ServerResourcesForGroupVersion(group.PreferredVersion.GroupVersion)
		if err != nil {
			continue
		}
		for _, res := range gvList.APIResources {
			if strings.Contains(res.Name, "/") {
				continue
			}
			gv, _ := schema.ParseGroupVersion(gvList.GroupVersion)
			resources = append(resources, ApiResourceDescriptor{
				Group:        gv.Group,
				Version:      gv.Version,
				Resource:     res.Name,
				Kind:         res.Kind,
				Namespaced:   res.Namespaced,
				Verbs:        res.Verbs,
				ShortNames:   res.ShortNames,
				Categories:   res.Categories,
				SingularName: res.SingularName,
			})
		}
	}
	return resources, nil
}

func (e *Engine) gvr(group, version, resource string) schema.GroupVersionResource {
	if group == "_" || group == "" {
		return schema.GroupVersionResource{Group: "", Version: version, Resource: resource}
	}
	return schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
}

func (e *Engine) resourceInterface(gvr schema.GroupVersionResource, namespace string) dynamic.ResourceInterface {
	res := e.dynamic.Resource(gvr)
	if namespace != "" {
		return res.Namespace(namespace)
	}
	return res
}

func (e *Engine) List(ctx context.Context, group, version, resource, namespace, labelSelector, fieldSelector, continueToken string, limit int64) (*ResourceListResult, error) {
	gvr := e.gvr(group, version, resource)
	opts := metav1.ListOptions{
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Continue:      continueToken,
	}
	if limit > 0 {
		opts.Limit = limit
	}

	var list *unstructured.UnstructuredList
	var err error
	if namespace != "" {
		list, err = e.resourceInterface(gvr, namespace).List(ctx, opts)
	} else {
		list, err = e.resourceInterface(gvr, "").List(ctx, opts)
	}
	if err != nil {
		return nil, err
	}

	return &ResourceListResult{
		Items:           list.Items,
		Continue:        list.GetContinue(),
		ResourceVersion: list.GetResourceVersion(),
	}, nil
}

func (e *Engine) Get(ctx context.Context, group, version, resource, namespace, name string) (*unstructured.Unstructured, error) {
	gvr := e.gvr(group, version, resource)
	return e.resourceInterface(gvr, namespace).Get(ctx, name, metav1.GetOptions{})
}

func (e *Engine) Delete(ctx context.Context, group, version, resource, namespace, name string) error {
	gvr := e.gvr(group, version, resource)
	return e.resourceInterface(gvr, namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

func (e *Engine) ApplyYAML(ctx context.Context, yamlContent string) (*ApplyResult, error) {
	var obj unstructured.Unstructured
	if err := yaml.Unmarshal([]byte(yamlContent), &obj.Object); err != nil {
		return nil, fmt.Errorf("parse yaml: %w", err)
	}

	gv, err := schema.ParseGroupVersion(obj.GetAPIVersion())
	if err != nil {
		return nil, err
	}

	mapper := restmapper.NewDeferredDiscoveryRESTMapper(cacheddiscovery.NewMemCacheClient(e.discovery))
	mapping, err := mapper.RESTMapping(obj.GroupVersionKind().GroupKind(), gv.Version)
	if err != nil {
		return nil, fmt.Errorf("rest mapping: %w", err)
	}

	gvr := mapping.Resource
	namespace := obj.GetNamespace()
	name := obj.GetName()

	existing, err := e.resourceInterface(gvr, namespace).Get(ctx, name, metav1.GetOptions{})
	action := "created"
	if err == nil {
		action = "updated"
		obj.SetResourceVersion(existing.GetResourceVersion())
	} else if !isNotFound(err) {
		return nil, err
	}

	data, err := json.Marshal(obj.Object)
	if err != nil {
		return nil, err
	}

	var result *unstructured.Unstructured
	if action == "created" {
		result, err = e.resourceInterface(gvr, namespace).Create(ctx, &obj, metav1.CreateOptions{})
	} else {
		result, err = e.resourceInterface(gvr, namespace).Patch(ctx, name, types.ApplyPatchType, data, metav1.PatchOptions{FieldManager: "k8s-ide"})
	}
	if err != nil {
		return nil, err
	}

	return &ApplyResult{Action: action, Resource: *result}, nil
}

func (e *Engine) Watch(ctx context.Context, group, version, resource, namespace, labelSelector, fieldSelector, resourceVersion string) (watch.Interface, error) {
	gvr := e.gvr(group, version, resource)
	opts := metav1.ListOptions{
		LabelSelector:   labelSelector,
		FieldSelector:   fieldSelector,
		ResourceVersion: resourceVersion,
		Watch:           true,
	}
	if namespace != "" {
		return e.resourceInterface(gvr, namespace).Watch(ctx, opts)
	}
	return e.resourceInterface(gvr, "").Watch(ctx, opts)
}

func isNotFound(err error) bool {
	return err != nil && strings.Contains(err.Error(), "not found")
}

func ObjectToYAML(obj *unstructured.Unstructured) (string, error) {
	data, err := json.Marshal(obj.Object)
	if err != nil {
		return "", err
	}
	out, err := yaml.JSONToYAML(data)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func ReadBody(r io.Reader) (string, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
