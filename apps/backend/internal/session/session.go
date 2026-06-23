// Package session manages a single-user Kubernetes session: kubeconfig loading,
// context selection, and client construction.
package session

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/fsnotify/fsnotify"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// Session holds the active Kubernetes clients for a single context.
type Session struct {
	ContextName    string
	ServerVersion  string
	Config         *rest.Config
	Kubernetes     kubernetes.Interface
	Dynamic        dynamic.Interface
	Discovery      discovery.DiscoveryInterface

	mu sync.RWMutex
}

// Manager owns the kubeconfig and the active session.
type Manager struct {
	kubeconfigPath string
	watcher        *fsnotify.Watcher
	mu             sync.RWMutex
	active         *Session
	rawConfig      *clientcmdapi.Config
	onChange       func()
}

// NewManager creates a Manager loading from the given kubeconfig path.
// Pass an empty string to use the default (~/.kube/config or $KUBECONFIG).
func NewManager(kubeconfigPath string, onChange func()) (*Manager, error) {
	if kubeconfigPath == "" {
		kubeconfigPath = defaultKubeconfigPath()
	}
	m := &Manager{kubeconfigPath: kubeconfigPath, onChange: onChange}
	if err := m.reload(); err != nil {
		return nil, err
	}

	w, err := fsnotify.NewWatcher()
	if err == nil {
		_ = w.Add(kubeconfigPath)
		m.watcher = w
		go m.watchLoop()
	}

	return m, nil
}

func (m *Manager) watchLoop() {
	for {
		select {
		case _, ok := <-m.watcher.Events:
			if !ok {
				return
			}
			_ = m.reload()
			if m.onChange != nil {
				m.onChange()
			}
		case _, ok := <-m.watcher.Errors:
			if !ok {
				return
			}
		}
	}
}

func (m *Manager) reload() error {
	raw, err := clientcmd.LoadFromFile(m.kubeconfigPath)
	if err != nil {
		return fmt.Errorf("loading kubeconfig: %w", err)
	}
	m.mu.Lock()
	m.rawConfig = raw
	m.mu.Unlock()
	return nil
}

// Contexts returns all contexts defined in the current kubeconfig.
func (m *Manager) Contexts() []ContextInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.rawConfig == nil {
		return nil
	}
	out := make([]ContextInfo, 0, len(m.rawConfig.Contexts))
	for name, ctx := range m.rawConfig.Contexts {
		ci := ContextInfo{
			Name:    name,
			Cluster: ctx.Cluster,
			User:    ctx.AuthInfo,
		}
		if ns := ctx.Namespace; ns != "" {
			ci.Namespace = &ns
		}
		out = append(out, ci)
	}
	return out
}

// ContextInfo is a wire-safe representation of a kubeconfig context.
type ContextInfo struct {
	Name      string  `json:"name"`
	Cluster   string  `json:"cluster"`
	User      string  `json:"user"`
	Namespace *string `json:"namespace,omitempty"`
}

// OpenSession activates a context and builds the Kubernetes clients.
func (m *Manager) OpenSession(ctx context.Context, contextName string) (*Session, error) {
	m.mu.RLock()
	raw := m.rawConfig
	m.mu.RUnlock()

	loader := clientcmd.NewDefaultClientConfig(
		*raw,
		&clientcmd.ConfigOverrides{CurrentContext: contextName},
	)
	restCfg, err := loader.ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("building rest config: %w", err)
	}

	kclient, err := kubernetes.NewForConfig(restCfg)
	if err != nil {
		return nil, fmt.Errorf("building kubernetes client: %w", err)
	}

	dyn, err := dynamic.NewForConfig(restCfg)
	if err != nil {
		return nil, fmt.Errorf("building dynamic client: %w", err)
	}

	disc, err := discovery.NewDiscoveryClientForConfig(restCfg)
	if err != nil {
		return nil, fmt.Errorf("building discovery client: %w", err)
	}

	sv, err := kclient.Discovery().ServerVersion()
	if err != nil {
		return nil, fmt.Errorf("getting server version: %w", err)
	}

	sess := &Session{
		ContextName:   contextName,
		ServerVersion: sv.GitVersion,
		Config:        restCfg,
		Kubernetes:    kclient,
		Dynamic:       dyn,
		Discovery:     disc,
	}

	m.mu.Lock()
	m.active = sess
	m.mu.Unlock()

	return sess, nil
}

// Active returns the current session or nil.
func (m *Manager) Active() *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.active
}

// Close tears down the kubeconfig watcher.
func (m *Manager) Close() {
	if m.watcher != nil {
		_ = m.watcher.Close()
	}
}

func defaultKubeconfigPath() string {
	if kc := os.Getenv("KUBECONFIG"); kc != "" {
		return kc
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".kube", "config")
}
