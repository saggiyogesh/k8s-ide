package session

import (
	"context"
	"fmt"
	"sort"
	"sync"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

type ClusterContext struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster,omitempty"`
	User      string `json:"user,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	IsCurrent bool   `json:"isCurrent"`
}

type SessionInfo struct {
	Context        string   `json:"context"`
	Namespace      string   `json:"namespace,omitempty"`
	BackendVersion string   `json:"backendVersion"`
	Capabilities   []string `json:"capabilities"`
	Transport      []string `json:"transport"`
}

type Manager struct {
	explicitKubeconfig string
	mu                 sync.RWMutex
	currentContext     string
}

func NewManager(kubeconfigPath string) *Manager {
	return &Manager{explicitKubeconfig: kubeconfigPath}
}

func (m *Manager) loader() *clientcmd.ClientConfigLoadingRules {
	rules := clientcmd.NewDefaultClientConfigLoadingRules()
	if m.explicitKubeconfig != "" {
		rules.ExplicitPath = m.explicitKubeconfig
	}
	return rules
}

func (m *Manager) loadConfig() (*clientcmdapi.Config, error) {
	return m.loader().Load()
}

func (m *Manager) resolveContext(config *clientcmdapi.Config, requested string) (string, error) {
	switch {
	case requested != "":
		if _, ok := config.Contexts[requested]; !ok {
			return "", fmt.Errorf("context %q not found", requested)
		}
		return requested, nil
	case m.CurrentContext() != "":
		if _, ok := config.Contexts[m.CurrentContext()]; ok {
			return m.CurrentContext(), nil
		}
	}

	if config.CurrentContext == "" {
		return "", fmt.Errorf("kubeconfig does not define a current context")
	}
	return config.CurrentContext, nil
}

func (m *Manager) CurrentContext() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.currentContext
}

func (m *Manager) setCurrentContext(name string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.currentContext = name
}

func (m *Manager) ListContexts(context.Context) ([]ClusterContext, error) {
	config, err := m.loadConfig()
	if err != nil {
		return nil, err
	}

	names := make([]string, 0, len(config.Contexts))
	for name := range config.Contexts {
		names = append(names, name)
	}
	sort.Strings(names)

	contexts := make([]ClusterContext, 0, len(config.Contexts))
	for _, name := range names {
		ctx := config.Contexts[name]
		contexts = append(contexts, ClusterContext{
			Name:      name,
			Cluster:   ctx.Cluster,
			User:      ctx.AuthInfo,
			Namespace: ctx.Namespace,
			IsCurrent: name == config.CurrentContext,
		})
	}

	return contexts, nil
}

func (m *Manager) OpenSession(_ context.Context, requested string) (SessionInfo, error) {
	config, err := m.loadConfig()
	if err != nil {
		return SessionInfo{}, err
	}

	contextName, err := m.resolveContext(config, requested)
	if err != nil {
		return SessionInfo{}, err
	}
	m.setCurrentContext(contextName)

	namespace, err := m.Namespace(contextName)
	if err != nil {
		return SessionInfo{}, err
	}

	return SessionInfo{
		Context:        contextName,
		Namespace:      namespace,
		BackendVersion: "0.1.0",
		Capabilities:   []string{"discovery", "crud", "watch", "apply", "scale", "restart"},
		Transport:      []string{"http", "websocket"},
	}, nil
}

func (m *Manager) RESTConfig(requested string) (*rest.Config, error) {
	config, err := m.loadConfig()
	if err != nil {
		return nil, err
	}

	contextName, err := m.resolveContext(config, requested)
	if err != nil {
		return nil, err
	}

	clientConfig := clientcmd.NewDefaultClientConfig(*config, &clientcmd.ConfigOverrides{
		CurrentContext: contextName,
	})
	return clientConfig.ClientConfig()
}

func (m *Manager) Namespace(requested string) (string, error) {
	config, err := m.loadConfig()
	if err != nil {
		return "", err
	}

	contextName, err := m.resolveContext(config, requested)
	if err != nil {
		return "", err
	}

	clientConfig := clientcmd.NewDefaultClientConfig(*config, &clientcmd.ConfigOverrides{
		CurrentContext: contextName,
	})
	namespace, _, err := clientConfig.Namespace()
	if err != nil {
		return "", err
	}
	return namespace, nil
}
