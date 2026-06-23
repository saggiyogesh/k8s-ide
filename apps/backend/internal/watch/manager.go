package watch

import (
	"net/http"

	"github.com/gorilla/websocket"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	"github.com/k8s-ide/backend/internal/session"
)

type StreamOptions struct {
	Context       string
	Group         string
	Version       string
	Resource      string
	Namespace     string
	LabelSelector string
	FieldSelector string
}

type Manager struct {
	sessions *session.Manager
	upgrader websocket.Upgrader
}

func NewManager(sessions *session.Manager) *Manager {
	return &Manager{
		sessions: sessions,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(*http.Request) bool { return true },
		},
	}
}

func normalizeGroup(group string) string {
	if group == "core" {
		return ""
	}
	return group
}

func (m *Manager) resourceClient(contextName string, gvr schema.GroupVersionResource, namespace string) (dynamic.ResourceInterface, error) {
	config, err := m.sessions.RESTConfig(contextName)
	if err != nil {
		return nil, err
	}

	client, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, err
	}

	resourceClient := client.Resource(gvr)
	if namespace != "" {
		return resourceClient.Namespace(namespace), nil
	}
	return resourceClient, nil
}

func (m *Manager) ServeWS(w http.ResponseWriter, r *http.Request, opts StreamOptions) error {
	conn, err := m.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	resourceClient, err := m.resourceClient(contextName(opts.Context), schema.GroupVersionResource{
		Group:    normalizeGroup(opts.Group),
		Version:  opts.Version,
		Resource: opts.Resource,
	}, opts.Namespace)
	if err != nil {
		return conn.WriteJSON(map[string]string{"type": "ERROR", "message": err.Error()})
	}

	watcher, err := resourceClient.Watch(r.Context(), metav1.ListOptions{
		LabelSelector: opts.LabelSelector,
		FieldSelector: opts.FieldSelector,
	})
	if err != nil {
		return conn.WriteJSON(map[string]string{"type": "ERROR", "message": err.Error()})
	}
	defer watcher.Stop()

	for event := range watcher.ResultChan() {
		object, ok := event.Object.(*unstructured.Unstructured)
		if !ok {
			continue
		}

		if err := conn.WriteJSON(map[string]any{
			"type":   string(event.Type),
			"object": object.Object,
		}); err != nil {
			return err
		}
	}

	return nil
}

func ServeStubStream(w http.ResponseWriter, r *http.Request, kind string) error {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	return conn.WriteJSON(map[string]any{
		"type":    "stub",
		"kind":    kind,
		"message": kind + " streaming will be wired to remotecommand and pod logs in a follow-up iteration",
	})
}

func contextName(name string) string {
	return name
}
