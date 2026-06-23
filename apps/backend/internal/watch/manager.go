package watchmgr

import (
	"context"
	"encoding/json"
	"sync"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
)

type Event struct {
	Type    string                 `json:"type"`
	Object  map[string]interface{} `json:"object,omitempty"`
	Message string                 `json:"message,omitempty"`
}

type Manager struct {
	mu      sync.Mutex
	streams map[string]*stream
	dynamic dynamic.Interface
}

type stream struct {
	key     string
	cancel  context.CancelFunc
	subs    map[int]chan Event
	nextID  int
}

func NewManager(dyn dynamic.Interface) *Manager {
	return &Manager{
		streams: make(map[string]*stream),
		dynamic: dyn,
	}
}

func (m *Manager) Subscribe(ctx context.Context, gvr schema.GroupVersionResource, namespace, labelSelector, fieldSelector, resourceVersion string) (<-chan Event, func()) {
	key := streamKey(gvr, namespace, labelSelector, fieldSelector)

	m.mu.Lock()
	s, ok := m.streams[key]
	if !ok {
		watchCtx, cancel := context.WithCancel(context.Background())
		s = &stream{key: key, cancel: cancel, subs: make(map[int]chan Event)}
		m.streams[key] = s
		go m.runWatch(watchCtx, s, gvr, namespace, labelSelector, fieldSelector, resourceVersion)
	}

	id := s.nextID
	s.nextID++
	ch := make(chan Event, 64)
	s.subs[id] = ch
	m.mu.Unlock()

	unsub := func() {
		m.mu.Lock()
		defer m.mu.Unlock()
		if sub, ok := s.subs[id]; ok {
			delete(s.subs, id)
			close(sub)
		}
		if len(s.subs) == 0 {
			s.cancel()
			delete(m.streams, key)
		}
	}

	go func() {
		<-ctx.Done()
		unsub()
	}()

	return ch, unsub
}

func (m *Manager) runWatch(ctx context.Context, s *stream, gvr schema.GroupVersionResource, namespace, labelSelector, fieldSelector, resourceVersion string) {
	defer s.cancel()

	opts := metav1.ListOptions{
		LabelSelector:   labelSelector,
		FieldSelector:   fieldSelector,
		ResourceVersion: resourceVersion,
		Watch:           true,
	}

	client := m.dynamic.Resource(gvr)
	var w watch.Interface
	var err error
	for {
		if namespace != "" {
			w, err = client.Namespace(namespace).Watch(ctx, opts)
		} else {
			w, err = client.Watch(ctx, opts)
		}
		if err != nil {
			m.broadcast(s, Event{Type: "ERROR", Message: err.Error()})
			return
		}
		break
	}
	defer w.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-w.ResultChan():
			if !ok {
				m.broadcast(s, Event{Type: "ERROR", Message: "watch closed"})
				return
			}
			var obj map[string]interface{}
			if u, ok := ev.Object.(*unstructured.Unstructured); ok {
				obj = u.Object
			}
			m.broadcast(s, Event{Type: string(ev.Type), Object: obj})
		}
	}
}

func (m *Manager) broadcast(s *stream, ev Event) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, ch := range s.subs {
		select {
		case ch <- ev:
		default:
		}
	}
}

func streamKey(gvr schema.GroupVersionResource, namespace, labelSelector, fieldSelector string) string {
	b, _ := json.Marshal(struct {
		GVR           schema.GroupVersionResource
		Namespace     string
		LabelSelector string
		FieldSelector string
	}{gvr, namespace, labelSelector, fieldSelector})
	return string(b)
}
