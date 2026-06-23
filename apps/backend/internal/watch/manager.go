// Package watch provides a shared watch manager that multiplexes a single
// server-side watch per GVR+namespace combo to many WebSocket subscribers.
package watch

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
)

// Event is the JSON shape sent over the WebSocket to clients.
type Event struct {
	Type   string                     `json:"type"`
	Object *unstructured.Unstructured `json:"object"`
}

// Subscriber receives watch events.
type Subscriber chan Event

// WatchKey identifies a unique watch stream.
type WatchKey struct {
	GVR           schema.GroupVersionResource
	Namespace     string
	LabelSelector string
}

type watchStream struct {
	key         WatchKey
	subs        map[uint64]Subscriber
	nextID      uint64
	mu          sync.Mutex
	cancel      context.CancelFunc
	lastVersion string
}

// Manager multiplexes watch streams across subscribers.
type Manager struct {
	dynamic dynamic.Interface
	mu      sync.Mutex
	streams map[WatchKey]*watchStream
}

// NewManager creates a new watch Manager.
func NewManager(dyn dynamic.Interface) *Manager {
	return &Manager{
		dynamic: dyn,
		streams: make(map[WatchKey]*watchStream),
	}
}

// Subscribe registers a new subscriber for the given watch key.
// It returns a channel of events and an unsubscribe function.
func (m *Manager) Subscribe(ctx context.Context, key WatchKey) (<-chan Event, func()) {
	ch := make(Subscriber, 128)

	m.mu.Lock()
	ws, ok := m.streams[key]
	if !ok {
		ws = &watchStream{key: key, subs: make(map[uint64]Subscriber)}
		m.streams[key] = ws
		go m.runStream(ws)
	}
	ws.mu.Lock()
	id := ws.nextID
	ws.nextID++
	ws.subs[id] = ch
	ws.mu.Unlock()
	m.mu.Unlock()

	unsubscribe := func() {
		ws.mu.Lock()
		delete(ws.subs, id)
		empty := len(ws.subs) == 0
		ws.mu.Unlock()

		if empty {
			m.mu.Lock()
			if s, ok := m.streams[key]; ok && len(s.subs) == 0 {
				s.cancel()
				delete(m.streams, key)
			}
			m.mu.Unlock()
		}

		close(ch)
	}

	return ch, unsubscribe
}

func (m *Manager) runStream(ws *watchStream) {
	backoff := 1 * time.Second
	maxBackoff := 30 * time.Second

	ctx, cancel := context.WithCancel(context.Background())
	ws.cancel = cancel

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		listOpts := metav1.ListOptions{
			ResourceVersion: ws.lastVersion,
			LabelSelector:   ws.key.LabelSelector,
			Watch:           true,
		}

		ri := m.ri(ws.key)
		watcher, err := ri.Watch(ctx, listOpts)
		if err != nil {
			// Back off and retry.
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			backoff = min(backoff*2, maxBackoff)
			continue
		}
		backoff = 1 * time.Second

		for event := range watcher.ResultChan() {
			switch event.Type {
			case watch.Added, watch.Modified, watch.Deleted:
				obj, ok := event.Object.(*unstructured.Unstructured)
				if !ok {
					continue
				}
				ws.lastVersion = obj.GetResourceVersion()
				e := Event{Type: string(event.Type), Object: obj}
				ws.mu.Lock()
				for _, sub := range ws.subs {
					select {
					case sub <- e:
					default:
						// Subscriber is too slow; drop the event.
					}
				}
				ws.mu.Unlock()
			case watch.Error:
				// Force relist on next attempt.
				ws.lastVersion = ""
				watcher.Stop()
				goto retry
			}
		}
	retry:
		select {
		case <-ctx.Done():
			return
		default:
		}
	}
}

func (m *Manager) ri(key WatchKey) dynamic.ResourceInterface {
	r := m.dynamic.Resource(key.GVR)
	if key.Namespace != "" {
		return r.Namespace(key.Namespace)
	}
	return r
}

// MarshalEvent serialises a watch event to JSON bytes.
func MarshalEvent(e Event) ([]byte, error) {
	return json.Marshal(e)
}

func min(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}

// Describe returns a human-readable key string for logging.
func (k WatchKey) String() string {
	return fmt.Sprintf("%s/%s/%s[ns=%s]", k.GVR.Group, k.GVR.Version, k.GVR.Resource, k.Namespace)
}
