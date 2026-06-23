package k8s

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"time"

	"github.com/k8s-ide/k8s-ide/apps/backend/internal/session"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	meta "k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/yaml"
	k8swatch "k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/restmapper"
)

type ApiResourceDescriptor struct {
	Group            string   `json:"group"`
	Version          string   `json:"version"`
	Kind             string   `json:"kind"`
	Resource         string   `json:"resource"`
	SingularResource string   `json:"singularResource"`
	ShortNames       []string `json:"shortNames"`
	Categories       []string `json:"categories"`
	Namespaced       bool     `json:"namespaced"`
	Verbs            []string `json:"verbs"`
}

type ResourceQuery struct {
	Context       string
	Group         string
	Version       string
	Resource      string
	Namespace     string
	Name          string
	LabelSelector string
	FieldSelector string
	Limit         int64
}

type ApplyResult struct {
	Results []AppliedResource `json:"results"`
}

type AppliedResource struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	Operation string `json:"operation"`
}

type Engine struct {
	sessions *session.Manager
}

func NewEngine(sessions *session.Manager) *Engine {
	return &Engine{sessions: sessions}
}

func (e *Engine) Discovery(ctx context.Context, requestContext string) ([]ApiResourceDescriptor, error) {
	discoveryClient, err := e.discoveryClient(requestContext, "")
	if err != nil {
		return nil, err
	}

	resourceLists, err := discoveryClient.ServerPreferredResources()
	if err != nil && !discovery.IsGroupDiscoveryFailedError(err) {
		return nil, err
	}

	descriptors := make([]ApiResourceDescriptor, 0)
	for _, list := range resourceLists {
		groupVersion, err := schema.ParseGroupVersion(list.GroupVersion)
		if err != nil {
			continue
		}

		for _, resource := range list.APIResources {
			if strings.Contains(resource.Name, "/") {
				continue
			}

			verbs := make([]string, 0, len(resource.Verbs))
			for _, verb := range resource.Verbs {
				verbs = append(verbs, verb)
			}

			descriptors = append(descriptors, ApiResourceDescriptor{
				Group:            groupVersion.Group,
				Version:          groupVersion.Version,
				Kind:             resource.Kind,
				Resource:         resource.Name,
				SingularResource: resource.SingularName,
				ShortNames:       resource.ShortNames,
				Categories:       resource.Categories,
				Namespaced:       resource.Namespaced,
				Verbs:            verbs,
			})
		}
	}

	return descriptors, nil
}

func (e *Engine) ListResources(ctx context.Context, query ResourceQuery) (*unstructured.UnstructuredList, error) {
	resource, err := e.resourceInterface(query)
	if err != nil {
		return nil, err
	}

	return resource.List(ctx, metav1.ListOptions{
		LabelSelector: query.LabelSelector,
		FieldSelector: query.FieldSelector,
		Limit:         query.Limit,
	})
}

func (e *Engine) GetResource(ctx context.Context, query ResourceQuery) (*unstructured.Unstructured, error) {
	resource, err := e.resourceInterface(query)
	if err != nil {
		return nil, err
	}

	if query.Name == "" {
		return nil, errors.New("resource name is required")
	}

	return resource.Get(ctx, query.Name, metav1.GetOptions{})
}

func (e *Engine) DeleteResource(ctx context.Context, query ResourceQuery) error {
	resource, err := e.resourceInterface(query)
	if err != nil {
		return err
	}

	if query.Name == "" {
		return errors.New("resource name is required")
	}

	return resource.Delete(ctx, query.Name, metav1.DeleteOptions{})
}

func (e *Engine) ApplyYAML(ctx context.Context, requestContext string, manifest string) (*ApplyResult, error) {
	dynamicClient, mapper, err := e.dynamicClientAndMapper(requestContext, "")
	if err != nil {
		return nil, err
	}

	decoder := yaml.NewYAMLOrJSONDecoder(bytes.NewBufferString(manifest), 4096)
	result := &ApplyResult{Results: []AppliedResource{}}

	for {
		var item map[string]any
		if err := decoder.Decode(&item); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return nil, err
		}

		if len(item) == 0 {
			continue
		}

		object := &unstructured.Unstructured{Object: item}
		gvk := object.GroupVersionKind()
		mapping, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
		if err != nil {
			return nil, err
		}

		namespaceableResource := dynamicClient.Resource(mapping.Resource)
		var resource dynamic.ResourceInterface = namespaceableResource
		namespace := object.GetNamespace()
		if mapping.Scope.Name() == meta.RESTScopeNameNamespace {
			if namespace == "" {
				namespace = "default"
				object.SetNamespace(namespace)
			}
			resource = namespaceableResource.Namespace(namespace)
		}

		existing, err := resource.Get(ctx, object.GetName(), metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				created, createErr := resource.Create(ctx, object, metav1.CreateOptions{})
				if createErr != nil {
					return nil, createErr
				}
				result.Results = append(result.Results, AppliedResource{
					Kind:      created.GetKind(),
					Name:      created.GetName(),
					Namespace: created.GetNamespace(),
					Operation: "created",
				})
				continue
			}
			return nil, err
		}

		object.SetResourceVersion(existing.GetResourceVersion())
		updated, err := resource.Update(ctx, object, metav1.UpdateOptions{})
		if err != nil {
			return nil, err
		}

		result.Results = append(result.Results, AppliedResource{
			Kind:      updated.GetKind(),
			Name:      updated.GetName(),
			Namespace: updated.GetNamespace(),
			Operation: "configured",
		})
	}

	return result, nil
}

