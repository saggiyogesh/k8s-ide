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
	IsCurrent bool   `json:"isCurrent"`
}

type SessionInfo struct {
	Context       string `json:"context"`
	Namespace     string `json:"namespace"`
	ServerVersion string `json:"serverVersion,omitempty"`
}

type Manager struct {
	mu            sync.RWMutex
	kubeconfigPath string
	config        *api.Config
	restConfig    *rest.Config
	clientset     kubernetes.Interface
	currentCtx    string
}

func NewManager(kubeconfigPath string) (*Manager, error) {
	if kubeconfigPath == "" {
		if home, err := os.UserHomeDir(); err == nil {
			kubeconfigPath = filepath.Join(home, ".kube", "config")
		}
	}

	m := &Manager{kubeconfigPath: kubeconfigPath}
	if err := m.reload(); err != nil {
		return m, err
	}
	return m, nil
}

func (m *Manager) KubeconfigPath() string {
	return m.kubeconfigPath
}

func (m *Manager) reload() error {
	loadingRules := &clientcmd.ClientConfigLoadingRules{ExplicitPath: m.kubeconfigPath}
	configOverrides := &clientcmd.ConfigOverrides{}
	kubeConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, configOverrides)

	config, err := kubeConfig.RawConfig()
	if err != nil {
		return fmt.Errorf("load kubeconfig: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.config = &config
	if m.currentCtx == "" {
		m.currentCtx = config.CurrentContext
	}
	return nil
}

func (m *Manager) ListContexts() []ContextInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.config == nil {
		return nil
	}

	current := m.currentCtx
	if current == "" {
		current = m.config.CurrentContext
	}

	var contexts []ContextInfo
	for name, ctx := range m.config.Contexts {
		ns := ctx.Namespace
		if ns == "" {
			ns = "default"
		}
		contexts = append(contexts, ContextInfo{
			Name:      name,
			Cluster:   ctx.Cluster,
			User:      ctx.AuthInfo,
			Namespace: ns,
			IsCurrent: name == current,
		})
	}
	return contexts
}

func (m *Manager) OpenContext(contextName string) (*SessionInfo, error) {
	m.mu.Lock()
	m.currentCtx = contextName
	m.mu.Unlock()

	if err := m.connect(); err != nil {
		return nil, err
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	ns := "default"
	if ctx, ok := m.config.Contexts[contextName]; ok && ctx.Namespace != "" {
		ns = ctx.Namespace
	}

	info := &SessionInfo{
		Context:   contextName,
		Namespace: ns,
	}

	if m.clientset != nil {
		if ver, err := m.clientset.Discovery().ServerVersion(); err == nil {
			info.ServerVersion = ver.GitVersion
		}
	}

	return info, nil
}

func (m *Manager) connect() error {
	m.mu.RLock()
	ctxName := m.currentCtx
	path := m.kubeconfigPath
	m.mu.RUnlock()

	overrides := &clientcmd.ConfigOverrides{CurrentContext: ctxName}
	loadingRules := &clientcmd.ClientConfigLoadingRules{ExplicitPath: path}
	kubeConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, overrides)

	restConfig, err := kubeConfig.ClientConfig()
	if err != nil {
		return fmt.Errorf("client config: %w", err)
	}

	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return fmt.Errorf("create clientset: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.restConfig = restConfig
	m.clientset = clientset
	return nil
}

func (m *Manager) RestConfig() (*rest.Config, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.restConfig == nil {
		return nil, fmt.Errorf("no active session")
	}
	cfg := *m.restConfig
	return &cfg, nil
}

func (m *Manager) Clientset() (kubernetes.Interface, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.clientset == nil {
		return nil, fmt.Errorf("no active session")
	}
	return m.clientset, nil
}

func (m *Manager) CurrentContext() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.currentCtx
}

func (m *Manager) SetKubeconfigPath(path string) error {
	m.mu.Lock()
	m.kubeconfigPath = path
	m.mu.Unlock()
	return m.reload()
}
