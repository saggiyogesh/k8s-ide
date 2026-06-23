package session

import (
	"errors"
	"os"
	"path/filepath"
	"sync"

	"sigs.k8s.io/yaml"
)

type Service struct {
	mu      sync.RWMutex
	session *SessionState
}

func NewService() *Service {
	return &Service{}
}

func (s *Service) ListContexts() ([]ContextInfo, error) {
	configPath, err := resolveKubeconfigPath()
	if err != nil {
		return demoContexts(), nil
	}

	contents, err := os.ReadFile(configPath)
	if err != nil {
		return demoContexts(), nil
	}

	var config kubeconfigFile
	if err := yaml.Unmarshal(contents, &config); err != nil {
		return demoContexts(), nil
	}

	contexts := make([]ContextInfo, 0, len(config.Contexts))
	for _, item := range config.Contexts {
		contexts = append(contexts, ContextInfo{
			Name:      item.Name,
			Cluster:   item.Context.Cluster,
			User:      item.Context.User,
			Namespace: item.Context.Namespace,
			IsCurrent: item.Name == config.CurrentContext,
		})
	}

	if len(contexts) == 0 {
		return demoContexts(), nil
	}

	return contexts, nil
}

func (s *Service) SetSession(session SessionState) {
	s.mu.Lock()
	defer s.mu.Unlock()

	copy := session
	s.session = &copy
}

func (s *Service) CurrentSession() (*SessionState, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.session == nil {
		return nil, errors.New("session not opened")
	}

	copy := *s.session
	return &copy, nil
}

func demoContexts() []ContextInfo {
	return []ContextInfo{
		{
			Name:      "local-demo",
			Cluster:   "demo",
			User:      "developer",
			Namespace: "default",
			IsCurrent: true,
		},
	}
}

type ContextInfo struct {
	Name      string
	Cluster   string
	User      string
	Namespace string
	IsCurrent bool
}

type SessionState struct {
	Context        string
	Namespace      string
	ConnectedAt    string
	BackendVersion string
}

type kubeconfigFile struct {
	CurrentContext string            `yaml:"current-context"`
	Contexts       []namedKubeconfig `yaml:"contexts"`
}

type namedKubeconfig struct {
	Name    string            `yaml:"name"`
	Context kubeconfigContext `yaml:"context"`
}

type kubeconfigContext struct {
	Cluster   string `yaml:"cluster"`
	User      string `yaml:"user"`
	Namespace string `yaml:"namespace"`
}

func resolveKubeconfigPath() (string, error) {
	if explicit := os.Getenv("KUBECONFIG"); explicit != "" {
		return explicit, nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(home, ".kube", "config"), nil
}
