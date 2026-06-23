package k8s_test

import (
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	fakediscovery "k8s.io/client-go/discovery/fake"
	fakeclient "k8s.io/client-go/kubernetes/fake"

	"github.com/k8s-ide/backend/internal/k8s"
)

func TestDiscoveryCache_Get(t *testing.T) {
	cs := fakeclient.NewSimpleClientset()
	fakeDisc := cs.Discovery().(*fakediscovery.FakeDiscovery)

	// Add a fake resource list.
	fakeDisc.Resources = []*metav1.APIResourceList{
		{
			GroupVersion: "v1",
			APIResources: []metav1.APIResource{
				{Name: "pods", Kind: "Pod", Namespaced: true, Verbs: metav1.Verbs{"get", "list", "watch", "delete"}},
				{Name: "services", Kind: "Service", Namespaced: true, Verbs: metav1.Verbs{"get", "list"}},
			},
		},
		{
			GroupVersion: "apps/v1",
			APIResources: []metav1.APIResource{
				{Name: "deployments", Kind: "Deployment", Namespaced: true, Verbs: metav1.Verbs{"get", "list", "watch", "create", "update", "patch", "delete"}},
			},
		},
	}

	cache := k8s.NewDiscoveryCache(fakeDisc, 0)
	resources, err := cache.Get()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resources) != 3 {
		t.Errorf("expected 3 resources, got %d", len(resources))
	}
	t.Logf("got %d resources", len(resources))
}

func TestGVRFor(t *testing.T) {
	resources := []k8s.ApiResourceDescriptor{
		{Group: "", Version: "v1", Resource: "pods", Kind: "Pod"},
		{Group: "apps", Version: "v1", Resource: "deployments", Kind: "Deployment"},
	}

	got, ok := k8s.GVRFor(resources, "", "v1", "pods")
	if !ok {
		t.Fatal("expected to find pods")
	}
	if got.Kind != "Pod" {
		t.Errorf("expected Pod, got %s", got.Kind)
	}

	_, ok = k8s.GVRFor(resources, "missing", "v1", "things")
	if ok {
		t.Error("expected not found")
	}
}
