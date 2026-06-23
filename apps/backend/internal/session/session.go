// Package session manages the single-user kubeconfig state and active context.
package session

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

// Manager holds the current kubeconfig and active Kubernetes clients.
type Manager struct {
	mu             sync.RWMutex
	kubeconfigPath string
	rawConfig      *api.Config
	restConfig     *rest.Config
	activeContext  string
	typed          kubernetes.Interface
	dynamic        dynamic.Interface
}

// New creates a Manager with the given kubeconfig path (or the default).
func New(kubeconfigPath string) (*Manager, error) {
	if kubeconfigPath == "" {
		kubeconfigPath = defaultKubeconfigPath()
	}
	m := &Manager{kubeconfigPath: kubeconfigPath}
	if err := m.reload(); err != nil {
		return nil, fmt.Errorf("loading kubeconfig: %w", err)
	}
	return m, nil
}

// Contexts returns the list of kubeconfig context names.
func (m *Manager) Contexts() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	names := make([]string, 0, len(m.rawConfig.Contexts))
	for name := range m.rawConfig.Contexts {
		names = append(names, name)
	}
	return names
}

// RawConfig returns the parsed kubeconfig.
func (m *Manager) RawConfig() *api.Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rawConfig
}

// ActiveContext returns the currently selected context name.
func (m *Manager) ActiveContext() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.activeContext
}

// OpenContext switches to the given context and rebuilds clients.
func (m *Manager) OpenContext(context string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.rawConfig.Contexts[context]; !ok {
		return fmt.Errorf("context %q not found in kubeconfig", context)
	}

	cfg, err := m.buildRestConfig(context)
	if err != nil {
		return fmt.Errorf("building REST config for %q: %w", context, err)
	}

	typed, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return fmt.Errorf("creating typed client: %w", err)
	}
	dyn, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return fmt.Errorf("creating dynamic client: %w", err)
	}

	m.restConfig = cfg
	m.activeContext = context
	m.typed = typed
	m.dynamic = dyn
	return nil
}

// TypedClient returns the current typed Kubernetes client. Panics if OpenContext has not been called.
func (m *Manager) TypedClient() kubernetes.Interface {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.typed
}

// DynamicClient returns the current dynamic Kubernetes client. Panics if OpenContext has not been called.
func (m *Manager) DynamicClient() dynamic.Interface {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.dynamic
}

// RestConfig returns the REST config for the active context.
func (m *Manager) RestConfig() *rest.Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.restConfig
}

func (m *Manager) reload() error {
	raw, err := clientcmd.LoadFromFile(m.kubeconfigPath)
	if err != nil {
		return err
	}
	m.rawConfig = raw
	return nil
}

func (m *Manager) buildRestConfig(context string) (*rest.Config, error) {
	overrides := &clientcmd.ConfigOverrides{CurrentContext: context}
	loader := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		&clientcmd.ClientConfigLoadingRules{ExplicitPath: m.kubeconfigPath},
		overrides,
	)
	return loader.ClientConfig()
}

func defaultKubeconfigPath() string {
	if env := os.Getenv("KUBECONFIG"); env != "" {
		return env
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".kube", "config")
}
