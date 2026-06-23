package session

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
	"k8s.io/client-go/tools/clientcmd"
)

type Store struct {
	kubeconfigPath string

	mu             sync.RWMutex
	currentContext string
}

func NewStore(kubeconfigPath string) (*Store, error) {
	resolved, err := resolveKubeconfigPath(kubeconfigPath)
	if err != nil {
		return nil, err
	}

	config, err := clientcmd.LoadFromFile(resolved)
	if err != nil {
		return nil, fmt.Errorf("load kubeconfig: %w", err)
	}

	return &Store{
		kubeconfigPath: resolved,
		currentContext: config.CurrentContext,
	}, nil
}

func (s *Store) LoadConfig() (*clientcmdapi.Config, error) {
	return clientcmd.LoadFromFile(s.kubeconfigPath)
}

func (s *Store) KubeconfigPath() string {
	return s.kubeconfigPath
}

func (s *Store) CurrentContext() string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.currentContext
}

func (s *Store) SetCurrentContext(name string) error {
	config, err := s.LoadConfig()
	if err != nil {
		return err
	}

	if _, ok := config.Contexts[name]; !ok {
		return fmt.Errorf("unknown context %q", name)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.currentContext = name

	return nil
}

func (s *Store) ClientConfig() clientcmd.ClientConfig {
	overrides := &clientcmd.ConfigOverrides{
		CurrentContext: s.CurrentContext(),
	}

	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		&clientcmd.ClientConfigLoadingRules{ExplicitPath: s.kubeconfigPath},
		overrides,
	)
}

func resolveKubeconfigPath(explicitPath string) (string, error) {
	if explicitPath != "" {
		return explicitPath, nil
	}

	if envPath := os.Getenv("KUBECONFIG"); envPath != "" {
		return envPath, nil
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}

	return filepath.Join(homeDir, ".kube", "config"), nil
}
