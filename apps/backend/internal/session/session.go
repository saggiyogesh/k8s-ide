package session

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

type ContextInfo struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	User      string `json:"user"`
	Namespace string `json:"namespace"`
	Current   bool   `json:"current"`
}

type SessionInfo struct {
	Context        string `json:"context"`
	Namespace      string `json:"namespace"`
	ServerVersion  string `json:"serverVersion,omitempty"`
}

type Manager struct {
	mu          sync.RWMutex
	kubeconfig  string
	rawConfig   api.Config
	restConfig  *rest.Config
	clientset   kubernetes.Interface
	activeCtx   string
	namespace   string
}

func NewManager(kubeconfigPath string) *Manager {
	path := kubeconfigPath
	if path == "" {
		if env := os.Getenv("KUBECONFIG"); env != "" {
			path = env
		} else if home, err := os.UserHomeDir(); err == nil {
			path = filepath.Join(home, ".kube", "config")
		}
	}

	m := &Manager{kubeconfig: path}
	_ = m.reload()
	return m
}

func (m *Manager) reload() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	loadingRules := &clientcmd.ClientConfigLoadingRules{ExplicitPath: m.kubeconfig}
	configOverrides := &clientcmd.ConfigOverrides{}
	loader := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, configOverrides)

	raw, err := loader.RawConfig()
	if err != nil {
		return err
	}

	restConfig, err := loader.ClientConfig()
	if err != nil {
		return err
	}

	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return err
	}

	m.rawConfig = raw
	m.restConfig = restConfig
	m.clientset = clientset

	if m.activeCtx == "" {
		m.activeCtx = raw.CurrentContext
	}
	if m.namespace == "" {
		if ctx, ok := raw.Contexts[m.activeCtx]; ok && ctx.Namespace != "" {
			m.namespace = ctx.Namespace
		} else {
			m.namespace = "default"
		}
	}

	return nil
}

func (m *Manager) ListContexts() ([]ContextInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if len(m.rawConfig.Contexts) == 0 {
		if err := m.reload(); err != nil {
			return nil, err
		}
	}

	items := make([]ContextInfo, 0, len(m.rawConfig.Contexts))
	for name, ctx := range m.rawConfig.Contexts {
		items = append(items, ContextInfo{
			Name:      name,
			Cluster:   ctx.Cluster,
			User:      ctx.AuthInfo,
			Namespace: fallback(ctx.Namespace, "default"),
			Current:   name == m.rawConfig.CurrentContext,
		})
	}
	return items, nil
}

func (m *Manager) OpenSession(contextName string) (SessionInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.rawConfig.Contexts[contextName]; !ok {
		if err := m.reload(); err != nil {
			return SessionInfo{}, err
		}
		if _, ok := m.rawConfig.Contexts[contextName]; !ok {
			return SessionInfo{}, fmt.Errorf("context %q not found", contextName)
		}
	}

	overrides := &clientcmd.ConfigOverrides{CurrentContext: contextName}
	loader := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		&clientcmd.ClientConfigLoadingRules{ExplicitPath: m.kubeconfig},
		overrides,
	)

	restConfig, err := loader.ClientConfig()
	if err != nil {
		return SessionInfo{}, err
	}

	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return SessionInfo{}, err
	}

	m.activeCtx = contextName
	m.restConfig = restConfig
	m.clientset = clientset

	if ctx, ok := m.rawConfig.Contexts[contextName]; ok && ctx.Namespace != "" {
		m.namespace = ctx.Namespace
	} else {
		m.namespace = "default"
	}

	info := SessionInfo{
		Context:   contextName,
		Namespace: m.namespace,
	}

	if m.clientset != nil {
		if version, err := m.clientset.Discovery().ServerVersion(); err == nil {
			info.ServerVersion = version.GitVersion
		}
	}

	return info, nil
}

func (m *Manager) ActiveNamespace() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.namespace
}

func (m *Manager) RESTConfig() (*rest.Config, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.restConfig == nil {
		m.mu.RUnlock()
		if err := m.reload(); err != nil {
			return nil, err
		}
		m.mu.RLock()
	}
	if m.restConfig == nil {
		return nil, fmt.Errorf("kubernetes client is not configured")
	}
	cfg := *m.restConfig
	return &cfg, nil
}

func (m *Manager) Clientset() (kubernetes.Interface, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.clientset == nil {
		return nil, fmt.Errorf("kubernetes client is not configured")
	}
	return m.clientset, nil
}

func fallback(value, defaultValue string) string {
	if value == "" {
		return defaultValue
	}
	return value
}
