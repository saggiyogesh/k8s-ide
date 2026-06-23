package watch

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
)

// Event is a serialisable Kubernetes watch event.
type Event struct {
	Type   string                 `json:"type"`
	Object map[string]interface{} `json:"object"`
}

// WatchKey uniquely identifies a watch stream.
type WatchKey struct {
	Group         string
	Version       string
	Resource      string
	Namespace     string
	LabelSelector string
}

func (k WatchKey) String() string {
	return fmt.Sprintf("%s/%s/%s/ns=%s/sel=%s", k.Group, k.Version, k.Resource, k.Namespace, k.LabelSelector)
}

// subscriber is a channel receiving fanned-out events.
type subscriber chan Event

// stream holds the shared watch and its subscribers.
type stream struct {
	key         WatchKey
	subscribers map[subscriber]struct{}
	mu          sync.Mutex
	cancel      context.CancelFunc
}

// Manager multiplexes watch streams, creating one watcher per unique key
// and fanning events out to every subscriber.
type Manager struct {
	mu      sync.Mutex
	streams map[string]*stream
	dyn     dynamic.Interface
}

// NewManager creates a new watch Manager.
func NewManager(dyn dynamic.Interface) *Manager {
	return &Manager{
		streams: make(map[string]*stream),
		dyn:     dyn,
	}
}

// Subscribe returns a channel that receives events for the given key.
// The caller must call the returned cancel function to unsubscribe.
func (m *Manager) Subscribe(ctx context.Context, key WatchKey) (<-chan Event, func()) {
	ch := make(subscriber, 64)

	m.mu.Lock()
	k := key.String()
	st, ok := m.streams[k]
	if !ok {
		st = &stream{
			key:         key,
			subscribers: make(map[subscriber]struct{}),
		}
		m.streams[k] = st
		wCtx, cancel := context.WithCancel(context.Background())
		st.cancel = cancel
		go m.runStream(wCtx, st)
	}
	st.mu.Lock()
	st.subscribers[ch] = struct{}{}
	st.mu.Unlock()
	m.mu.Unlock()

	cancel := func() {
		m.mu.Lock()
		st2, ok := m.streams[k]
		if ok {
			st2.mu.Lock()
			delete(st2.subscribers, ch)
			empty := len(st2.subscribers) == 0
			st2.mu.Unlock()
			if empty {
				st2.cancel()
				delete(m.streams, k)
			}
		}
		m.mu.Unlock()
		close(ch)
	}

	_ = ctx
	return ch, cancel
}

func (m *Manager) runStream(ctx context.Context, st *stream) {
	key := st.key
	gvr := schema.GroupVersionResource{Group: key.Group, Version: key.Version, Resource: key.Resource}
	backoff := time.Second

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		var ri dynamic.ResourceInterface
		if key.Namespace != "" {
			ri = m.dyn.Resource(gvr).Namespace(key.Namespace)
		} else {
			ri = m.dyn.Resource(gvr)
		}

		watcher, err := ri.Watch(ctx, metav1.ListOptions{
			LabelSelector: key.LabelSelector,
		})
		if err != nil {
			time.Sleep(backoff)
			backoff = min(backoff*2, 30*time.Second)
			continue
		}
		backoff = time.Second

		m.consumeWatch(ctx, watcher, st)
	}
}

func (m *Manager) consumeWatch(ctx context.Context, watcher watch.Interface, st *stream) {
	defer watcher.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-watcher.ResultChan():
			if !ok {
				return
			}
			if ev.Object == nil {
				continue
			}
			raw, err := json.Marshal(ev.Object)
			if err != nil {
				continue
			}
			var obj map[string]interface{}
			if err := json.Unmarshal(raw, &obj); err != nil {
				continue
			}
			out := Event{Type: string(ev.Type), Object: obj}
			st.mu.Lock()
			for sub := range st.subscribers {
				select {
				case sub <- out:
				default:
					// Drop if slow subscriber; prevent backpressure on shared stream.
				}
			}
			st.mu.Unlock()
		}
	}
}

func min(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
