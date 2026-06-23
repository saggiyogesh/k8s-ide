// Package k8s provides resource discovery, dynamic CRUD, and action adapters.
package k8s

import (
	"fmt"
	"sync"
	"time"

	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
)

// ResourceDescriptor is a wire-safe API resource descriptor.
type ResourceDescriptor struct {
	Group      string   `json:"group"`
	Version    string   `json:"version"`
	Resource   string   `json:"resource"`
	Kind       string   `json:"kind"`
	Namespaced bool     `json:"namespaced"`
	Verbs      []string `json:"verbs"`
	ShortNames []string `json:"shortNames,omitempty"`
	Categories []string `json:"categories,omitempty"`
}

// GVR returns the GroupVersionResource for this descriptor.
func (d ResourceDescriptor) GVR() schema.GroupVersionResource {
	return schema.GroupVersionResource{Group: d.Group, Version: d.Version, Resource: d.Resource}
}

// DiscoveryCache wraps a discovery client with a short-lived in-memory cache.
type DiscoveryCache struct {
	client    discovery.DiscoveryInterface
	mu        sync.RWMutex
	cached    []ResourceDescriptor
	cachedAt  time.Time
	ttl       time.Duration
}

// NewDiscoveryCache creates a DiscoveryCache with the given TTL.
func NewDiscoveryCache(client discovery.DiscoveryInterface, ttl time.Duration) *DiscoveryCache {
	return &DiscoveryCache{client: client, ttl: ttl}
}

// All returns all discoverable API resources, using a cached result if fresh.
func (c *DiscoveryCache) All() ([]ResourceDescriptor, error) {
	c.mu.RLock()
	if c.cached != nil && time.Since(c.cachedAt) < c.ttl {
		out := make([]ResourceDescriptor, len(c.cached))
		copy(out, c.cached)
		c.mu.RUnlock()
		return out, nil
	}
	c.mu.RUnlock()

	_, lists, err := c.client.ServerGroupsAndResources()
	if err != nil && lists == nil {
		return nil, fmt.Errorf("discovery: %w", err)
	}

	var out []ResourceDescriptor
	for _, list := range lists {
		gv, parseErr := schema.ParseGroupVersion(list.GroupVersion)
		if parseErr != nil {
			continue
		}
		for _, r := range list.APIResources {
			// Skip sub-resources (e.g. pods/log, pods/exec).
			isSubResource := false
			for i := 0; i < len(r.Name); i++ {
				if r.Name[i] == '/' {
					isSubResource = true
					break
				}
			}
			if isSubResource {
				continue
			}
			out = append(out, ResourceDescriptor{
				Group:      gv.Group,
				Version:    gv.Version,
				Resource:   r.Name,
				Kind:       r.Kind,
				Namespaced: r.Namespaced,
				Verbs:      verbsFromSlice(r.Verbs),
				ShortNames: r.ShortNames,
				Categories: r.Categories,
			})
		}
	}

	c.mu.Lock()
	c.cached = out
	c.cachedAt = time.Now()
	c.mu.Unlock()

	return out, nil
}

// Invalidate clears the cache.
func (c *DiscoveryCache) Invalidate() {
	c.mu.Lock()
	c.cached = nil
	c.mu.Unlock()
}

func verbsFromSlice(verbs []string) []string {
	known := map[string]struct{}{
		"get": {}, "list": {}, "watch": {}, "create": {},
		"update": {}, "patch": {}, "delete": {}, "deletecollection": {},
	}
	out := make([]string, 0)
	for _, v := range verbs {
		if _, ok := known[v]; ok {
			out = append(out, v)
		}
	}
	return out
}
