package session

import "sync"

type State struct {
	ContextName    string `json:"contextName"`
	Cluster        string `json:"cluster"`
	Namespace      string `json:"namespace,omitempty"`
	KubeconfigPath string `json:"kubeconfigPath"`
	OpenedAt       string `json:"openedAt"`
	Connected      bool   `json:"connected"`
}

type Manager struct {
	mu      sync.RWMutex
	current *State
}

func NewManager() *Manager {
	return &Manager{}
}

func (m *Manager) Current() (State, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.current == nil {
		return State{}, false
	}

	return *m.current, true
}

func (m *Manager) Set(next State) {
	m.mu.Lock()
	defer m.mu.Unlock()
	copy := next
	m.current = &copy
}
