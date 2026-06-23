package session_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/k8s-ide/backend/internal/session"
)

const minimalKubeconfig = `
apiVersion: v1
kind: Config
current-context: test-ctx
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: test-cluster
contexts:
- context:
    cluster: test-cluster
    user: test-user
    namespace: default
  name: test-ctx
users:
- name: test-user
  user:
    token: fake-token
`

func writeKubeconfig(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte(minimalKubeconfig), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestManager_ListContexts(t *testing.T) {
	path := writeKubeconfig(t)
	mgr, err := session.NewManager(path)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}

	ctxs, err := mgr.ListContexts()
	if err != nil {
		t.Fatalf("ListContexts: %v", err)
	}

	if len(ctxs) != 1 {
		t.Fatalf("expected 1 context, got %d", len(ctxs))
	}
	if ctxs[0].Name != "test-ctx" {
		t.Errorf("expected test-ctx, got %s", ctxs[0].Name)
	}
	if !ctxs[0].IsCurrent {
		t.Error("expected IsCurrent=true for test-ctx")
	}
}

func TestManager_NoKubeconfig(t *testing.T) {
	mgr, _ := session.NewManager("/tmp/nonexistent-kubeconfig-xyz")
	_, err := mgr.ListContexts()
	if err == nil {
		t.Error("expected error when kubeconfig missing")
	}
}
