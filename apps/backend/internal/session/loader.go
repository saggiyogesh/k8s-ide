package session

import (
	"fmt"
	"os"
	"path/filepath"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

type ContextInfo struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	User      string `json:"user,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	Current   bool   `json:"current"`
}

type Loader struct {
	rules *clientcmd.ClientConfigLoadingRules
}

func NewLoader() *Loader {
	rules := clientcmd.NewDefaultClientConfigLoadingRules()

	if kubeconfig := os.Getenv("KUBECONFIG"); kubeconfig != "" {
		rules.ExplicitPath = kubeconfig
	}

	return &Loader{rules: rules}
}

func (l *Loader) RawConfig() (clientcmdapi.Config, error) {
	config, err := l.rules.Load()
	if err != nil {
		return clientcmdapi.Config{}, err
	}

	return *config, nil
}

func (l *Loader) Contexts() ([]ContextInfo, error) {
	config, err := l.RawConfig()
	if err != nil {
		return nil, err
	}

	contexts := make([]ContextInfo, 0, len(config.Contexts))
	for name, ctx := range config.Contexts {
		contexts = append(contexts, ContextInfo{
			Name:      name,
			Cluster:   ctx.Cluster,
			User:      ctx.AuthInfo,
			Namespace: ctx.Namespace,
			Current:   name == config.CurrentContext,
		})
	}

	return contexts, nil
}

func (l *Loader) RestConfig(contextName string) (*rest.Config, error) {
	overrides := &clientcmd.ConfigOverrides{}

	if contextName != "" {
		overrides.CurrentContext = contextName
	}

	clientConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(l.rules, overrides)
	return clientConfig.ClientConfig()
}

func (l *Loader) ResolveContextName(explicit string) (string, error) {
	if explicit != "" {
		return explicit, nil
	}

	config, err := l.RawConfig()
	if err != nil {
		return "", err
	}

	if config.CurrentContext == "" {
		return "", fmt.Errorf("no current kubeconfig context is set")
	}

	return config.CurrentContext, nil
}

func DefaultKubeconfigPath() string {
	if kubeconfig := os.Getenv("KUBECONFIG"); kubeconfig != "" {
		return kubeconfig
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	return filepath.Join(home, ".kube", "config")
}