func (e *Engine) Scale(ctx context.Context, query ResourceQuery, replicas int64) error {
	resource, err := e.GetResource(ctx, query)
	if err != nil {
		return err
	}

	if err := unstructured.SetNestedField(resource.Object, replicas, "spec", "replicas"); err != nil {
		return err
	}

	interfaceForResource, err := e.resourceInterface(query)
	if err != nil {
		return err
	}

	_, err = interfaceForResource.Update(ctx, resource, metav1.UpdateOptions{})
	return err
}

func (e *Engine) Restart(ctx context.Context, query ResourceQuery) error {
	resource, err := e.GetResource(ctx, query)
	if err != nil {
		return err
	}

	annotations, _, err := unstructured.NestedStringMap(resource.Object, "spec", "template", "metadata", "annotations")
	if err != nil {
		return err
	}
	if annotations == nil {
		annotations = map[string]string{}
	}
	annotations["kubectl.kubernetes.io/restartedAt"] = time.Now().UTC().Format(time.RFC3339)
	if err := unstructured.SetNestedStringMap(resource.Object, annotations, "spec", "template", "metadata", "annotations"); err != nil {
		return err
	}

	interfaceForResource, err := e.resourceInterface(query)
	if err != nil {
		return err
	}

	_, err = interfaceForResource.Update(ctx, resource, metav1.UpdateOptions{})
	return err
}

func (e *Engine) StreamLogs(ctx context.Context, requestContext, namespace, pod, container string, tailLines int64, follow bool, send func(string) error) error {
	config, _, err := e.sessions.ResolveRESTConfig(requestContext, "")
	if err != nil {
		return err
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return err
	}

	options := &v1PodLogOptions{
		Container: container,
		Follow:    follow,
	}
	if tailLines > 0 {
		options.TailLines = &tailLines
	}

	stream, err := clientset.CoreV1().Pods(namespace).GetLogs(pod, options.toAPI()).Stream(ctx)
	if err != nil {
		return err
	}
	defer stream.Close()

	scanner := bufio.NewScanner(stream)
	for scanner.Scan() {
		if err := send(scanner.Text()); err != nil {
			return err
		}
	}

	return scanner.Err()
}

func (e *Engine) WatchResource(ctx context.Context, query ResourceQuery) (k8swatch.Interface, error) {
	resource, err := e.resourceInterface(query)
	if err != nil {
		return nil, err
	}

	return resource.Watch(ctx, metav1.ListOptions{
		LabelSelector: query.LabelSelector,
		FieldSelector: query.FieldSelector,
	})
}

func (e *Engine) resourceInterface(query ResourceQuery) (dynamic.ResourceInterface, error) {
	dynamicClient, _, err := e.dynamicClientAndMapper(query.Context, "")
	if err != nil {
		return nil, err
	}

	gvr := schema.GroupVersionResource{
		Group:    query.Group,
		Version:  query.Version,
		Resource: query.Resource,
	}

	namespaceableResource := dynamicClient.Resource(gvr)
	if query.Namespace != "" {
		return namespaceableResource.Namespace(query.Namespace), nil
	}

	return namespaceableResource, nil
}

func (e *Engine) discoveryClient(requestContext, kubeconfigPath string) (discovery.DiscoveryInterface, error) {
	config, _, err := e.sessions.ResolveRESTConfig(requestContext, kubeconfigPath)
	if err != nil {
		return nil, err
	}

	return discovery.NewDiscoveryClientForConfig(config)
}

func (e *Engine) dynamicClientAndMapper(requestContext, kubeconfigPath string) (dynamic.Interface, *restmapper.DeferredDiscoveryRESTMapper, error) {
	config, _, err := e.sessions.ResolveRESTConfig(requestContext, kubeconfigPath)
	if err != nil {
		return nil, nil, err
	}

	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, nil, err
	}

	discoveryClient, err := discovery.NewDiscoveryClientForConfig(config)
	if err != nil {
		return nil, nil, err
	}

	mapper := restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(discoveryClient))
	return dynamicClient, mapper, nil
}

type v1PodLogOptions struct {
	Container string
	Follow    bool
	TailLines *int64
}

func (o v1PodLogOptions) toAPI() *corev1.PodLogOptions {
	return &corev1.PodLogOptions{
		Container: o.Container,
		Follow:    o.Follow,
		TailLines: o.TailLines,
	}
}
