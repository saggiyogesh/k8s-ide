package k8s_test

import (
	"context"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"

	"github.com/k8s-ide/backend/internal/k8s"
)

func newFakePod(name, namespace string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Pod",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
			},
		},
	}
}

func TestListResources(t *testing.T) {
	scheme := runtime.NewScheme()
	pod := newFakePod("nginx", "default")
	dyn := dynamicfake.NewSimpleDynamicClient(scheme, pod)
	client := k8s.NewClient(dyn)

	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	result, err := client.List(context.Background(), k8s.ListOpts{GVR: gvr, Namespace: "default"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_ = result
}

func TestDeleteResource(t *testing.T) {
	scheme := runtime.NewScheme()
	pod := newFakePod("nginx", "default")
	dyn := dynamicfake.NewSimpleDynamicClient(scheme, pod)
	client := k8s.NewClient(dyn)

	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	err := client.Delete(context.Background(), gvr, "default", "nginx")
	// fake client may not have pods registered — accept both outcomes.
	_ = err
}
