package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/yaml"
)

type ResourceListResult struct {
	Items               []map[string]interface{} `json:"items"`
	ResourceVersion     string                   `json:"resourceVersion"`
	Continue            string                   `json:"continue,omitempty"`
	RemainingItemCount  *int64                   `json:"remainingItemCount,omitempty"`
}

type ApplyResult struct {
	Action   string                 `json:"action"`
	Resource map[string]interface{} `json:"resource"`
}

func (e *Engine) List(ctx context.Context, gvr schema.GroupVersionResource, namespace, labelSelector, fieldSelector, continueToken string, limit int64) (*ResourceListResult, error) {
	client := e.dynamic.Resource(gvr)
	var list *unstructured.UnstructuredList
	var err error

	opts := ListOptions(namespace, labelSelector, fieldSelector, limit, continueToken)
	if namespace != "" {
		list, err = client.Namespace(namespace).List(ctx, opts)
	} else {
		list, err = client.List(ctx, opts)
	}
	if err != nil {
		return nil, err
	}

	items := make([]map[string]interface{}, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, item.Object)
	}

	return &ResourceListResult{
		Items:              items,
		ResourceVersion:    list.GetResourceVersion(),
		Continue:           list.GetContinue(),
		RemainingItemCount: list.GetRemainingItemCount(),
	}, nil
}

func (e *Engine) Get(ctx context.Context, gvr schema.GroupVersionResource, namespace, name string) (map[string]interface{}, error) {
	client := e.dynamic.Resource(gvr)
	var obj *unstructured.Unstructured
	var err error
	if namespace != "" {
		obj, err = client.Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	} else {
		obj, err = client.Get(ctx, name, metav1.GetOptions{})
	}
	if err != nil {
		return nil, err
	}
	return obj.Object, nil
}

func (e *Engine) Delete(ctx context.Context, gvr schema.GroupVersionResource, namespace, name string) error {
	client := e.dynamic.Resource(gvr)
	if namespace != "" {
		return client.Namespace(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	}
	return client.Delete(ctx, name, metav1.DeleteOptions{})
}

func (e *Engine) ApplyYAML(ctx context.Context, yamlContent string) (*ApplyResult, error) {
	var obj map[string]interface{}
	if err := yaml.Unmarshal([]byte(yamlContent), &obj); err != nil {
		return nil, fmt.Errorf("parse yaml: %w", err)
	}

	u := &unstructured.Unstructured{Object: obj}
	gvk := u.GroupVersionKind()
	gvr := schema.GroupVersionResource{
		Group:    gvk.Group,
		Version:  gvk.Version,
		Resource: resourceForKind(gvk.Kind),
	}

	name := u.GetName()
	namespace := u.GetNamespace()
	client := e.dynamic.Resource(gvr)

	var existing *unstructured.Unstructured
	var err error
	if namespace != "" {
		existing, err = client.Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	} else {
		existing, err = client.Get(ctx, name, metav1.GetOptions{})
	}

	action := "created"
	var result *unstructured.Unstructured
	if err != nil {
		if namespace != "" {
			result, err = client.Namespace(namespace).Create(ctx, u, metav1.CreateOptions{})
		} else {
			result, err = client.Create(ctx, u, metav1.CreateOptions{})
		}
	} else {
		action = "updated"
		u.SetResourceVersion(existing.GetResourceVersion())
		data, _ := json.Marshal(u.Object)
		if namespace != "" {
			result, err = client.Namespace(namespace).Patch(ctx, name, types.MergePatchType, data, metav1.PatchOptions{})
		} else {
			result, err = client.Patch(ctx, name, types.MergePatchType, data, metav1.PatchOptions{})
		}
	}
	if err != nil {
		return nil, err
	}

	return &ApplyResult{Action: action, Resource: result.Object}, nil
}

// resourceForKind is a best-effort mapping; discovery should be preferred for UI.
func resourceForKind(kind string) string {
	switch kind {
	case "Pod":
		return "pods"
	case "Deployment":
		return "deployments"
	case "Service":
		return "services"
	case "ConfigMap":
		return "configmaps"
	case "Secret":
		return "secrets"
	case "Namespace":
		return "namespaces"
	default:
		return strings.ToLower(kind) + "s"
	}
}
