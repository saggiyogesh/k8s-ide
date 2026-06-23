package session

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

type ContextInfo struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	User      string `json:"user"`
	Namespace string `json:"namespace,omitempty"`
	IsCurrent bool   `json:"isCurrent"`
}

type OpenRequest struct {
	Context        string `json:"context"`
	KubeconfigPath string `json:"kubeconfigPath,omitempty"`
}

type SessionInfo struct {
	Context        string `json:"context"`
	KubeconfigPath string `json:"kubeconfigPath,omitempty"`
	ConnectedAt    string `json:"connectedAt"`
	BackendVersion string `json:"backendVersion"`
}

type Manager struct {
	mu             sync.RWMutex
	backendVersion string
	current        *SessionInfo
}

func NewManager(backendVersion string) *Manager {
	return &Manager{backendVersion: backendVersion}
}

func (m *Manager) ListContexts(kubeconfigPath string) ([]ContextInfo, error) {
	rawConfig, err := loadRawConfig(kubeconfigPath)
	if err != nil {
		return nil, err
	}

	contexts := make([]ContextInfo, 0, len(rawConfig.Contexts))
	for name, item := range rawConfig.Contexts {
		contexts = append(contexts, ContextInfo{
			Name:      name,
			Cluster:   item.Cluster,
			User:      item.AuthInfo,
			Namespace: item.Namespace,
			IsCurrent: rawConfig.CurrentContext == name,
		})
	}

	return contexts, nil
}

func (m *Manager) Open(ctx context.Context, request OpenRequest) (*SessionInfo, error) {
	config, path, err := buildRESTConfig(request.Context, request.KubeconfigPath)
	if err != nil {
		return nil, err
	}

	if _, err := rest.HTTPClientFor(config); err != nil {
		return nil, err
	}

	session := &SessionInfo{
		Context:        request.Context,
		KubeconfigPath: path,
		ConnectedAt:    time.Now().UTC().Format(time.RFC3339),
		BackendVersion: m.backendVersion,
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.current = session

	return session, nil
}

func (m *Manager) ActiveSession() (*SessionInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.current == nil {
		return nil, errors.New("no active session")
	}

	copy := *m.current
	return &copy, nil
}

func (m *Manager) ResolveRESTConfig(explicitContext, explicitKubeconfigPath string) (*rest.Config, string, error) {
	if explicitContext != "" || explicitKubeconfigPath != "" {
		return buildRESTConfig(explicitContext, explicitKubeconfigPath)
	}

	active, err := m.ActiveSession()
	if err != nil {
		return nil, "", err
	}

	return buildRESTConfig(active.Context, active.KubeconfigPath)
}

func buildRESTConfig(targetContext, kubeconfigPath string) (*rest.Config, string, error) {
	path := resolveKubeconfigPath(kubeconfigPath)
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	if path != "" {
		loadingRules.ExplicitPath = path
	}

	overrides := &clientcmd.ConfigOverrides{}
	if targetContext != "" {
		overrides.CurrentContext = targetContext
	}

	config := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, overrides)
	restConfig, err := config.ClientConfig()
	if err != nil {
		return nil, "", err
	}

	return restConfig, path, nil
}

func loadRawConfig(kubeconfigPath string) (api.Config, error) {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	if kubeconfigPath != "" {
		loadingRules.ExplicitPath = resolveKubeconfigPath(kubeconfigPath)
	}

	config, err := loadingRules.Load()
	if err != nil {
		return api.Config{}, err
	}

	return *config, nil
}

func resolveKubeconfigPath(path string) string {
	if path != "" {
		return path
	}

	if envPath := os.Getenv("KUBECONFIG"); envPath != "" {
		return envPath
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	return filepath.Join(home, ".kube", "config")
}
