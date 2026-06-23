package watch

import (
	"context"
	"fmt"
	"sync"

	"github.com/k8s-ide/k8s-ide/apps/backend/internal/k8s"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	k8swatch "k8s.io/apimachinery/pkg/watch"
)

type Event struct {
	Type            string         `json:"type"`
	Object          map[string]any `json:"object"`
	ResourceVersion string         `json:"resourceVersion,omitempty"`
}

type Manager struct {
	mu      sync.Mutex
	engine  *k8s.Engine
	streams map[string]*stream
}

type stream struct {
	query       k8s.ResourceQuery
	watch       k8swatch.Interface
	cancel      context.CancelFunc
	subscribers map[chan Event]struct{}
}

func NewManager(engine *k8s.Engine) *Manager {
	return &Manager{
		engine:  engine,
		streams: map[string]*stream{},
	}
}

func (m *Manager) Subscribe(ctx context.Context, query k8s.ResourceQuery) (<-chan Event, func(), error) {
	key := streamKey(query)

	m.mu.Lock()
	current, ok := m.streams[key]
	if !ok {
		watchCtx, cancel := context.WithCancel(context.Background())
		resourceWatch, err := m.engine.WatchResource(watchCtx, query)
		if err != nil {
			cancel()
			m.mu.Unlock()
			return nil, nil, err
		}

		current = &stream{
			query:       query,
			watch:       resourceWatch,
			cancel:      cancel,
			subscribers: map[chan Event]struct{}{},
		}
		m.streams[key] = current
		go m.runStream(key, current)
	}

	ch := make(chan Event, 32)
	current.subscribers[ch] = struct{}{}
	m.mu.Unlock()

	unsubscribe := func() {
		m.mu.Lock()
		defer m.mu.Unlock()

		if active, exists := m.streams[key]; exists {
			delete(active.subscribers, ch)
			close(ch)
			if len(active.subscribers) == 0 {
				active.cancel()
				active.watch.Stop()
				delete(m.streams, key)
			}
		}
	}

	go func() {
		<-ctx.Done()
		unsubscribe()
	}()

	return ch, unsubscribe, nil
}

func (m *Manager) runStream(key string, current *stream) {
	for event := range current.watch.ResultChan() {
		object, ok := event.Object.(*unstructured.Unstructured)
		if !ok {
			continue
		}

		payload := Event{
			Type:            string(event.Type),
			Object:          object.Object,
			ResourceVersion: object.GetResourceVersion(),
		}

		m.mu.Lock()
		for subscriber := range current.subscribers {
			select {
			case subscriber <- payload:
			default:
			}
		}
		m.mu.Unlock()
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if active, exists := m.streams[key]; exists && active == current {
		current.cancel()
		delete(m.streams, key)
	}
}

func streamKey(query k8s.ResourceQuery) string {
	return fmt.Sprintf(
		"%s:%s:%s:%s:%s:%s:%s",
		query.Context,
		query.Group,
		query.Version,
		query.Resource,
		query.Namespace,
		query.LabelSelector,
		query.FieldSelector,
	)
}
