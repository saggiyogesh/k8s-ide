package k8s

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

type ApiResourceDescriptor struct {
	Group        string   `json:"group"`
	Version      string   `json:"version"`
	Resource     string   `json:"resource"`
	Kind         string   `json:"kind"`
	Namespaced   bool     `json:"namespaced"`
	Verbs        []string `json:"verbs"`
	ShortNames   []string `json:"shortNames,omitempty"`
	Categories   []string `json:"categories,omitempty"`
	SingularName string   `json:"singularName,omitempty"`
}

type Engine struct {
	discovery discovery.DiscoveryInterface
	dynamic   dynamic.Interface
}

func NewEngine(cfg *rest.Config) (*Engine, error) {
	disc, err := discovery.NewDiscoveryClientForConfig(cfg)
	if err != nil {
		return nil, err
	}
	dyn, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	return &Engine{discovery: disc, dynamic: dyn}, nil
}

func (e *Engine) Discover(ctx context.Context) ([]ApiResourceDescriptor, error) {
	groups, err := e.discovery.ServerGroups()
	if err != nil {
		return nil, fmt.Errorf("server groups: %w", err)
	}

	var out []ApiResourceDescriptor
	for _, g := range groups.Groups {
		for _, v := range g.Versions {
			res, err := e.discovery.ServerResourcesForGroupVersion(v.GroupVersion)
			if err != nil {
				continue
			}
			gv, _ := schema.ParseGroupVersion(v.GroupVersion)
			for _, r := range res.APIResources {
				if r.Name == "" || contains(r.Verbs, "proxy") {
					continue
				}
				out = append(out, ApiResourceDescriptor{
					Group:        gv.Group,
					Version:      gv.Version,
					Resource:     r.Name,
					Kind:         r.Kind,
					Namespaced:   r.Namespaced,
					Verbs:        r.Verbs,
					ShortNames:   r.ShortNames,
					Categories:   r.Categories,
					SingularName: r.SingularName,
				})
			}
		}
	}
	return out, nil
}

func (e *Engine) Dynamic() dynamic.Interface {
	return e.dynamic
}

func contains(ss []string, s string) bool {
	for _, v := range ss {
		if v == s {
			return true
		}
	}
	return false
}

func GVR(group, version, resource string) schema.GroupVersionResource {
	return schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
}

func ListOptions(namespace, labelSelector, fieldSelector string, limit int64, continueToken string) metav1.ListOptions {
	opts := metav1.ListOptions{
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Limit:         limit,
		Continue:      continueToken,
	}
	return opts
}
