package k8s

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"sigs.k8s.io/yaml"
)

// Client wraps the dynamic client for generic CRUD operations.
type Client struct {
	dynamic dynamic.Interface
}

// NewClient creates a new generic K8s client.
func NewClient(dyn dynamic.Interface) *Client {
	return &Client{dynamic: dyn}
}

// ListOpts contains parameters for a list operation.
type ListOpts struct {
	GVR           schema.GroupVersionResource
	Namespace     string
	LabelSelector string
	FieldSelector string
	Limit         int64
	Continue      string
}

// ListResult contains a page of resources.
type ListResult struct {
	Items         []unstructured.Unstructured `json:"items"`
	TotalCount    int                         `json:"totalCount"`
	Continue      string                      `json:"continue,omitempty"`
	ResourceVersion string                    `json:"resourceVersion,omitempty"`
}

// List returns a page of resources.
func (c *Client) List(ctx context.Context, opts ListOpts) (*ListResult, error) {
	listOpts := metav1.ListOptions{
		LabelSelector: opts.LabelSelector,
		FieldSelector: opts.FieldSelector,
		Limit:         opts.Limit,
		Continue:      opts.Continue,
	}

	ri := c.ri(opts.GVR, opts.Namespace)
	list, err := ri.List(ctx, listOpts)
	if err != nil {
		return nil, fmt.Errorf("list %s: %w", opts.GVR.Resource, err)
	}

	return &ListResult{
		Items:           list.Items,
		TotalCount:      len(list.Items),
		Continue:        list.GetContinue(),
		ResourceVersion: list.GetResourceVersion(),
	}, nil
}

// Get fetches a single resource by name.
func (c *Client) Get(ctx context.Context, gvr schema.GroupVersionResource, namespace, name string) (*unstructured.Unstructured, error) {
	ri := c.ri(gvr, namespace)
	obj, err := ri.Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("get %s/%s: %w", gvr.Resource, name, err)
	}
	return obj, nil
}

// Apply performs a server-side apply from YAML input.
func (c *Client) Apply(ctx context.Context, yamlBytes []byte) (*unstructured.Unstructured, bool, error) {
	jsonBytes, err := yaml.YAMLToJSON(yamlBytes)
	if err != nil {
		return nil, false, fmt.Errorf("yaml to json: %w", err)
	}

	var obj unstructured.Unstructured
	if err := json.NewDecoder(bytes.NewReader(jsonBytes)).Decode(&obj.Object); err != nil {
		return nil, false, fmt.Errorf("decode object: %w", err)
	}

	gvk := obj.GroupVersionKind()
	gvr := schema.GroupVersionResource{
		Group:    gvk.Group,
		Version:  gvk.Version,
		Resource: kindToResource(gvk.Kind),
	}

	namespace := obj.GetNamespace()
	name := obj.GetName()

	ri := c.ri(gvr, namespace)

	// Try to get the existing object to determine create vs update.
	_, getErr := ri.Get(ctx, name, metav1.GetOptions{})
	created := false
	if getErr != nil {
		created = true
	}

	result, err := ri.Patch(
		ctx,
		name,
		types.ApplyPatchType,
		jsonBytes,
		metav1.PatchOptions{FieldManager: "k8s-ide", Force: boolPtr(true)},
	)
	if err != nil {
		return nil, false, fmt.Errorf("apply %s/%s: %w", gvr.Resource, name, err)
	}

	return result, created, nil
}

// Delete removes a resource by GVR/namespace/name.
func (c *Client) Delete(ctx context.Context, gvr schema.GroupVersionResource, namespace, name string) error {
	ri := c.ri(gvr, namespace)
	policy := metav1.DeletePropagationBackground
	if err := ri.Delete(ctx, name, metav1.DeleteOptions{PropagationPolicy: &policy}); err != nil {
		return fmt.Errorf("delete %s/%s: %w", gvr.Resource, name, err)
	}
	return nil
}

// Scale updates the replicas field on a scalable resource.
func (c *Client) Scale(ctx context.Context, gvr schema.GroupVersionResource, namespace, name string, replicas int32) error {
	patch := map[string]interface{}{
		"spec": map[string]interface{}{
			"replicas": replicas,
		},
	}
	patchBytes, _ := json.Marshal(patch)
	ri := c.ri(gvr, namespace)
	_, err := ri.Patch(ctx, name, types.MergePatchType, patchBytes, metav1.PatchOptions{})
	if err != nil {
		return fmt.Errorf("scale %s/%s: %w", gvr.Resource, name, err)
	}
	return nil
}

// RolloutRestart triggers a rollout restart by patching the pod template annotation.
func (c *Client) RolloutRestart(ctx context.Context, gvr schema.GroupVersionResource, namespace, name string) error {
	patch := map[string]interface{}{
		"spec": map[string]interface{}{
			"template": map[string]interface{}{
				"metadata": map[string]interface{}{
					"annotations": map[string]interface{}{
						"kubectl.kubernetes.io/restartedAt": metav1.Now().UTC().Format("2006-01-02T15:04:05Z"),
					},
				},
			},
		},
	}
	patchBytes, _ := json.Marshal(patch)
	ri := c.ri(gvr, namespace)
	_, err := ri.Patch(ctx, name, types.MergePatchType, patchBytes, metav1.PatchOptions{})
	if err != nil {
		return fmt.Errorf("rollout restart %s/%s: %w", gvr.Resource, name, err)
	}
	return nil
}

func (c *Client) ri(gvr schema.GroupVersionResource, namespace string) dynamic.ResourceInterface {
	if namespace != "" {
		return c.dynamic.Resource(gvr).Namespace(namespace)
	}
	return c.dynamic.Resource(gvr)
}

func boolPtr(b bool) *bool { return &b }

// kindToResource does a best-effort lowercase plural conversion.
func kindToResource(kind string) string {
	if len(kind) == 0 {
		return ""
	}
	lower := []byte(kind)
	if lower[0] >= 'A' && lower[0] <= 'Z' {
		lower[0] += 32
	}
	// Simple pluralisation heuristic.
	switch {
	case bytes.HasSuffix(lower, []byte("s")):
		return string(lower) + "es"
	case bytes.HasSuffix(lower, []byte("y")):
		return string(lower[:len(lower)-1]) + "ies"
	default:
		return string(lower) + "s"
	}
}
