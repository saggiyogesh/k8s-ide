package session

import "sync"

type Manager struct {
	mu        sync.RWMutex
	context   string
	namespace string
}

func NewManager() *Manager {
	return &Manager{}
}

func (m *Manager) Set(context, namespace string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.context = context
	m.namespace = namespace
}

func (m *Manager) Context() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.context
}

func (m *Manager) Namespace() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.namespace
}
