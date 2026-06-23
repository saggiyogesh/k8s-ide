// Package watch provides a shared multiplexed watch manager.
// A single watch stream per (group, version, resource, namespace, labelSelector)
// fans out events to all registered subscribers.
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

// Event is the wire-format watch event.
type Event struct {
	Type   string          `json:"type"`
	Object json.RawMessage `json:"object"`
}

// watchKey uniquely identifies a watch stream.
type watchKey struct {
	group, version, resource, namespace, labelSelector string
}

// subscriber is a single consumer of a shared watch stream.
type subscriber struct {
	ch   chan Event
	done chan struct{}
}

// sharedWatch manages one Kubernetes watch stream and fans out to subscribers.
type sharedWatch struct {
	key         watchKey
	dyn         dynamic.Interface
	subscribers map[uint64]*subscriber
	mu          sync.Mutex
	cancel      context.CancelFunc
	nextID      uint64
}

// Manager keeps track of all active watch streams.
type Manager struct {
	mu      sync.Mutex
	watches map[watchKey]*sharedWatch
}

// New creates a Manager.
func New() *Manager {
	return &Manager{watches: make(map[watchKey]*sharedWatch)}
}

// Subscribe adds a subscriber to the watch stream for the given parameters.
// It starts the watch if it is not already running.
// Returns a channel of Events, a cancel function, and an error.
func (m *Manager) Subscribe(
	dyn dynamic.Interface,
	group, version, resource, namespace, labelSelector string,
) (<-chan Event, func(), error) {
	key := watchKey{group, version, resource, namespace, labelSelector}

	m.mu.Lock()
	sw, ok := m.watches[key]
	if !ok {
		sw = &sharedWatch{
			key:         key,
			dyn:         dyn,
			subscribers: make(map[uint64]*subscriber),
		}
		m.watches[key] = sw
	}
	m.mu.Unlock()

	ch, id, cancel := sw.addSubscriber()
	cancel = func() {
		sw.removeSubscriber(id)
		m.cleanupIfEmpty(key)
	}
	return ch, cancel, nil
}

func (m *Manager) cleanupIfEmpty(key watchKey) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sw, ok := m.watches[key]
	if !ok {
		return
	}
	sw.mu.Lock()
	empty := len(sw.subscribers) == 0
	sw.mu.Unlock()
	if empty {
		if sw.cancel != nil {
			sw.cancel()
		}
		delete(m.watches, key)
	}
}

func (sw *sharedWatch) addSubscriber() (<-chan Event, uint64, func()) {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	id := sw.nextID
	sw.nextID++
	sub := &subscriber{
		ch:   make(chan Event, 256),
		done: make(chan struct{}),
	}
	sw.subscribers[id] = sub

	// Start the watch loop only on first subscriber.
	if len(sw.subscribers) == 1 {
		ctx, cancel := context.WithCancel(context.Background())
		sw.cancel = cancel
		go sw.run(ctx)
	}

	return sub.ch, id, nil
}

func (sw *sharedWatch) removeSubscriber(id uint64) {
	sw.mu.Lock()
	defer sw.mu.Unlock()
	if sub, ok := sw.subscribers[id]; ok {
		close(sub.done)
		delete(sw.subscribers, id)
	}
}

func (sw *sharedWatch) run(ctx context.Context) {
	backoff := time.Second
	for {
		if ctx.Err() != nil {
			return
		}
		if err := sw.runOnce(ctx); err != nil {
			if ctx.Err() != nil {
				return
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
				backoff = min(backoff*2, 30*time.Second)
			}
		} else {
			backoff = time.Second
		}
	}
}

func (sw *sharedWatch) runOnce(ctx context.Context) error {
	gvr := schema.GroupVersionResource{
		Group:    sw.key.group,
		Version:  sw.key.version,
		Resource: sw.key.resource,
	}

	var ri dynamic.ResourceInterface
	if sw.key.namespace != "" {
		ri = sw.dyn.Resource(gvr).Namespace(sw.key.namespace)
	} else {
		ri = sw.dyn.Resource(gvr)
	}

	watcher, err := ri.Watch(ctx, metav1.ListOptions{
		LabelSelector: sw.key.labelSelector,
		Watch:         true,
	})
	if err != nil {
		return fmt.Errorf("watch start failed: %w", err)
	}
	defer watcher.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case evt, ok := <-watcher.ResultChan():
			if !ok {
				return fmt.Errorf("watch channel closed")
			}
			if evt.Type == watch.Error {
				return fmt.Errorf("watch error event received")
			}
			raw, err := json.Marshal(evt.Object)
			if err != nil {
				continue
			}
			wireEvent := Event{Type: string(evt.Type), Object: raw}
			sw.broadcast(wireEvent)
		}
	}
}

func (sw *sharedWatch) broadcast(evt Event) {
	sw.mu.Lock()
	defer sw.mu.Unlock()
	for _, sub := range sw.subscribers {
		select {
		case sub.ch <- evt:
		default:
			// Drop events for slow subscribers rather than blocking the stream.
		}
	}
}

func min(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
