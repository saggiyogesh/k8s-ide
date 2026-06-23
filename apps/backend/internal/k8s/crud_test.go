package k8s_test

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"

	"github.com/k8s-ide/backend/internal/k8s"
)

func fakeClient(objs ...runtime.Object) *dynamicfake.FakeDynamicClient {
	scheme := runtime.NewScheme()
	return dynamicfake.NewSimpleDynamicClient(scheme, objs...)
}

func TestResourceClient_List(t *testing.T) {
	pod := &unstructured.Unstructured{}
	pod.SetGroupVersionKind(schema.GroupVersionKind{Group: "", Version: "v1", Kind: "Pod"})
	pod.SetName("test-pod")
	pod.SetNamespace("default")

	dyn := fakeClient(pod)
	rc := k8s.NewResourceClient(dyn)

	result, err := rc.List(context.Background(), k8s.ListOpts{
		Group:     "",
		Version:   "v1",
		Resource:  "pods",
		Namespace: "default",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Items) != 1 {
		t.Errorf("expected 1 item, got %d", len(result.Items))
	}
}

func TestResourceClient_Delete(t *testing.T) {
	pod := &unstructured.Unstructured{}
	pod.SetGroupVersionKind(schema.GroupVersionKind{Group: "", Version: "v1", Kind: "Pod"})
	pod.SetName("delete-me")
	pod.SetNamespace("default")
	pod.SetResourceVersion("1")

	dyn := fakeClient(pod)
	rc := k8s.NewResourceClient(dyn)

	err := rc.Delete(context.Background(), "", "v1", "pods", "default", "delete-me")
	if err != nil {
		t.Fatalf("unexpected delete error: %v", err)
	}
}

func TestResourceClient_ScaleResource(t *testing.T) {
	dep := &unstructured.Unstructured{}
	dep.SetGroupVersionKind(schema.GroupVersionKind{Group: "apps", Version: "v1", Kind: "Deployment"})
	dep.SetName("my-app")
	dep.SetNamespace("default")
	dep.SetResourceVersion("1")

	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			{Group: "apps", Version: "v1", Resource: "deployments"}: "DeploymentList",
		},
		dep,
	)

	rc := k8s.NewResourceClient(dyn)
	err := rc.ScaleResource(context.Background(), "apps", "v1", "deployments", "default", "my-app", 3)
	if err != nil {
		t.Fatalf("scale error: %v", err)
	}
}

var _ = metav1.Now
