package k8s

import (
	"fmt"
	"strings"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/discovery"
)

// ResourceDescriptor is a serialisable summary of one API resource.
type ResourceDescriptor struct {
	Group       string   `json:"group"`
	Version     string   `json:"version"`
	Resource    string   `json:"resource"`
	Singular    string   `json:"singular"`
	Kind        string   `json:"kind"`
	Namespaced  bool     `json:"namespaced"`
	ShortNames  []string `json:"shortNames"`
	Verbs       []string `json:"verbs"`
	Categories  []string `json:"categories"`
}

// DiscoveryCache caches API group/version/resource lists with a TTL.
type DiscoveryCache struct {
	mu          sync.RWMutex
	resources   []ResourceDescriptor
	fetchedAt   time.Time
	ttl         time.Duration
	discClient  discovery.DiscoveryInterface
}

// NewDiscoveryCache creates a cache with the given TTL (default 60 seconds).
func NewDiscoveryCache(client discovery.DiscoveryInterface, ttl time.Duration) *DiscoveryCache {
	if ttl == 0 {
		ttl = 60 * time.Second
	}
	return &DiscoveryCache{discClient: client, ttl: ttl}
}

// Get returns the cached resource list, refreshing if stale.
func (dc *DiscoveryCache) Get() ([]ResourceDescriptor, error) {
	dc.mu.RLock()
	if time.Since(dc.fetchedAt) < dc.ttl && len(dc.resources) > 0 {
		rs := dc.resources
		dc.mu.RUnlock()
		return rs, nil
	}
	dc.mu.RUnlock()

	return dc.refresh()
}

// Invalidate forces the next Get to fetch fresh data.
func (dc *DiscoveryCache) Invalidate() {
	dc.mu.Lock()
	dc.fetchedAt = time.Time{}
	dc.mu.Unlock()
}

func (dc *DiscoveryCache) refresh() ([]ResourceDescriptor, error) {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	// Double-check after acquiring write lock.
	if time.Since(dc.fetchedAt) < dc.ttl && len(dc.resources) > 0 {
		return dc.resources, nil
	}

	_, apiLists, err := dc.discClient.ServerGroupsAndResources()
	if err != nil {
		// Partial results are still useful for degraded clusters.
		if len(apiLists) == 0 {
			return nil, fmt.Errorf("discovery failed: %w", err)
		}
	}

	var out []ResourceDescriptor
	for _, list := range apiLists {
		gv, err := parseGroupVersion(list.GroupVersion)
		if err != nil {
			continue
		}
		for _, r := range list.APIResources {
			// Skip sub-resources (contain '/')
			if containsSlash(r.Name) {
				continue
			}
			out = append(out, ResourceDescriptor{
				Group:      gv.Group,
				Version:    gv.Version,
				Resource:   r.Name,
				Singular:   r.SingularName,
				Kind:       r.Kind,
				Namespaced: r.Namespaced,
				ShortNames: r.ShortNames,
				Verbs:      verbSlice(r.Verbs),
				Categories: r.Categories,
			})
		}
	}
	dc.resources = out
	dc.fetchedAt = time.Now()
	return out, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type groupVersion struct{ Group, Version string }

func parseGroupVersion(gvStr string) (groupVersion, error) {
	// GroupVersion strings are either "version" (core) or "group/version".
	parts := strings.SplitN(gvStr, "/", 2)
	switch len(parts) {
	case 1:
		return groupVersion{Group: "", Version: parts[0]}, nil
	case 2:
		return groupVersion{Group: parts[0], Version: parts[1]}, nil
	default:
		return groupVersion{}, fmt.Errorf("invalid GroupVersion: %q", gvStr)
	}
}

func verbSlice(vl metav1.Verbs) []string {
	s := make([]string, len(vl))
	copy(s, vl)
	return s
}

func containsSlash(s string) bool {
	for _, c := range s {
		if c == '/' {
			return true
		}
	}
	return false
}
