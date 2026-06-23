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
	Type     string                     `json:"type"`
	Resource map[string]interface{}     `json:"resource,omitempty"`
	Error    string                     `json:"error,omitempty"`
}

type subscription struct {
	ch     chan Event
	cancel context.CancelFunc
}

type Manager struct {
	mu            sync.Mutex
	subscriptions map[string][]*subscription
	maxSubs       int
}

func NewManager() *Manager {
	return &Manager{
		subscriptions: make(map[string][]*subscription),
		maxSubs:       64,
	}
}

func key(group, version, resource, namespace, labelSelector string) string {
	return group + "/" + version + "/" + resource + "/" + namespace + "/" + labelSelector
}

func (m *Manager) Subscribe(
	ctx context.Context,
	dyn dynamic.Interface,
	group, version, resource, namespace, labelSelector, resourceVersion string,
) (<-chan Event, func()) {
	m.mu.Lock()
	defer m.mu.Unlock()

	k := key(group, version, resource, namespace, labelSelector)
	ch := make(chan Event, 64)
	watchCtx, cancel := context.WithCancel(ctx)
	sub := &subscription{ch: ch, cancel: cancel}

	subs := m.subscriptions[k]
	if len(subs) == 0 {
		go m.runWatcher(watchCtx, dyn, group, version, resource, namespace, labelSelector, resourceVersion, k)
	}
	m.subscriptions[k] = append(subs, sub)

	unsub := func() {
		m.mu.Lock()
		defer m.mu.Unlock()
		subs := m.subscriptions[k]
		for i, s := range subs {
			if s == sub {
				m.subscriptions[k] = append(subs[:i], subs[i+1:]...)
				break
			}
		}
		cancel()
		close(ch)
		if len(m.subscriptions[k]) == 0 {
			delete(m.subscriptions, k)
		}
	}
	return ch, unsub
}

func normalizeGroup(group string) string {
	if group == "core" {
		return ""
	}
	return group
}

func (m *Manager) runWatcher(
	ctx context.Context,
	dyn dynamic.Interface,
	group, version, resource, namespace, labelSelector, resourceVersion, k string,
) {
	backoff := time.Second
	for {
		if ctx.Err() != nil {
			return
		}
		gvr := schema.GroupVersionResource{
			Group:    normalizeGroup(group),
			Version:  version,
			Resource: resource,
		}
		opts := metav1.ListOptions{
			LabelSelector:   labelSelector,
			Watch:           true,
			ResourceVersion: resourceVersion,
		}

		var w watch.Interface
		var err error
		if namespace != "" {
			w, err = dyn.Resource(gvr).Namespace(namespace).Watch(ctx, opts)
		} else {
			w, err = dyn.Resource(gvr).Watch(ctx, opts)
		}
		if err != nil {
			m.broadcast(k, Event{Type: "ERROR", Error: err.Error()})
			time.Sleep(backoff)
			if backoff < 30*time.Second {
				backoff *= 2
			}
			continue
		}
		backoff = time.Second

		for ev := range w.ResultChan() {
			switch ev.Type {
			case watch.Added, watch.Modified, watch.Deleted, watch.Bookmark:
				obj, ok := ev.Object.(*unstructured.Unstructured)
				if !ok {
					continue
				}
				m.broadcast(k, Event{Type: string(ev.Type), Resource: obj.Object})
			case watch.Error:
				m.broadcast(k, Event{Type: "ERROR", Error: "watch error"})
			}
		}
		time.Sleep(backoff)
	}
}

func (m *Manager) broadcast(k string, ev Event) {
	m.mu.Lock()
	subs := append([]*subscription(nil), m.subscriptions[k]...)
	m.mu.Unlock()
	for _, s := range subs {
		select {
		case s.ch <- ev:
		default:
		}
	}
}

func EncodeEvent(ev Event) ([]byte, error) {
	return json.Marshal(ev)
}
