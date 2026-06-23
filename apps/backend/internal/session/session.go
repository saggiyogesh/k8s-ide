package session

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/fsnotify/fsnotify"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

type ContextInfo struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	User      string `json:"user"`
	Namespace string `json:"namespace"`
	Current   bool   `json:"current"`
}

type SessionInfo struct {
	Context       string   `json:"context"`
	ServerVersion string   `json:"serverVersion"`
	Namespaces    []string `json:"namespaces"`
}

type ClusterClients struct {
	Config           *rest.Config
	Clientset        kubernetes.Interface
	Dynamic          dynamic.Interface
	Discovery        discovery.DiscoveryInterface
	CurrentContext   string
	CurrentNamespace string
}

type Manager struct {
	mu          sync.RWMutex
	kubeconfig  string
	rawConfig   clientcmdapi.Config
	clients     *ClusterClients
	watcher     *fsnotify.Watcher
}

func NewManager(kubeconfig string) *Manager {
	if kubeconfig == "" {
		if env := os.Getenv("KUBECONFIG"); env != "" {
			kubeconfig = env
		} else {
			home, _ := os.UserHomeDir()
			kubeconfig = filepath.Join(home, ".kube", "config")
		}
	}
	m := &Manager{kubeconfig: kubeconfig}
	_ = m.reloadConfig()
	m.startWatcher()
	return m
}

func (m *Manager) reloadConfig() error {
	cfg, err := clientcmd.LoadFromFile(m.kubeconfig)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.rawConfig = *cfg
	m.mu.Unlock()
	return nil
}

func (m *Manager) startWatcher() {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return
	}
	m.watcher = w
	dir := filepath.Dir(m.kubeconfig)
	_ = w.Add(dir)
	go func() {
		for {
			select {
			case ev, ok := <-w.Events:
				if !ok {
					return
				}
				if ev.Name == m.kubeconfig && (ev.Op&fsnotify.Write != 0 || ev.Op&fsnotify.Create != 0) {
					_ = m.reloadConfig()
				}
			case _, ok := <-w.Errors:
				if !ok {
					return
				}
			}
		}
	}()
}

func (m *Manager) ListContexts() ([]ContextInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.rawConfig.Contexts == nil {
		return []ContextInfo{}, nil
	}
	current := m.rawConfig.CurrentContext
	out := make([]ContextInfo, 0, len(m.rawConfig.Contexts))
	for name, ctx := range m.rawConfig.Contexts {
		cluster := ""
		user := ""
		ns := "default"
		if ctx != nil {
			cluster = ctx.Cluster
			user = ctx.AuthInfo
			if ctx.Namespace != "" {
				ns = ctx.Namespace
			}
		}
		out = append(out, ContextInfo{
			Name:      name,
			Cluster:   cluster,
			User:      user,
			Namespace: ns,
			Current:   name == current,
		})
	}
	return out, nil
}

func (m *Manager) OpenContext(ctxName string) (*SessionInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	overrides := &clientcmd.ConfigOverrides{CurrentContext: ctxName}
	loading := &clientcmd.ClientConfigLoadingRules{ExplicitPath: m.kubeconfig}
	cc := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loading, overrides)

	config, err := cc.ClientConfig()
	if err != nil {
		return nil, err
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, err
	}
	dyn, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, err
	}
	disc, err := discovery.NewDiscoveryClientForConfig(config)
	if err != nil {
		return nil, err
	}

	ns := "default"
	if ctx, ok := m.rawConfig.Contexts[ctxName]; ok && ctx.Namespace != "" {
		ns = ctx.Namespace
	}

	m.clients = &ClusterClients{
		Config:           config,
		Clientset:        clientset,
		Dynamic:          dyn,
		Discovery:        disc,
		CurrentContext:   ctxName,
		CurrentNamespace: ns,
	}

	version, err := disc.ServerVersion()
	if err != nil {
		return nil, err
	}

	namespaces, _ := listNamespaceNames(context.Background(), clientset)

	return &SessionInfo{
		Context:       ctxName,
		ServerVersion: version.GitVersion,
		Namespaces:    namespaces,
	}, nil
}

func listNamespaceNames(ctx context.Context, cs kubernetes.Interface) ([]string, error) {
	list, err := cs.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(list.Items))
	for _, ns := range list.Items {
		out = append(out, ns.Name)
	}
	return out, nil
}

func (m *Manager) Clients() (*ClusterClients, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.clients == nil {
		return nil, fmt.Errorf("no active session: call open session first")
	}
	return m.clients, nil
}

func (m *Manager) KubeconfigPath() string {
	return m.kubeconfig
}
