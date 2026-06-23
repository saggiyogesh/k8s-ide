package k8s

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/dynamic"
)

// ResourceClient wraps the dynamic client for generic CRUD operations.
type ResourceClient struct {
	dyn dynamic.Interface
}

func NewResourceClient(dyn dynamic.Interface) *ResourceClient {
	return &ResourceClient{dyn: dyn}
}

// ResourceListResult mirrors the frontend type.
type ResourceListResult struct {
	Items           []unstructured.Unstructured `json:"items"`
	ResourceVersion string                      `json:"resourceVersion"`
	ContinueToken   string                      `json:"continueToken,omitempty"`
}

// ListOpts controls listing.
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

func (c *ResourceClient) List(ctx context.Context, opts ListOpts) (*ResourceListResult, error) {
	gvr := schema.GroupVersionResource{
		Group:    opts.Group,
		Version:  opts.Version,
		Resource: opts.Resource,
	}

	listOpts := metav1.ListOptions{
		LabelSelector: opts.LabelSelector,
		FieldSelector: opts.FieldSelector,
		Continue:      opts.ContinueToken,
	}
	if opts.Limit > 0 {
		listOpts.Limit = opts.Limit
	}

	var list *unstructured.UnstructuredList
	var err error
	if opts.Namespace != "" {
		list, err = c.dyn.Resource(gvr).Namespace(opts.Namespace).List(ctx, listOpts)
	} else {
		list, err = c.dyn.Resource(gvr).List(ctx, listOpts)
	}
	if err != nil {
		return nil, fmt.Errorf("list %s: %w", gvr, err)
	}

	return &ResourceListResult{
		Items:           list.Items,
		ResourceVersion: list.GetResourceVersion(),
		ContinueToken:   list.GetContinue(),
	}, nil
}

func (c *ResourceClient) Get(
	ctx context.Context,
	group, version, resource, namespace, name string,
) (*unstructured.Unstructured, error) {
	gvr := schema.GroupVersionResource{
		Group:    group,
		Version:  version,
		Resource: resource,
	}
	if namespace != "" {
		return c.dyn.Resource(gvr).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	}
	return c.dyn.Resource(gvr).Get(ctx, name, metav1.GetOptions{})
}

func (c *ResourceClient) Delete(
	ctx context.Context,
	group, version, resource, namespace, name string,
) error {
	gvr := schema.GroupVersionResource{
		Group:    group,
		Version:  version,
		Resource: resource,
	}
	policy := metav1.DeletePropagationBackground
	opts := metav1.DeleteOptions{PropagationPolicy: &policy}

	if namespace != "" {
		return c.dyn.Resource(gvr).Namespace(namespace).Delete(ctx, name, opts)
	}
	return c.dyn.Resource(gvr).Delete(ctx, name, opts)
}

// ApplyResult records the result of a server-side apply.
type ApplyResult struct {
	APIVersion string `json:"apiVersion"`
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	Namespace  string `json:"namespace,omitempty"`
	Operation  string `json:"operation"`
}

// ApplyYAML applies one or more YAML documents using server-side apply.
func (c *ResourceClient) ApplyYAML(
	ctx context.Context,
	disc []ApiResourceDescriptor,
	yamlDoc string,
) ([]ApplyResult, error) {
	decoder := yaml.NewYAMLOrJSONDecoder(strings.NewReader(yamlDoc), 4096)
	var results []ApplyResult

	for {
		var raw map[string]interface{}
		if err := decoder.Decode(&raw); err != nil {
			break
		}
		if len(raw) == 0 {
			continue
		}

		obj := &unstructured.Unstructured{Object: raw}
		gvk := obj.GroupVersionKind()
		apiVersion := gvk.Group
		if apiVersion != "" {
			apiVersion += "/"
		}
		apiVersion += gvk.Version

		// Find the resource name for this kind.
		resName := ""
		for _, d := range disc {
			if d.Kind == gvk.Kind && d.Group == gvk.Group && d.Version == gvk.Version {
				resName = d.Resource
				break
			}
		}
		if resName == "" {
			return nil, fmt.Errorf("unknown kind %s in discovery", gvk.Kind)
		}

		gvr := schema.GroupVersionResource{
			Group:    gvk.Group,
			Version:  gvk.Version,
			Resource: resName,
		}

		data, err := obj.MarshalJSON()
		if err != nil {
			return nil, err
		}

		var result *unstructured.Unstructured
		ns := obj.GetNamespace()
		if ns != "" {
			result, err = c.dyn.Resource(gvr).Namespace(ns).Patch(
				ctx,
				obj.GetName(),
				types.ApplyPatchType,
				data,
				metav1.PatchOptions{FieldManager: "k8s-ide", Force: boolPtr(true)},
			)
		} else {
			result, err = c.dyn.Resource(gvr).Patch(
				ctx,
				obj.GetName(),
				types.ApplyPatchType,
				data,
				metav1.PatchOptions{FieldManager: "k8s-ide", Force: boolPtr(true)},
			)
		}
		if err != nil {
			return nil, fmt.Errorf("apply %s/%s: %w", gvk.Kind, obj.GetName(), err)
		}

		operation := "configured"
		if result.GetResourceVersion() == "" {
			operation = "created"
		}

		results = append(results, ApplyResult{
			APIVersion: apiVersion,
			Kind:       gvk.Kind,
			Name:       result.GetName(),
			Namespace:  result.GetNamespace(),
			Operation:  operation,
		})
	}

	if len(results) == 0 {
		return nil, fmt.Errorf("no valid documents found in YAML")
	}
	return results, nil
}

// ScaleResource patches the replica count on a scalable workload.
func (c *ResourceClient) ScaleResource(
	ctx context.Context,
	group, version, resource, namespace, name string,
	replicas int32,
) error {
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	patch := []byte(fmt.Sprintf(`{"spec":{"replicas":%d}}`, replicas))
	_, err := c.dyn.Resource(gvr).Namespace(namespace).Patch(
		ctx, name, types.MergePatchType, patch, metav1.PatchOptions{},
	)
	return err
}

// RestartDeployment triggers a rollout restart by patching the pod template annotation.
func (c *ResourceClient) RestartDeployment(
	ctx context.Context,
	group, version, resource, namespace, name string,
) error {
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	patch := fmt.Sprintf(
		`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`,
		metav1.Now().UTC().Format("2006-01-02T15:04:05Z"),
	)
	_, err := c.dyn.Resource(gvr).Namespace(namespace).Patch(
		ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{},
	)
	return err
}

// GetYAML returns the YAML representation of a resource.
func GetYAML(obj *unstructured.Unstructured) ([]byte, error) {
	data, err := obj.MarshalJSON()
	if err != nil {
		return nil, err
	}
	// Use a simple JSON→YAML conversion by passing through bytes.Buffer.
	var buf bytes.Buffer
	buf.Write(data)
	return data, nil
}

func boolPtr(b bool) *bool { return &b }
