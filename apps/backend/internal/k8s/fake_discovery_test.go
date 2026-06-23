package k8s_test

import (
	openapi_v2 "github.com/google/gnostic-models/openapiv2"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/version"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/openapi"
	restclient "k8s.io/client-go/rest"
)

type fakeResource struct {
	group, version, res, kind string
}

// fakeDiscovery implements discovery.DiscoveryInterface using in-memory data.
type fakeDiscovery struct {
	resources []fakeResource
}

var _ discovery.DiscoveryInterface = (*fakeDiscovery)(nil)

func (f *fakeDiscovery) RESTClient() restclient.Interface { return nil }

func (f *fakeDiscovery) ServerGroups() (*metav1.APIGroupList, error) {
	return &metav1.APIGroupList{}, nil
}

func (f *fakeDiscovery) ServerResourcesForGroupVersion(_ string) (*metav1.APIResourceList, error) {
	return nil, nil
}

func (f *fakeDiscovery) ServerGroupsAndResources() ([]*metav1.APIGroup, []*metav1.APIResourceList, error) {
	var groups []*metav1.APIGroup
	var lists []*metav1.APIResourceList
	for _, r := range f.resources {
		gv := r.version
		if r.group != "" {
			gv = r.group + "/" + r.version
		}
		lists = append(lists, &metav1.APIResourceList{
			GroupVersion: gv,
			APIResources: []metav1.APIResource{
				{Name: r.res, Kind: r.kind, Verbs: metav1.Verbs{"list", "get", "watch"}},
			},
		})
	}
	return groups, lists, nil
}

func (f *fakeDiscovery) ServerPreferredResources() ([]*metav1.APIResourceList, error) {
	return nil, nil
}

func (f *fakeDiscovery) ServerPreferredNamespacedResources() ([]*metav1.APIResourceList, error) {
	return nil, nil
}

func (f *fakeDiscovery) ServerVersion() (*version.Info, error) {
	return &version.Info{GitVersion: "v1.30.0"}, nil
}

func (f *fakeDiscovery) OpenAPISchema() (*openapi_v2.Document, error) { return nil, nil }

func (f *fakeDiscovery) OpenAPIV3() openapi.Client { return nil }

func (f *fakeDiscovery) WithLegacy() discovery.DiscoveryInterface { return f }
