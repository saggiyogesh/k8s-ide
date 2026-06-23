package watch

import (
	"context"
	"fmt"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
)

const (
	maxQueuedEvents = 512
	relinkBackoff   = 2 * time.Second
	maxBackoff      = 60 * time.Second
)

// Subscriber receives watch events.
type Subscriber struct {
	ch   chan watch.Event
	done chan struct{}
}

func (s *Subscriber) Events() <-chan watch.Event { return s.ch }
func (s *Subscriber) Close()                     { close(s.done) }

// watchKey uniquely identifies a watch stream.
type watchKey struct {
	group     string
	version   string
	resource  string
	namespace string
	selector  string
}

func (k watchKey) String() string {
	return fmt.Sprintf("%s/%s/%s/%s[%s]", k.group, k.version, k.resource, k.namespace, k.selector)
}

// stream is a single shared watch connection.
type stream struct {
	key         watchKey
	subscribers map[*Subscriber]struct{}
	mu          sync.Mutex
	cancel      context.CancelFunc
}

// Manager multiplexes Kubernetes watch connections across many subscribers.
type Manager struct {
	mu      sync.Mutex
	streams map[watchKey]*stream
	dyn     dynamic.Interface
}

func NewManager(dyn dynamic.Interface) *Manager {
	return &Manager{
		streams: make(map[watchKey]*stream),
		dyn:     dyn,
	}
}

// Subscribe returns a Subscriber for the given watch options.
// Multiple callers with the same key share one underlying watch stream.
func (m *Manager) Subscribe(
	group, version, resource, namespace, labelSelector string,
) *Subscriber {
	key := watchKey{
		group:     group,
		version:   version,
		resource:  resource,
		namespace: namespace,
		selector:  labelSelector,
	}

	sub := &Subscriber{
		ch:   make(chan watch.Event, maxQueuedEvents),
		done: make(chan struct{}),
	}

	m.mu.Lock()
	s, ok := m.streams[key]
	if !ok {
		ctx, cancel := context.WithCancel(context.Background())
		s = &stream{
			key:         key,
			subscribers: make(map[*Subscriber]struct{}),
			cancel:      cancel,
		}
		m.streams[key] = s
		go m.runStream(ctx, s)
	}
	s.mu.Lock()
	s.subscribers[sub] = struct{}{}
	s.mu.Unlock()
	m.mu.Unlock()

	// Remove subscriber on close.
	go func() {
		<-sub.done
		m.removeSubscriber(key, sub)
	}()

	return sub
}

func (m *Manager) removeSubscriber(key watchKey, sub *Subscriber) {
	m.mu.Lock()
	s, ok := m.streams[key]
	if !ok {
		m.mu.Unlock()
		return
	}
	s.mu.Lock()
	delete(s.subscribers, sub)
	empty := len(s.subscribers) == 0
	s.mu.Unlock()
	if empty {
		s.cancel()
		delete(m.streams, key)
	}
	m.mu.Unlock()
}

func (m *Manager) runStream(ctx context.Context, s *stream) {
	backoff := relinkBackoff
	for {
		if err := m.watchLoop(ctx, s); err != nil {
			select {
			case <-ctx.Done():
				return
			default:
			}
			time.Sleep(backoff)
			if backoff < maxBackoff {
				backoff *= 2
			}
		} else {
			backoff = relinkBackoff
		}
	}
}

func (m *Manager) watchLoop(ctx context.Context, s *stream) error {
	key := s.key
	gvr := schema.GroupVersionResource{
		Group:    key.group,
		Version:  key.version,
		Resource: key.resource,
	}

	opts := metav1.ListOptions{
		LabelSelector: key.selector,
		Watch:         true,
		// Use timeout of 5 minutes; we re-establish on EOF.
		TimeoutSeconds: int64Ptr(300),
	}

	var wi watch.Interface
	var err error
	if key.namespace != "" {
		wi, err = m.dyn.Resource(gvr).Namespace(key.namespace).Watch(ctx, opts)
	} else {
		wi, err = m.dyn.Resource(gvr).Watch(ctx, opts)
	}
	if err != nil {
		return fmt.Errorf("watch start %s: %w", key, err)
	}
	defer wi.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case event, ok := <-wi.ResultChan():
			if !ok {
				return fmt.Errorf("watch channel closed for %s", key)
			}
			m.fanout(s, event)
		}
	}
}

func (m *Manager) fanout(s *stream, event watch.Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for sub := range s.subscribers {
		select {
		case sub.ch <- event:
		default:
			// Drop oldest event rather than block.
		}
	}
}

func int64Ptr(i int64) *int64 { return &i }
