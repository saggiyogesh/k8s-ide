package watch

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
)

type Event struct {
	Type    string                     `json:"type"`
	Object  map[string]interface{}     `json:"object,omitempty"`
	Message string                     `json:"message,omitempty"`
}

type Manager struct {
	mu      sync.Mutex
	streams map[string]*stream
}

type stream struct {
	key      string
	cancel   context.CancelFunc
	clients  map[chan Event]struct{}
}

func NewManager() *Manager {
	return &Manager{streams: make(map[string]*stream)}
}

func (m *Manager) Subscribe(ctx context.Context, client dynamic.Interface, group, version, resource, namespace, labelSelector, fieldSelector, resourceVersion string, out chan<- Event) error {
	key := streamKey(group, version, resource, namespace, labelSelector, fieldSelector)

	m.mu.Lock()
	s, ok := m.streams[key]
	if !ok {
		runCtx, cancel := context.WithCancel(context.Background())
		s = &stream{
			key:     key,
			cancel:  cancel,
			clients: make(map[chan Event]struct{}),
		}
		m.streams[key] = s
		go m.run(runCtx, client, group, version, resource, namespace, labelSelector, fieldSelector, resourceVersion, s)
	}
	clientCh := make(chan Event, 64)
	s.clients[clientCh] = struct{}{}
	m.mu.Unlock()

	go func() {
		<-ctx.Done()
		m.mu.Lock()
		delete(s.clients, clientCh)
		if len(s.clients) == 0 {
			s.cancel()
			delete(m.streams, key)
		}
		m.mu.Unlock()
		close(clientCh)
	}()

	for event := range clientCh {
		select {
		case out <- event:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return ctx.Err()
}

func (m *Manager) run(ctx context.Context, client dynamic.Interface, group, version, resource, namespace, labelSelector, fieldSelector, resourceVersion string, s *stream) {
	backoff := time.Second
	for {
		if ctx.Err() != nil {
			return
		}

		gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
		var iface dynamic.ResourceInterface
		if namespace != "" {
			iface = client.Resource(gvr).Namespace(namespace)
		} else {
			iface = client.Resource(gvr)
		}

		watcher, err := iface.Watch(ctx, metav1.ListOptions{
			LabelSelector:   labelSelector,
			FieldSelector:   fieldSelector,
			ResourceVersion: resourceVersion,
			Watch:           true,
		})
		if err != nil {
			m.broadcast(s, Event{Type: "ERROR", Message: err.Error()})
			time.Sleep(backoff)
			backoff = min(backoff*2, 30*time.Second)
			continue
		}

		backoff = time.Second
		m.consume(ctx, watcher, s)
		watcher.Stop()
	}
}

func (m *Manager) consume(ctx context.Context, watcher watch.Interface, s *stream) {
	for {
		select {
		case <-ctx.Done():
			return
		case evt, ok := <-watcher.ResultChan():
			if !ok {
				return
			}
			event := Event{Type: string(evt.Type)}
			if obj, ok := evt.Object.(*unstructured.Unstructured); ok {
				event.Object = obj.UnstructuredContent()
			} else if status, ok := evt.Object.(*metav1.Status); ok {
				event.Message = status.Message
			}
			m.broadcast(s, event)
		}
	}
}

func (m *Manager) broadcast(s *stream, event Event) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for ch := range s.clients {
		select {
		case ch <- event:
		default:
			payload, _ := json.Marshal(event)
			select {
			case ch <- Event{Type: "ERROR", Message: "slow consumer dropped event: " + string(payload)}:
			default:
			}
		}
	}
}

func streamKey(group, version, resource, namespace, labelSelector, fieldSelector string) string {
	return group + "/" + version + "/" + resource + "/" + namespace + "?" + labelSelector + "&" + fieldSelector
}

func min(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
