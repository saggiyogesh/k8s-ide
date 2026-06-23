package session

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// ClusterContext is a named kubeconfig context.
type ClusterContext struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	User      string `json:"user"`
	Namespace string `json:"namespace,omitempty"`
	IsCurrent bool   `json:"isCurrent"`
}

// SessionInfo describes the active session.
type SessionInfo struct {
	Context       string `json:"context"`
	ServerVersion string `json:"serverVersion"`
	Connected     bool   `json:"connected"`
}

// Session holds a single active context's Kubernetes clients.
type Session struct {
	Config          *rest.Config
	Clientset       kubernetes.Interface
	DynamicClient   dynamic.Interface
	DiscoveryClient discovery.DiscoveryInterface
	Context         string
}

// Manager is the global single-user session manager.
type Manager struct {
	mu             sync.RWMutex
	kubeconfigPath string
	rawConfig      *clientcmdapi.Config
	active         *Session
}

func NewManager(kubeconfigPath string) (*Manager, error) {
	path := kubeconfigPath
	if path == "" {
		path = defaultKubeconfigPath()
	}
	m := &Manager{kubeconfigPath: path}
	if err := m.reload(); err != nil {
		// Non-fatal; we still serve – user can load a custom path
		_ = err
	}
	return m, nil
}

func (m *Manager) reload() error {
	cfg, err := clientcmd.LoadFromFile(m.kubeconfigPath)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.rawConfig = cfg
	m.mu.Unlock()
	return nil
}

func (m *Manager) SetKubeconfigPath(path string) error {
	m.mu.Lock()
	m.kubeconfigPath = path
	m.mu.Unlock()
	return m.reload()
}

func (m *Manager) ListContexts() ([]ClusterContext, error) {
	m.mu.RLock()
	raw := m.rawConfig
	m.mu.RUnlock()

	if raw == nil {
		return nil, fmt.Errorf("no kubeconfig loaded")
	}

	var out []ClusterContext
	for name, ctx := range raw.Contexts {
		out = append(out, ClusterContext{
			Name:      name,
			Cluster:   ctx.Cluster,
			User:      ctx.AuthInfo,
			Namespace: ctx.Namespace,
			IsCurrent: name == raw.CurrentContext,
		})
	}
	return out, nil
}

func (m *Manager) OpenSession(contextName string) (*SessionInfo, error) {
	m.mu.RLock()
	raw := m.rawConfig
	m.mu.RUnlock()

	if raw == nil {
		return nil, fmt.Errorf("no kubeconfig loaded")
	}

	overrides := &clientcmd.ConfigOverrides{
		CurrentContext: contextName,
	}
	loader := clientcmd.NewDefaultClientConfig(*raw, overrides)
	restCfg, err := loader.ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("build rest config: %w", err)
	}

	cs, err := kubernetes.NewForConfig(restCfg)
	if err != nil {
		return nil, fmt.Errorf("create clientset: %w", err)
	}
	dyn, err := dynamic.NewForConfig(restCfg)
	if err != nil {
		return nil, fmt.Errorf("create dynamic client: %w", err)
	}
	disc, err := discovery.NewDiscoveryClientForConfig(restCfg)
	if err != nil {
		return nil, fmt.Errorf("create discovery client: %w", err)
	}

	sv, err := cs.Discovery().ServerVersion()
	serverVersion := "unknown"
	if err == nil {
		serverVersion = sv.GitVersion
	}

	sess := &Session{
		Config:          restCfg,
		Clientset:       cs,
		DynamicClient:   dyn,
		DiscoveryClient: disc,
		Context:         contextName,
	}

	m.mu.Lock()
	m.active = sess
	m.mu.Unlock()

	return &SessionInfo{
		Context:       contextName,
		ServerVersion: serverVersion,
		Connected:     true,
	}, nil
}

func (m *Manager) ActiveSession() (*Session, error) {
	m.mu.RLock()
	s := m.active
	m.mu.RUnlock()
	if s == nil {
		return nil, fmt.Errorf("no active session; call /api/session/open first")
	}
	return s, nil
}

func defaultKubeconfigPath() string {
	if env := os.Getenv("KUBECONFIG"); env != "" {
		return env
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".kube", "config")
}
