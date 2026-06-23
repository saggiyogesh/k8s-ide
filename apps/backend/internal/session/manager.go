package session

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/fsnotify/fsnotify"
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
	mu          sync.RWMutex
	kubeconfig  string
	config      *api.Config
	currentCtx  string
	restConfig  *rest.Config
	clientset   kubernetes.Interface
	watcher     *fsnotify.Watcher
	onReload    []func()
}

func defaultKubeconfig() string {
	if p := os.Getenv("KUBECONFIG"); p != "" {
		return p
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".kube", "config")
}

func NewManager(kubeconfig string) (*Manager, error) {
	if kubeconfig == "" {
		kubeconfig = defaultKubeconfig()
	}

	m := &Manager{kubeconfig: kubeconfig}
	if err := m.load(); err != nil {
		return nil, err
	}

	w, err := fsnotify.NewWatcher()
	if err == nil {
		m.watcher = w
		_ = w.Add(kubeconfig)
		go m.watchKubeconfig()
	}

	return m, nil
}

func (m *Manager) load() error {
	cfg, err := clientcmd.LoadFromFile(m.kubeconfig)
	if err != nil {
		return fmt.Errorf("load kubeconfig: %w", err)
	}
	m.config = cfg
	m.currentCtx = cfg.CurrentContext
	return m.reloadClients()
}

func (m *Manager) reloadClients() error {
	overrides := &clientcmd.ConfigOverrides{CurrentContext: m.currentCtx}
	loading := clientcmd.NewDefaultClientConfig(*m.config, overrides)
	restCfg, err := loading.ClientConfig()
	if err != nil {
		return err
	}
	cs, err := kubernetes.NewForConfig(restCfg)
	if err != nil {
		return err
	}
	m.restConfig = restCfg
	m.clientset = cs
	return nil
}

func (m *Manager) watchKubeconfig() {
	for {
		select {
		case event, ok := <-m.watcher.Events:
			if !ok {
				return
			}
			if event.Op&(fsnotify.Write|fsnotify.Create) != 0 {
				_ = m.load()
				m.mu.RLock()
				cbs := m.onReload
				m.mu.RUnlock()
				for _, cb := range cbs {
					cb()
				}
			}
		case _, ok := <-m.watcher.Errors:
			if !ok {
				return
			}
		}
	}
}

func (m *Manager) ListContexts() []ContextInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var out []ContextInfo
	for name, ctx := range m.config.Contexts {
		out = append(out, ContextInfo{
			Name:      name,
			Cluster:   ctx.Cluster,
			User:      ctx.AuthInfo,
			Namespace: ctx.Namespace,
			IsCurrent: name == m.currentCtx,
		})
	}
	return out
}

func (m *Manager) OpenSession(contextName string) (*SessionInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.config.Contexts[contextName]; !ok {
		return nil, fmt.Errorf("context %q not found", contextName)
	}
	m.currentCtx = contextName
	if err := m.reloadClients(); err != nil {
		return nil, err
	}

	ns := m.config.Contexts[contextName].Namespace
	if ns == "" {
		ns = "default"
	}

	info := &SessionInfo{Context: contextName, Namespace: ns}
	if m.clientset != nil {
		ver, err := m.clientset.Discovery().ServerVersion()
		if err == nil {
			info.ServerVersion = ver.GitVersion
		}
	}
	return info, nil
}

func (m *Manager) RestConfig() *rest.Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.restConfig
}

func (m *Manager) Clientset() kubernetes.Interface {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.clientset
}

func (m *Manager) CurrentContext() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.currentCtx
}

func (m *Manager) OnReload(cb func()) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onReload = append(m.onReload, cb)
}
