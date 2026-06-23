package k8s_test

import (
	"testing"

	"github.com/k8s-ide/backend/internal/k8s"
)

func TestParseGroupVersion(t *testing.T) {
	group, version, err := k8s.ParseGroupVersion("apps/v1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if group != "apps" || version != "v1" {
		t.Fatalf("got %q/%q", group, version)
	}

	group, version, err = k8s.ParseGroupVersion("v1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if group != "" || version != "v1" {
		t.Fatalf("got %q/%q", group, version)
	}
}

func TestGVR(t *testing.T) {
	engine := &k8s.Engine{}
	gvr := engine.GVR("apps", "v1", "deployments")
	if gvr.Group != "apps" || gvr.Version != "v1" || gvr.Resource != "deployments" {
		t.Fatalf("unexpected gvr: %#v", gvr)
	}
}
