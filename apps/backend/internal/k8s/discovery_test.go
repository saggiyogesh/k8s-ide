package k8s_test

import (
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/discovery/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"

	"github.com/k8s-ide/backend/internal/k8s"
)

func TestDiscoveryCacheReturnsResults(t *testing.T) {
	cs := k8sfake.NewSimpleClientset()
	fakeDisc, ok := cs.Discovery().(*fake.FakeDiscovery)
	if !ok {
		t.Fatal("unexpected discovery type")
	}
	fakeDisc.Resources = []*metav1.APIResourceList{
		{
			GroupVersion: "v1",
			APIResources: []metav1.APIResource{
				{Name: "pods", Kind: "Pod", Namespaced: true, Verbs: []string{"get", "list", "watch"}},
				{Name: "pods/log", Kind: "Pod", Namespaced: true, Verbs: []string{"get"}},
			},
		},
		{
			GroupVersion: "apps/v1",
			APIResources: []metav1.APIResource{
				{Name: "deployments", Kind: "Deployment", Namespaced: true, Verbs: []string{"get", "list", "watch", "create", "update", "patch", "delete"}},
			},
		},
	}

	cache := k8s.NewDiscoveryCache(cs.Discovery(), 10*time.Second)
	resources, err := cache.All()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Sub-resources (pods/log) must be filtered out.
	for _, r := range resources {
		for _, ch := range r.Resource {
			if ch == '/' {
				t.Errorf("sub-resource leaked: %s", r.Resource)
			}
		}
	}

	if len(resources) != 2 {
		t.Errorf("expected 2 resources, got %d", len(resources))
	}
}

func TestDiscoveryCacheInvalidate(t *testing.T) {
	cs := k8sfake.NewSimpleClientset()
	cache := k8s.NewDiscoveryCache(cs.Discovery(), 10*time.Second)

	_, _ = cache.All()
	cache.Invalidate()
	_, _ = cache.All()
}
