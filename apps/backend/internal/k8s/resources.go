package k8s

import (
	"context"
	"encoding/json"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
)

// ResourceListResult is the wire-format for a paginated resource list.
type ResourceListResult struct {
	Items           []unstructured.Unstructured `json:"items"`
	Total           int                         `json:"total"`
	ContinueToken   string                      `json:"continueToken,omitempty"`
	ResourceVersion string                      `json:"resourceVersion"`
}

// ListOpts controls a resource list request.
type ListOpts struct {
	Group         string
	Version       string
	Resource      string
	Namespace     string
	LabelSelector string
	FieldSelector string
	Limit         int64
	ContinueToken string
}

// GetOpts identifies a single resource.
type GetOpts struct {
	Group     string
	Version   string
	Resource  string
	Namespace string
	Name      string
}

// DeleteOpts identifies a resource for deletion.
type DeleteOpts struct {
	Group     string
	Version   string
	Resource  string
	Namespace string
	Name      string
}

func gvr(group, version, resource string) schema.GroupVersionResource {
	return schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
}

func resourceInterface(dyn dynamic.Interface, group, version, resource, namespace string) dynamic.ResourceInterface {
	ri := dyn.Resource(gvr(group, version, resource))
	if namespace != "" {
		return ri.Namespace(namespace)
	}
	return ri
}

// ListResources performs a dynamic list with optional label selectors and pagination.
func ListResources(ctx context.Context, dyn dynamic.Interface, opts ListOpts) (*ResourceListResult, error) {
	ri := resourceInterface(dyn, opts.Group, opts.Version, opts.Resource, opts.Namespace)

	listOpts := metav1.ListOptions{
		LabelSelector: opts.LabelSelector,
		FieldSelector: opts.FieldSelector,
		Continue:      opts.ContinueToken,
	}
	if opts.Limit > 0 {
		listOpts.Limit = opts.Limit
	}

	list, err := ri.List(ctx, listOpts)
	if err != nil {
		return nil, fmt.Errorf("listing %s/%s/%s: %w", opts.Group, opts.Version, opts.Resource, err)
	}

	return &ResourceListResult{
		Items:           list.Items,
		Total:           len(list.Items),
		ContinueToken:   list.GetContinue(),
		ResourceVersion: list.GetResourceVersion(),
	}, nil
}

// GetResource fetches a single resource by name.
func GetResource(ctx context.Context, dyn dynamic.Interface, opts GetOpts) (*unstructured.Unstructured, error) {
	ri := resourceInterface(dyn, opts.Group, opts.Version, opts.Resource, opts.Namespace)
	obj, err := ri.Get(ctx, opts.Name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("getting %s/%s: %w", opts.Resource, opts.Name, err)
	}
	return obj, nil
}

// ApplyResult is returned for each document in a multi-doc YAML apply.
type ApplyResult struct {
	Resource *unstructured.Unstructured `json:"resource"`
	Created  bool                       `json:"created"`
}

// ApplyYAML applies a single unstructured object via server-side apply.
func ApplyYAML(ctx context.Context, dyn dynamic.Interface, obj *unstructured.Unstructured) (*ApplyResult, error) {
	ri := resourceInterface(dyn, obj.GroupVersionKind().Group, obj.GroupVersionKind().Version, pluralResource(obj.GetKind()), obj.GetNamespace())

	data, err := json.Marshal(obj)
	if err != nil {
		return nil, fmt.Errorf("marshalling object: %w", err)
	}

	result, err := ri.Patch(ctx, obj.GetName(), types.ApplyPatchType, data, metav1.PatchOptions{
		FieldManager: "k8s-ide",
		Force:        boolPtr(true),
	})
	if err != nil {
		return nil, fmt.Errorf("applying %s/%s: %w", obj.GetKind(), obj.GetName(), err)
	}
	return &ApplyResult{Resource: result, Created: false}, nil
}

// DeleteResource deletes a resource by name.
func DeleteResource(ctx context.Context, dyn dynamic.Interface, opts DeleteOpts) error {
	ri := resourceInterface(dyn, opts.Group, opts.Version, opts.Resource, opts.Namespace)
	if err := ri.Delete(ctx, opts.Name, metav1.DeleteOptions{}); err != nil {
		return fmt.Errorf("deleting %s/%s: %w", opts.Resource, opts.Name, err)
	}
	return nil
}

// pluralResource is a naive plural for display / fallback use.
// Real resource names must come from discovery.
func pluralResource(kind string) string {
	if kind == "" {
		return ""
	}
	lower := make([]byte, len(kind))
	for i := 0; i < len(kind); i++ {
		c := kind[i]
		if c >= 'A' && c <= 'Z' {
			lower[i] = c + 32
		} else {
			lower[i] = c
		}
	}
	return string(lower) + "s"
}

func boolPtr(b bool) *bool { return &b }
