package k8s

import (
	"testing"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestGVRParsing(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	if gvr.Version != "v1" || gvr.Resource != "pods" {
		t.Fatalf("unexpected gvr: %+v", gvr)
	}
}

func TestIsNotFound(t *testing.T) {
	if isNotFound(nil) {
		t.Fatal("nil should not be not-found")
	}
	if !isNotFound(fmtError("resource not found")) {
		t.Fatal("expected not found")
	}
}

type fmtError string

func (e fmtError) Error() string { return string(e) }
