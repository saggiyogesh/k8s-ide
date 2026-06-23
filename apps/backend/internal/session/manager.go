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
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// Session holds the active Kubernetes client state for a single context.
type Session struct {
	Context        string
	Namespace      string
	ServerVersion  string
	RestConfig     *rest.Config
	DynamicClient  dynamic.Interface
	DiscoveryClient discovery.DiscoveryInterface
}

// Manager manages kubeconfig loading, context selection, and client creation.
// It is safe for concurrent use.
type Manager struct {
	mu            sync.RWMutex
	kubeconfigPath string
	rawConfig      clientcmdapi.Config
	active        *Session
	watcher       *fsnotify.Watcher
	onReload      func()
}

func NewManager(kubeconfigPath string) (*Manager, error) {
	if kubeconfigPath == "" {
		kubeconfigPath = defaultKubeconfigPath()
	}
	m := &Manager{kubeconfigPath: kubeconfigPath}
	if err := m.loadConfig(); err != nil {
		return nil, fmt.Errorf("load kubeconfig: %w", err)
	}
	if err := m.startWatcher(); err != nil {
		// Non-fatal: file watching is best-effort.
		_ = err
	}
	return m, nil
}

// SetReloadCallback registers a function called whenever the kubeconfig
// is reloaded from disk (fsnotify event).
func (m *Manager) SetReloadCallback(fn func()) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onReload = fn
}

// Contexts returns the list of context names from the loaded kubeconfig.
func (m *Manager) Contexts() []ContextInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []ContextInfo
	for name, ctx := range m.rawConfig.Contexts {
		out = append(out, ContextInfo{
			Name:      name,
			Cluster:   ctx.Cluster,
			User:      ctx.AuthInfo,
			Namespace: ctx.Namespace,
		})
	}
	return out
}

// Open activates the given context and builds the Kubernetes clients.
func (m *Manager) Open(ctx context.Context, contextName string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cfg := clientcmd.NewNonInteractiveClientConfig(
		m.rawConfig,
		contextName,
		&clientcmd.ConfigOverrides{},
		nil,
	)
	restCfg, err := cfg.ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("build rest config for context %q: %w", contextName, err)
	}

	dynClient, err := dynamic.NewForConfig(restCfg)
	if err != nil {
		return nil, fmt.Errorf("create dynamic client: %w", err)
	}
	discClient, err := discovery.NewDiscoveryClientForConfig(restCfg)
	if err != nil {
		return nil, fmt.Errorf("create discovery client: %w", err)
	}

	sv, err := discClient.ServerVersion()
	if err != nil {
		return nil, fmt.Errorf("get server version: %w", err)
	}

	raw, err := cfg.RawConfig()
	if err != nil {
		return nil, err
	}
	ns := ""
	if kctx, ok := raw.Contexts[contextName]; ok {
		ns = kctx.Namespace
	}
	if ns == "" {
		ns = "default"
	}

	sess := &Session{
		Context:         contextName,
		Namespace:       ns,
		ServerVersion:   sv.GitVersion,
		RestConfig:      restCfg,
		DynamicClient:   dynClient,
		DiscoveryClient: discClient,
	}
	m.active = sess
	return sess, nil
}

// Active returns the currently open session or nil.
func (m *Manager) Active() *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.active
}

// KubeconfigPath returns the path used for loading kubeconfig.
func (m *Manager) KubeconfigPath() string {
	return m.kubeconfigPath
}

func (m *Manager) loadConfig() error {
	rules := &clientcmd.ClientConfigLoadingRules{ExplicitPath: m.kubeconfigPath}
	rawConfig, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		rules, &clientcmd.ConfigOverrides{},
	).RawConfig()
	if err != nil {
		return err
	}
	m.rawConfig = rawConfig
	return nil
}

func (m *Manager) startWatcher() error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	if err := w.Add(m.kubeconfigPath); err != nil {
		w.Close()
		return err
	}
	m.watcher = w
	go func() {
		for {
			select {
			case ev, ok := <-w.Events:
				if !ok {
					return
				}
				if ev.Has(fsnotify.Write) || ev.Has(fsnotify.Create) {
					m.mu.Lock()
					_ = m.loadConfig()
					cb := m.onReload
					m.mu.Unlock()
					if cb != nil {
						cb()
					}
				}
			case _, ok := <-w.Errors:
				if !ok {
					return
				}
			}
		}
	}()
	return nil
}

func (m *Manager) Close() {
	if m.watcher != nil {
		m.watcher.Close()
	}
}

func defaultKubeconfigPath() string {
	if kc := os.Getenv("KUBECONFIG"); kc != "" {
		return kc
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".kube", "config")
}

// ContextInfo is a serialisable summary of one kubeconfig context.
type ContextInfo struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	User      string `json:"user"`
	Namespace string `json:"namespace"`
}
