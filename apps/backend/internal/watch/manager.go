package watch

import (
	"context"
	"sync"
)

type Manager[T any] struct {
	mu          sync.RWMutex
	subscribers map[string]map[chan T]struct{}
}

func NewManager[T any]() *Manager[T] {
	return &Manager[T]{
		subscribers: map[string]map[chan T]struct{}{},
	}
}

func (m *Manager[T]) Subscribe(ctx context.Context, key string) <-chan T {
	ch := make(chan T, 8)

	m.mu.Lock()
	if _, ok := m.subscribers[key]; !ok {
		m.subscribers[key] = map[chan T]struct{}{}
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

func (m *Manager[T]) Publish(key string, event T) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for subscriber := range m.subscribers[key] {
		select {
		case subscriber <- event:
		default:
		}
	}
}
