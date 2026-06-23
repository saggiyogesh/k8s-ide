package k8s

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/restmapper"
)

type ApplyResult struct {
	Action   string                 `json:"action"`
	Resource map[string]interface{} `json:"resource"`
}

func (e *Engine) ApplyYAML(ctx context.Context, raw string) (ApplyResult, error) {
	decoder := yaml.NewYAMLOrJSONDecoder(strings.NewReader(raw), 4096)
	var result ApplyResult

	for {
		obj := &unstructured.Unstructured{}
		if err := decoder.Decode(obj); err != nil {
			if err.Error() == "EOF" {
				break
			}
			return result, err
		}
		if len(obj.Object) == 0 {
			continue
		}

		applied, action, err := e.applyObject(ctx, obj)
		if err != nil {
			return result, err
		}
		gvk := applied.GroupVersionKind()
		result.Action = action
		result.Resource = map[string]interface{}{
			"group":     gvk.Group,
			"version":   gvk.Version,
			"resource":  "",
			"kind":      applied.GetKind(),
			"namespace": applied.GetNamespace(),
			"name":      applied.GetName(),
		}
	}

	if result.Action == "" {
		return result, fmt.Errorf("no kubernetes objects found in YAML")
	}
	return result, nil
}

func (e *Engine) applyObject(ctx context.Context, obj *unstructured.Unstructured) (*unstructured.Unstructured, string, error) {
	gvk := obj.GroupVersionKind()
	mapper := restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(e.discovery))
	mapping, err := mapper.RESTMapping(schema.GroupKind{Group: gvk.Group, Kind: gvk.Kind}, gvk.Version)
	if err != nil {
		return nil, "", err
	}

	var resourceInterface dynamicNamespaceResource
	if mapping.Scope.Name() == meta.RESTScopeNameNamespace {
		ns := obj.GetNamespace()
		if ns == "" {
			ns = "default"
			obj.SetNamespace(ns)
		}
		resourceInterface = e.dynamic.Resource(mapping.Resource).Namespace(ns)
	} else {
		resourceInterface = e.dynamic.Resource(mapping.Resource)
	}

	existing, err := resourceInterface.Get(ctx, obj.GetName(), metav1.GetOptions{})
	if err != nil {
		created, createErr := resourceInterface.Create(ctx, obj, metav1.CreateOptions{})
		if createErr != nil {
			return nil, "", createErr
		}
		return created, "created", nil
	}

	obj.SetResourceVersion(existing.GetResourceVersion())
	updated, err := resourceInterface.Update(ctx, obj, metav1.UpdateOptions{})
	if err != nil {
		return nil, "", err
	}
	return updated, "updated", nil
}

type dynamicNamespaceResource interface {
	Get(ctx context.Context, name string, options metav1.GetOptions, subresources ...string) (*unstructured.Unstructured, error)
	Create(ctx context.Context, obj *unstructured.Unstructured, options metav1.CreateOptions, subresources ...string) (*unstructured.Unstructured, error)
	Update(ctx context.Context, obj *unstructured.Unstructured, options metav1.UpdateOptions, subresources ...string) (*unstructured.Unstructured, error)
}

func decodeDocuments(raw string) ([]*unstructured.Unstructured, error) {
	docs := make([]*unstructured.Unstructured, 0)
	decoder := yaml.NewYAMLOrJSONDecoder(bytes.NewBufferString(raw), 4096)
	for {
		obj := &unstructured.Unstructured{}
		if err := decoder.Decode(obj); err != nil {
			if strings.Contains(err.Error(), "EOF") {
				break
			}
			return nil, err
		}
		if len(obj.Object) > 0 {
			docs = append(docs, obj)
		}
	}
	return docs, nil
}
