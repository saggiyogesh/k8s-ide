// Package api implements the HTTP and WebSocket handlers for the backend.
package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"k8s.io/apimachinery/pkg/runtime/schema"

	"github.com/k8s-ide/backend/internal/k8s"
	"github.com/k8s-ide/backend/internal/session"
	"github.com/k8s-ide/backend/internal/watch"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
}

// Handler holds shared dependencies for all HTTP handlers.
type Handler struct {
	sessions  *session.Manager
	watchMgr  *watch.Manager
	discovery *k8s.DiscoveryCache
	crud      *k8s.Client
}

// NewHandler constructs a Handler.
func NewHandler(sessions *session.Manager) *Handler {
	h := &Handler{sessions: sessions}
	if sess := sessions.Active(); sess != nil {
		h.initClients(sess)
	}
	return h
}

func (h *Handler) initClients(sess *session.Session) {
	h.watchMgr = watch.NewManager(sess.Dynamic)
	h.discovery = k8s.NewDiscoveryCache(sess.Discovery, 60_000_000_000) // 60s TTL
	h.crud = k8s.NewClient(sess.Dynamic)
}

// ── Context handlers ─────────────────────────────────────────────────────────

// ListContexts GET /api/contexts
func (h *Handler) ListContexts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.sessions.Contexts())
}

// OpenSession POST /api/session/open
func (h *Handler) OpenSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Context string `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	sess, err := h.sessions.OpenSession(r.Context(), body.Context)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	h.initClients(sess)

	writeJSON(w, map[string]string{
		"contextName":   sess.ContextName,
		"serverVersion": sess.ServerVersion,
		"sessionId":     sess.ContextName,
	})
}

// ── Discovery handlers ────────────────────────────────────────────────────────

// GetDiscovery GET /api/discovery
func (h *Handler) GetDiscovery(w http.ResponseWriter, r *http.Request) {
	if h.discovery == nil {
		http.Error(w, "no active session", http.StatusPreconditionRequired)
		return
	}
	resources, err := h.discovery.All()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, resources)
}

// ── Resource CRUD handlers ────────────────────────────────────────────────────

// ListResources GET /api/resources/:group/:version/:resource
func (h *Handler) ListResources(w http.ResponseWriter, r *http.Request) {
	if h.crud == nil {
		http.Error(w, "no active session", http.StatusPreconditionRequired)
		return
	}
	gvr := gvrFromChi(r)
	namespace := r.URL.Query().Get("namespace")
	label := r.URL.Query().Get("labelSelector")
	field := r.URL.Query().Get("fieldSelector")
	limit, _ := strconv.ParseInt(r.URL.Query().Get("limit"), 10, 64)
	if limit == 0 {
		limit = 500
	}

	result, err := h.crud.List(r.Context(), k8s.ListOpts{
		GVR:           gvr,
		Namespace:     namespace,
		LabelSelector: label,
		FieldSelector: field,
		Limit:         limit,
		Continue:      r.URL.Query().Get("continue"),
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, result)
}

// GetResource GET /api/resources/:group/:version/:resource/:name
func (h *Handler) GetResource(w http.ResponseWriter, r *http.Request) {
	if h.crud == nil {
		http.Error(w, "no active session", http.StatusPreconditionRequired)
		return
	}
	gvr := gvrFromChi(r)
	name := chi.URLParam(r, "name")
	obj, err := h.crud.Get(r.Context(), gvr, "", name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	writeJSON(w, obj)
}

// GetNamespacedResource GET /api/resources/:group/:version/:resource/n/:namespace/:name
func (h *Handler) GetNamespacedResource(w http.ResponseWriter, r *http.Request) {
	if h.crud == nil {
		http.Error(w, "no active session", http.StatusPreconditionRequired)
		return
	}
	gvr := gvrFromChi(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	obj, err := h.crud.Get(r.Context(), gvr, namespace, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	writeJSON(w, obj)
}

// ApplyResource POST /api/resources/apply
func (h *Handler) ApplyResource(w http.ResponseWriter, r *http.Request) {
	if h.crud == nil {
		http.Error(w, "no active session", http.StatusPreconditionRequired)
		return
	}
	var body struct {
		YAML string `json:"yaml"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	obj, created, err := h.crud.Apply(r.Context(), []byte(body.YAML))
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	writeJSON(w, map[string]interface{}{"resource": obj, "created": created})
}

