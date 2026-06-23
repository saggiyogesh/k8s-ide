package k8s

import (
	"fmt"
	"sort"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/discovery"
)

// ApiResourceDescriptor mirrors the frontend type.
type ApiResourceDescriptor struct {
	Group      string   `json:"group"`
	Version    string   `json:"version"`
	Kind       string   `json:"kind"`
	Resource   string   `json:"resource"`
	Namespaced bool     `json:"namespaced"`
	Verbs      []string `json:"verbs"`
	ShortNames []string `json:"shortNames,omitempty"`
	Categories []string `json:"categories,omitempty"`
}

// DiscoveryCache holds a TTL-cached list of API resources.
type DiscoveryCache struct {
	mu          sync.RWMutex
	resources   []ApiResourceDescriptor
	fetchedAt   time.Time
	ttl         time.Duration
	discClient  discovery.DiscoveryInterface
}

func NewDiscoveryCache(client discovery.DiscoveryInterface, ttl time.Duration) *DiscoveryCache {
	return &DiscoveryCache{discClient: client, ttl: ttl}
}

func (c *DiscoveryCache) Get() ([]ApiResourceDescriptor, error) {
	c.mu.RLock()
	if time.Since(c.fetchedAt) < c.ttl && len(c.resources) > 0 {
		out := make([]ApiResourceDescriptor, len(c.resources))
		copy(out, c.resources)
		c.mu.RUnlock()
		return out, nil
	}
	c.mu.RUnlock()

	return c.refresh()
}

func (c *DiscoveryCache) Invalidate() {
	c.mu.Lock()
	c.fetchedAt = time.Time{}
	c.mu.Unlock()
}

func (c *DiscoveryCache) refresh() ([]ApiResourceDescriptor, error) {
	_, lists, err := c.discClient.ServerGroupsAndResources()
	if err != nil {
		if len(lists) == 0 {
			return nil, fmt.Errorf("discovery failed: %w", err)
		}
		// Partial results are acceptable
	}

	var out []ApiResourceDescriptor
	for _, list := range lists {
		gv, err := parseGroupVersion(list.GroupVersion)
		if err != nil {
			continue
		}
		for _, r := range list.APIResources {
			// Skip sub-resources (those containing '/')
			if containsSlash(r.Name) {
				continue
			}
			verbs := make([]string, len(r.Verbs))
			for i, v := range r.Verbs {
				verbs[i] = string(v)
			}
			out = append(out, ApiResourceDescriptor{
				Group:      gv.Group,
				Version:    gv.Version,
				Kind:       r.Kind,
				Resource:   r.Name,
				Namespaced: r.Namespaced,
				Verbs:      verbs,
				ShortNames: r.ShortNames,
				Categories: r.Categories,
			})
		}
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].Group != out[j].Group {
			return out[i].Group < out[j].Group
		}
		if out[i].Version != out[j].Version {
			return out[i].Version < out[j].Version
		}
		return out[i].Kind < out[j].Kind
	})

	c.mu.Lock()
	c.resources = out
	c.fetchedAt = time.Now()
	c.mu.Unlock()

	result := make([]ApiResourceDescriptor, len(out))
	copy(result, out)
	return result, nil
}

type groupVersion struct {
	Group   string
	Version string
}

func parseGroupVersion(gv string) (groupVersion, error) {
	for i := len(gv) - 1; i >= 0; i-- {
		if gv[i] == '/' {
			return groupVersion{Group: gv[:i], Version: gv[i+1:]}, nil
		}
	}
	if gv == "" {
		return groupVersion{}, fmt.Errorf("empty group version")
	}
	// Core group
	return groupVersion{Group: "", Version: gv}, nil
}

func containsSlash(s string) bool {
	for _, c := range s {
		if c == '/' {
			return true
		}
	}
	return false
}

// GVRFor looks up a group/version/resource from a flat list of descriptors.
func GVRFor(resources []ApiResourceDescriptor, group, version, resource string) (ApiResourceDescriptor, bool) {
	for _, r := range resources {
		if r.Group == group && r.Version == version && r.Resource == resource {
			return r, true
		}
	}
	return ApiResourceDescriptor{}, false
}

// Verify that metav1 is used to satisfy import requirements.
var _ = metav1.Now
