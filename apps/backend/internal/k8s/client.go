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
	"sigs.k8s.io/yaml"
)

// Client wraps the dynamic client with helper methods for CRUD operations.
type Client struct {
	dyn dynamic.Interface
}

// NewClient creates a new Client.
func NewClient(dyn dynamic.Interface) *Client {
	return &Client{dyn: dyn}
}

// resourceInterface returns the correct namespaced or cluster-scoped resource interface.
func (c *Client) resourceInterface(gvr schema.GroupVersionResource, namespace string) dynamic.ResourceInterface {
	if namespace != "" {
		return c.dyn.Resource(gvr).Namespace(namespace)
	}
	return c.dyn.Resource(gvr)
}

// ListOptions holds parameters for list operations.
type ListOptions struct {
	Group         string
	Version       string
	Resource      string
	Namespace     string
	LabelSelector string
	FieldSelector string
	Limit         int64
	ContinueToken string
}

// ListResult wraps an unstructured list with pagination metadata.
type ListResult struct {
	Items             []map[string]interface{} `json:"items"`
	ResourceVersion   string                   `json:"resourceVersion"`
	ContinueToken     string                   `json:"continueToken,omitempty"`
	RemainingItems    *int64                   `json:"remainingItemCount,omitempty"`
}

// List retrieves a list of resources.
func (c *Client) List(ctx context.Context, opts ListOptions) (*ListResult, error) {
	gvr := schema.GroupVersionResource{Group: opts.Group, Version: opts.Version, Resource: opts.Resource}
	listOpts := metav1.ListOptions{
		LabelSelector: opts.LabelSelector,
		FieldSelector: opts.FieldSelector,
		Limit:         opts.Limit,
		Continue:      opts.ContinueToken,
	}
	result, err := c.resourceInterface(gvr, opts.Namespace).List(ctx, listOpts)
	if err != nil {
		return nil, fmt.Errorf("list %s: %w", gvr, err)
	}
	items := make([]map[string]interface{}, len(result.Items))
	for i, item := range result.Items {
		items[i] = item.Object
	}
	lr := &ListResult{
		Items:           items,
		ResourceVersion: result.GetResourceVersion(),
		ContinueToken:   result.GetContinue(),
	}
	if rem := result.GetRemainingItemCount(); rem != nil {
		lr.RemainingItems = rem
	}
	return lr, nil
}

// Get retrieves a single resource by name.
func (c *Client) Get(ctx context.Context, group, version, resource, namespace, name string) (map[string]interface{}, error) {
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	result, err := c.resourceInterface(gvr, namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("get %s/%s: %w", resource, name, err)
	}
	return result.Object, nil
}

// ApplyResult describes what happened to a resource during apply.
type ApplyResult struct {
	Resource map[string]interface{} `json:"resource"`
	Action   string                 `json:"action"` // created | updated
}

// Apply server-side-applies YAML, creating or updating as needed.
func (c *Client) Apply(ctx context.Context, yamlStr string) (*ApplyResult, error) {
	jsonBytes, err := yaml.YAMLToJSON([]byte(yamlStr))
	if err != nil {
		return nil, fmt.Errorf("parse yaml: %w", err)
	}
	var obj unstructured.Unstructured
	if err := json.Unmarshal(jsonBytes, &obj); err != nil {
		return nil, fmt.Errorf("unmarshal object: %w", err)
	}

	gvk := obj.GroupVersionKind()
	if gvk.Kind == "" || gvk.Version == "" {
		return nil, fmt.Errorf("resource missing apiVersion/kind")
	}

	// Determine GVR from the object's GVK by doing a quick discovery lookup.
	// For apply we use the dynamic client's patch with SSA.
	gvr := schema.GroupVersionResource{
		Group:    gvk.Group,
		Version:  gvk.Version,
		Resource: pluralResource(gvk.Kind),
	}
	ns := obj.GetNamespace()

	data, err := json.Marshal(obj.Object)
	if err != nil {
		return nil, err
	}

	result, err := c.resourceInterface(gvr, ns).Patch(
		ctx,
		obj.GetName(),
		types.ApplyPatchType,
		data,
		metav1.PatchOptions{FieldManager: "k8s-ide", Force: boolPtr(true)},
	)
	if err != nil {
		return nil, fmt.Errorf("apply: %w", err)
	}
	action := "updated"
	if result.GetResourceVersion() == "1" {
		action = "created"
	}
	return &ApplyResult{Resource: result.Object, Action: action}, nil
}

// Delete removes a resource.
func (c *Client) Delete(ctx context.Context, group, version, resource, namespace, name string) error {
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	if err := c.resourceInterface(gvr, namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		return fmt.Errorf("delete %s/%s: %w", resource, name, err)
	}
	return nil
}

// Scale sets the replicas field on a scalable resource.
func (c *Client) Scale(ctx context.Context, group, version, resource, namespace, name string, replicas int32) (map[string]interface{}, error) {
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	patch := []byte(fmt.Sprintf(`{"spec":{"replicas":%d}}`, replicas))
	result, err := c.resourceInterface(gvr, namespace).Patch(
		ctx, name, types.MergePatchType, patch, metav1.PatchOptions{},
	)
	if err != nil {
		return nil, fmt.Errorf("scale %s/%s: %w", resource, name, err)
	}
	return result.Object, nil
}

// RolloutRestart triggers a rollout restart by patching the pod template annotation.
func (c *Client) RolloutRestart(ctx context.Context, group, version, resource, namespace, name string) (map[string]interface{}, error) {
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	patch := []byte(`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"` +
		nowRFC3339() + `"}}}}}`)
	result, err := c.resourceInterface(gvr, namespace).Patch(
		ctx, name, types.MergePatchType, patch, metav1.PatchOptions{},
	)
	if err != nil {
		return nil, fmt.Errorf("rollout restart %s/%s: %w", resource, name, err)
	}
	return result.Object, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func boolPtr(b bool) *bool { return &b }

// pluralResource is a best-effort pluralisation for apply when we don't have
// discovery available.  The watch and list paths always get the resource name
// from the caller who already knows it from discovery.
func pluralResource(kind string) string {
	if len(kind) == 0 {
		return ""
	}
	lower := []byte(kind)
	lower[0] += 32
	s := string(lower)
	switch {
	case s[len(s)-1] == 's':
		return s + "es"
	case s[len(s)-1] == 'y':
		return s[:len(s)-1] + "ies"
	default:
		return s + "s"
	}
}

func nowRFC3339() string {
	return metav1.Now().UTC().Format("2006-01-02T15:04:05Z")
}