// DeleteResource DELETE /api/resources/:group/:version/:resource/:name
func (h *Handler) DeleteResource(w http.ResponseWriter, r *http.Request) {
	if h.crud == nil {
		http.Error(w, "no active session", http.StatusPreconditionRequired)
		return
	}
	gvr := gvrFromChi(r)
	name := chi.URLParam(r, "name")
	if err := h.crud.Delete(r.Context(), gvr, "", name); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DeleteNamespacedResource DELETE /api/resources/:group/:version/:resource/n/:namespace/:name
func (h *Handler) DeleteNamespacedResource(w http.ResponseWriter, r *http.Request) {
	if h.crud == nil {
		http.Error(w, "no active session", http.StatusPreconditionRequired)
		return
	}
	gvr := gvrFromChi(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	if err := h.crud.Delete(r.Context(), gvr, namespace, name); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Action handlers ───────────────────────────────────────────────────────────

// ScaleAction POST /api/actions/scale
func (h *Handler) ScaleAction(w http.ResponseWriter, r *http.Request) {
	if h.crud == nil {
		http.Error(w, "no active session", http.StatusPreconditionRequired)
		return
	}
	var body struct {
		Group     string `json:"group"`
		Version   string `json:"version"`
		Resource  string `json:"resource"`
		Namespace string `json:"namespace"`
		Name      string `json:"name"`
		Replicas  int32  `json:"replicas"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	gvr := schema.GroupVersionResource{Group: body.Group, Version: body.Version, Resource: body.Resource}
	if err := h.crud.Scale(r.Context(), gvr, body.Namespace, body.Name, body.Replicas); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]bool{"success": true})
}

// RestartAction POST /api/actions/restart
func (h *Handler) RestartAction(w http.ResponseWriter, r *http.Request) {
	if h.crud == nil {
		http.Error(w, "no active session", http.StatusPreconditionRequired)
		return
	}
	var body struct {
		Group     string `json:"group"`
		Version   string `json:"version"`
		Resource  string `json:"resource"`
		Namespace string `json:"namespace"`
		Name      string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	gvr := schema.GroupVersionResource{Group: body.Group, Version: body.Version, Resource: body.Resource}
	if err := h.crud.RolloutRestart(r.Context(), gvr, body.Namespace, body.Name); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]bool{"success": true})
}

// ── WebSocket handlers ────────────────────────────────────────────────────────

// WatchResources WS /ws/watch
func (h *Handler) WatchResources(w http.ResponseWriter, r *http.Request) {
	if h.watchMgr == nil {
		http.Error(w, "no active session", http.StatusPreconditionRequired)
		return
	}

	q := r.URL.Query()
	key := watch.WatchKey{
		GVR: schema.GroupVersionResource{
			Group:    q.Get("group"),
			Version:  q.Get("version"),
			Resource: q.Get("resource"),
		},
		Namespace:     q.Get("namespace"),
		LabelSelector: q.Get("labelSelector"),
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	events, unsubscribe := h.watchMgr.Subscribe(r.Context(), key)
	defer unsubscribe()

	for event := range events {
		data, err := watch.MarshalEvent(event)
		if err != nil {
			continue
		}
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			return
		}
	}
}

// StreamLogs WS /ws/logs/:namespace/:pod
func (h *Handler) StreamLogs(w http.ResponseWriter, r *http.Request) {
	if h.sessions.Active() == nil {
		http.Error(w, "no active session", http.StatusPreconditionRequired)
		return
	}
	namespace := chi.URLParam(r, "namespace")
	pod := chi.URLParam(r, "pod")
	container := r.URL.Query().Get("container")

	tailLines := int64(100)
	if tl := r.URL.Query().Get("tailLines"); tl != "" {
		if v, err := strconv.ParseInt(tl, 10, 64); err == nil {
			tailLines = v
		}
	}
	follow := r.URL.Query().Get("follow") != "false"

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	sess := h.sessions.Active()
	logOpts := podLogOpts(container, tailLines, follow)
	req := sess.Kubernetes.CoreV1().Pods(namespace).GetLogs(pod, &logOpts)
	stream, err := req.Stream(r.Context())
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("error: "+err.Error()))
		return
	}
	defer stream.Close()

	buf := make([]byte, 4096)
	for {
		n, err := stream.Read(buf)
		if n > 0 {
			if writeErr := conn.WriteMessage(websocket.TextMessage, buf[:n]); writeErr != nil {
				return
			}
		}
		if err != nil {
			if err != io.EOF {
				_ = conn.WriteMessage(websocket.TextMessage, []byte("error: "+err.Error()))
			}
			return
		}
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func gvrFromChi(r *http.Request) schema.GroupVersionResource {
	group := chi.URLParam(r, "group")
	if group == "core" {
		group = ""
	}
	return schema.GroupVersionResource{
		Group:    group,
		Version:  chi.URLParam(r, "version"),
		Resource: chi.URLParam(r, "resource"),
	}
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
