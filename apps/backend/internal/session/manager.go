package session

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

type ContextInfo struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	User      string `json:"user"`
	Namespace string `json:"namespace,omitempty"`
	IsCurrent bool   `json:"isCurrent"`
}

type ActiveSession struct {
	Context        string
	KubeconfigPath string
	ConnectedAt    time.Time
	RestConfig     *rest.Config
	RawConfig      clientcmdapi.Config
}

type Manager struct {
	mu      sync.RWMutex
	current *ActiveSession
}

func NewManager() *Manager {
	return &Manager{}
}

func (m *Manager) ListContexts(kubeconfigPath string) ([]ContextInfo, string, error) {
	path, err := resolveKubeconfigPath(kubeconfigPath)
	if err != nil {
		return nil, "", err
	}

	config, err := clientcmd.LoadFromFile(path)
	if err != nil {
		return nil, "", err
	}

	contexts := make([]ContextInfo, 0, len(config.Contexts))
	for name, context := range config.Contexts {
		contexts = append(contexts, ContextInfo{
			Name:      name,
			Cluster:   context.Cluster,
			User:      context.AuthInfo,
			Namespace: context.Namespace,
			IsCurrent: name == config.CurrentContext,
		})
	}

	return contexts, path, nil
}

func (m *Manager) Open(contextName, kubeconfigPath string) (*ActiveSession, error) {
	path, err := resolveKubeconfigPath(kubeconfigPath)
	if err != nil {
		return nil, err
	}

	rawConfig, err := clientcmd.LoadFromFile(path)
	if err != nil {
		return nil, err
	}

	effectiveContext := contextName
	if effectiveContext == "" {
		effectiveContext = rawConfig.CurrentContext
	}
	if effectiveContext == "" {
		return nil, errors.New("no Kubernetes context selected")
	}
	if _, exists := rawConfig.Contexts[effectiveContext]; !exists {
		return nil, errors.New("requested Kubernetes context does not exist in kubeconfig")
	}

	clientConfig := clientcmd.NewNonInteractiveClientConfig(
		*rawConfig,
		effectiveContext,
		&clientcmd.ConfigOverrides{CurrentContext: effectiveContext},
		nil,
	)

	restConfig, err := clientConfig.ClientConfig()
	if err != nil {
		return nil, err
	}

	session := &ActiveSession{
		Context:        effectiveContext,
		KubeconfigPath: path,
		ConnectedAt:    time.Now().UTC(),
		RestConfig:     restConfig,
		RawConfig:      *rawConfig,
	}

	m.mu.Lock()
	m.current = session
	m.mu.Unlock()

	return session, nil
}

func (m *Manager) Current() (*ActiveSession, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.current == nil {
		return nil, errors.New("no active session")
	}

	copy := *m.current
	return &copy, nil
}

func resolveKubeconfigPath(explicit string) (string, error) {
	if explicit != "" {
		return explicit, nil
	}

	if envPath := os.Getenv("KUBECONFIG"); envPath != "" {
		return envPath, nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	path := filepath.Join(home, ".kube", "config")
	if _, err := os.Stat(path); err != nil {
		return "", err
	}

	return path, nil
}
