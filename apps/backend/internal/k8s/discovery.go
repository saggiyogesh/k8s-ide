// Package k8s wraps client-go discovery and dynamic client into higher-level helpers.
package k8s

import (
	"fmt"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/discovery"
)

// APIResource is our wire-format representation of a server API resource.
type APIResource struct {
	Group      string   `json:"group"`
	Version    string   `json:"version"`
	Kind       string   `json:"kind"`
	Resource   string   `json:"resource"`
	Namespaced bool     `json:"namespaced"`
	Verbs      []string `json:"verbs"`
	ShortNames []string `json:"shortNames"`
	Categories []string `json:"categories"`
}

// DiscoveryCache caches API resource discovery with a configurable TTL.
type DiscoveryCache struct {
	mu          sync.Mutex
	client      discovery.DiscoveryInterface
	resources   []APIResource
	fetchedAt   time.Time
	ttl         time.Duration
}

// NewDiscoveryCache creates a new DiscoveryCache.
func NewDiscoveryCache(client discovery.DiscoveryInterface, ttl time.Duration) *DiscoveryCache {
	return &DiscoveryCache{client: client, ttl: ttl}
}

// List returns cached discovery data, re-fetching if the TTL has expired.
func (dc *DiscoveryCache) List() ([]APIResource, error) {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	if dc.resources != nil && time.Since(dc.fetchedAt) < dc.ttl {
		return dc.resources, nil
	}

	resources, err := fetchAllResources(dc.client)
	if err != nil {
		return nil, err
	}
	dc.resources = resources
	dc.fetchedAt = time.Now()
	return resources, nil
}

// Invalidate clears the cache so the next call to List re-fetches.
func (dc *DiscoveryCache) Invalidate() {
	dc.mu.Lock()
	defer dc.mu.Unlock()
	dc.resources = nil
}

func fetchAllResources(client discovery.DiscoveryInterface) ([]APIResource, error) {
	_, lists, err := client.ServerGroupsAndResources()
	if err != nil {
		// Partial results are acceptable – some aggregated API servers fail on specific groups.
		if lists == nil {
			return nil, fmt.Errorf("discovery: %w", err)
		}
	}

	var result []APIResource
	for _, list := range lists {
		group, version := parseGroupVersion(list.GroupVersion)
		for _, r := range list.APIResources {
			// Skip sub-resources (e.g. pods/log, pods/exec).
			if containsSlash(r.Name) {
				continue
			}
			result = append(result, APIResource{
				Group:      group,
				Version:    version,
				Kind:       r.Kind,
				Resource:   r.Name,
				Namespaced: r.Namespaced,
				Verbs:      verbsToStrings(r.Verbs),
				ShortNames: r.ShortNames,
				Categories: r.Categories,
			})
		}
	}
	return result, nil
}

func parseGroupVersion(gv string) (string, string) {
	for i, c := range gv {
		if c == '/' {
			return gv[:i], gv[i+1:]
		}
	}
	return "", gv
}

func verbsToStrings(verbs metav1.Verbs) []string {
	out := make([]string, len(verbs))
	copy(out, verbs)
	return out
}

func containsSlash(s string) bool {
	for _, c := range s {
		if c == '/' {
			return true
		}
	}
	return false
}
