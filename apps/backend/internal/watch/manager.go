package watch

import (
	"sync"
	"time"
)

type StreamState struct {
	Key          string    `json:"key"`
	Subscribers  int       `json:"subscribers"`
	LastActivity time.Time `json:"lastActivity"`
}

type Manager struct {
	mu      sync.RWMutex
	streams map[string]*StreamState
}

func NewManager() *Manager {
	return &Manager{
		streams: make(map[string]*StreamState),
	}
}

func (m *Manager) Touch(key string) StreamState {
	m.mu.Lock()
	defer m.mu.Unlock()

	stream, ok := m.streams[key]
	if !ok {
		stream = &StreamState{Key: key}
		m.streams[key] = stream
	}

	stream.Subscribers++
	stream.LastActivity = time.Now().UTC()
	return *stream
}

func (m *Manager) Snapshot() []StreamState {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]StreamState, 0, len(m.streams))
	for _, stream := range m.streams {
		out = append(out, *stream)
	}

	return out
}
