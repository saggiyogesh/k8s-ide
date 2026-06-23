package k8s_test

import (
	"testing"

	"github.com/k8s-ide/backend/internal/k8s"
)

func TestDiscoveryCache_ParseGroupVersion(t *testing.T) {
	cases := []fakeResource{
		{group: "", version: "v1", res: "pods", kind: "Pod"},
		{group: "apps", version: "v1", res: "deployments", kind: "Deployment"},
	}

	fakeClient := &fakeDiscovery{resources: cases}
	cache := k8s.NewDiscoveryCache(fakeClient, 0)

	descs, err := cache.Get()
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(descs) != len(cases) {
		t.Fatalf("expected %d descriptors, got %d", len(cases), len(descs))
	}
	for i, d := range descs {
		if d.Group != cases[i].group {
			t.Errorf("[%d] group: got %q, want %q", i, d.Group, cases[i].group)
		}
		if d.Resource != cases[i].res {
			t.Errorf("[%d] resource: got %q, want %q", i, d.Resource, cases[i].res)
		}
	}
}
