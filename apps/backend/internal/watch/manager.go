package watch

import (
	"context"
	"sync"

	"github.com/cursor/k8s-ide/apps/backend/internal/k8s"
)

type Manager struct {
	mu          sync.RWMutex
	subscribers map[string]map[chan k8s.WatchEvent]struct{}
}

func NewManager() *Manager {
	return &Manager{
		subscribers: map[string]map[chan k8s.WatchEvent]struct{}{},
	}
}

func (m *Manager) Subscribe(ctx context.Context, key string) <-chan k8s.WatchEvent {
	ch := make(chan k8s.WatchEvent, 8)

	m.mu.Lock()
	if _, ok := m.subscribers[key]; !ok {
		m.subscribers[key] = map[chan k8s.WatchEvent]struct{}{}
	}
	m.subscribers[key][ch] = struct{}{}
	m.mu.Unlock()

	go func() {
		<-ctx.Done()
		m.mu.Lock()
		delete(m.subscribers[key], ch)
		if len(m.subscribers[key]) == 0 {
			delete(m.subscribers, key)
		}
		m.mu.Unlock()
		close(ch)
	}()

	return ch
}

func (m *Manager) Publish(key string, event k8s.WatchEvent) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for subscriber := range m.subscribers[key] {
		select {
		case subscriber <- event:
		default:
		}
	}
}
