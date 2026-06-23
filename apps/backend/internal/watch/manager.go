package watchmgr

import (
	"context"
	"encoding/json"
	"sync"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/watch"

	"github.com/k8s-ide/backend/internal/k8s"
)

type Event struct {
	Type   string                    `json:"type"`
	Object *unstructured.Unstructured `json:"object,omitempty"`
	Error  string                    `json:"error,omitempty"`
}

type subscription struct {
	ch     chan Event
	cancel context.CancelFunc
}

type Manager struct {
	mu            sync.Mutex
	subscriptions map[string][]*subscription
	engine        *k8s.Engine
}

func NewManager(engine *k8s.Engine) *Manager {
	return &Manager{
		subscriptions: make(map[string][]*subscription),
		engine:        engine,
	}
}

func (m *Manager) Subscribe(ctx context.Context, key string, group, version, resource, namespace, labelSelector, fieldSelector, resourceVersion string) (<-chan Event, func()) {
	subCtx, cancel := context.WithCancel(ctx)
	ch := make(chan Event, 64)

	sub := &subscription{ch: ch, cancel: cancel}

	m.mu.Lock()
	m.subscriptions[key] = append(m.subscriptions[key], sub)
	shouldStart := len(m.subscriptions[key]) == 1
	m.mu.Unlock()

	if shouldStart {
		go m.runWatcher(key, group, version, resource, namespace, labelSelector, fieldSelector, resourceVersion)
	}

	go func() {
		<-subCtx.Done()
		m.unsubscribe(key, sub)
	}()

	return ch, cancel
}

func (m *Manager) unsubscribe(key string, sub *subscription) {
	m.mu.Lock()
	defer m.mu.Unlock()

	subs := m.subscriptions[key]
	for i, s := range subs {
		if s == sub {
			m.subscriptions[key] = append(subs[:i], subs[i+1:]...)
			close(sub.ch)
			break
		}
	}
	if len(m.subscriptions[key]) == 0 {
		delete(m.subscriptions, key)
	}
}

func (m *Manager) broadcast(key string, ev Event) {
	m.mu.Lock()
	subs := m.subscriptions[key]
	m.mu.Unlock()

	for _, sub := range subs {
		select {
		case sub.ch <- ev:
		default:
		}
	}
}

func (m *Manager) runWatcher(key, group, version, resource, namespace, labelSelector, fieldSelector, resourceVersion string) {
	backoff := 1
	for {
		m.mu.Lock()
		_, active := m.subscriptions[key]
		m.mu.Unlock()
		if !active {
			return
		}

		ctx := context.Background()
		watcher, err := m.engine.Watch(ctx, group, version, resource, namespace, labelSelector, fieldSelector, resourceVersion)
		if err != nil {
			m.broadcast(key, Event{Type: "ERROR", Error: err.Error()})
			backoff = min(backoff*2, 30)
			continue
		}

		backoff = 1
		for ev := range watcher.ResultChan() {
			switch ev.Type {
			case watch.Added, watch.Modified, watch.Deleted, watch.Bookmark:
				obj, _ := ev.Object.(*unstructured.Unstructured)
				m.broadcast(key, Event{Type: string(ev.Type), Object: obj})
			case watch.Error:
				errObj, _ := ev.Object.(error)
				msg := "watch error"
				if errObj != nil {
					msg = errObj.Error()
				}
				m.broadcast(key, Event{Type: "ERROR", Error: msg})
			}
		}
		watcher.Stop()

		m.mu.Lock()
		_, active = m.subscriptions[key]
		m.mu.Unlock()
		if !active {
			return
		}
	}
}

func WatchKey(group, version, resource, namespace string) string {
	data, _ := json.Marshal(map[string]string{
		"group": group, "version": version, "resource": resource, "namespace": namespace,
	})
	return string(data)
}
