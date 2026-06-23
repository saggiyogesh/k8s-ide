package watchmanager

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8swatch "k8s.io/apimachinery/pkg/watch"
)

type SubscriptionOptions struct {
	GVR           schema.GroupVersionResource
	Namespace     string
	LabelSelector string
	FieldSelector string
}

type Event struct {
	Type   string `json:"type"`
	Object any    `json:"object"`
}

type Factory func(ctx context.Context, opts SubscriptionOptions) (k8swatch.Interface, error)

type stream struct {
	opts        SubscriptionOptions
	ctx         context.Context
	cancel      context.CancelFunc
	mu          sync.RWMutex
	subscribers map[int]chan Event
	nextID      int
}

type Manager struct {
	factory Factory

	mu      sync.Mutex
	streams map[string]*stream
}

func NewManager(factory Factory) *Manager {
	return &Manager{
		factory: factory,
		streams: map[string]*stream{},
	}
}

func (m *Manager) Subscribe(ctx context.Context, opts SubscriptionOptions) (<-chan Event, func(), error) {
	key := subscriptionKey(opts)

	m.mu.Lock()
	current, exists := m.streams[key]
	if !exists {
		streamCtx, cancel := context.WithCancel(context.Background())
		current = &stream{
			opts:        opts,
			ctx:         streamCtx,
			cancel:      cancel,
			subscribers: map[int]chan Event{},
		}
		m.streams[key] = current
		go m.run(key, current)
	}
	m.mu.Unlock()

	current.mu.Lock()
	id := current.nextID
	current.nextID++
	ch := make(chan Event, 32)
	current.subscribers[id] = ch
	current.mu.Unlock()

	var unsubscribeOnce sync.Once
	unsubscribe := func() {
		unsubscribeOnce.Do(func() {
			current.mu.Lock()
			if subscriber, exists := current.subscribers[id]; exists {
				delete(current.subscribers, id)
				close(subscriber)
			}
			remaining := len(current.subscribers)
			current.mu.Unlock()

			if remaining == 0 {
				current.cancel()
				m.mu.Lock()
				delete(m.streams, key)
				m.mu.Unlock()
			}
		})
	}

	go func() {
		<-ctx.Done()
		unsubscribe()
	}()

	return ch, unsubscribe, nil
}

func (m *Manager) run(key string, current *stream) {
	defer func() {
		current.cancel()
		m.mu.Lock()
		delete(m.streams, key)
		m.mu.Unlock()
	}()

	backoff := time.Second
	for {
		select {
		case <-current.ctx.Done():
			return
		default:
		}

		watcher, err := m.factory(current.ctx, current.opts)
		if err != nil {
			m.broadcast(current, Event{
				Type:   "ERROR",
				Object: map[string]string{"message": err.Error()},
			})
			time.Sleep(backoff)
			if backoff < 10*time.Second {
				backoff *= 2
			}
			continue
		}

		backoff = time.Second
		m.broadcast(current, Event{
			Type:   "SYNC",
			Object: map[string]string{"message": "watch established"},
		})

		if !m.consume(current, watcher) {
			return
		}
	}
}

func (m *Manager) consume(current *stream, watcher k8swatch.Interface) bool {
	defer watcher.Stop()

	for {
		select {
		case <-current.ctx.Done():
			return false
		case event, ok := <-watcher.ResultChan():
			if !ok {
				return true
			}

			payload := Event{
				Type: string(event.Type),
			}

			if event.Object != nil {
				payload.Object = objectPayload(event.Object)
			}

			m.broadcast(current, payload)
		}
	}
}

func (m *Manager) broadcast(current *stream, event Event) {
	current.mu.RLock()
	defer current.mu.RUnlock()

	for _, subscriber := range current.subscribers {
		select {
		case subscriber <- event:
		default:
		}
	}
}

func objectPayload(object runtime.Object) any {
	if object == nil {
		return nil
	}

	data, err := json.Marshal(object)
	if err != nil {
		return map[string]string{"message": err.Error()}
	}

	var payload any
	if err := json.Unmarshal(data, &payload); err != nil {
		return map[string]string{"message": err.Error()}
	}

	return payload
}

func subscriptionKey(opts SubscriptionOptions) string {
	return fmt.Sprintf(
		"%s|%s|%s|%s",
		opts.GVR.String(),
		opts.Namespace,
		opts.LabelSelector,
		opts.FieldSelector,
	)
}
