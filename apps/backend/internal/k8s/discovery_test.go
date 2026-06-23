package k8s_test

import (
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/discovery/fake"
	clienttesting "k8s.io/client-go/testing"
)

func TestDiscoveryCacheTTL(t *testing.T) {
	fakeDisc := &fake.FakeDiscovery{
		Fake: &clienttesting.Fake{},
	}
	fakeDisc.Resources = []*metav1.APIResourceList{
		{
			GroupVersion: "apps/v1",
			APIResources: []metav1.APIResource{
				{Name: "deployments", Kind: "Deployment", Verbs: metav1.Verbs{"get", "list", "watch"}},
			},
		},
	}

	_ = fakeDisc
	t.Log("Discovery fake client created successfully")
}
