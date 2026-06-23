package k8s_test

import (
	"context"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"
	"k8s.io/apimachinery/pkg/runtime/schema"

	k8sinternal "github.com/k8s-ide/backend/internal/k8s"
)

var podGVR = schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}

func newFakePod(namespace, name string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Pod",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
				"uid":       "test-uid-" + name,
			},
		},
	}
}

func TestListResources(t *testing.T) {
	scheme := runtime.NewScheme()
	pod := newFakePod("default", "test-pod")

	dynClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, map[schema.GroupVersionResource]string{
		podGVR: "PodList",
	}, pod)

	result, err := k8sinternal.ListResources(context.Background(), dynClient, k8sinternal.ListOpts{
		Group:     "",
		Version:   "v1",
		Resource:  "pods",
		Namespace: "default",
	})
	if err != nil {
		t.Fatalf("ListResources failed: %v", err)
	}

	if result == nil {
		t.Fatal("expected non-nil result")
	}
	t.Logf("ListResources returned %d items", len(result.Items))
}

func TestGetResource(t *testing.T) {
	scheme := runtime.NewScheme()
	pod := newFakePod("default", "my-pod")

	dynClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, map[schema.GroupVersionResource]string{
		podGVR: "PodList",
	}, pod)

	obj, err := k8sinternal.GetResource(context.Background(), dynClient, k8sinternal.GetOpts{
		Group:     "",
		Version:   "v1",
		Resource:  "pods",
		Namespace: "default",
		Name:      "my-pod",
	})
	if err != nil {
		t.Fatalf("GetResource failed: %v", err)
	}
	if obj == nil {
		t.Fatal("expected non-nil object")
	}
	if obj.GetName() != "my-pod" {
		t.Errorf("expected name my-pod, got %s", obj.GetName())
	}
}
