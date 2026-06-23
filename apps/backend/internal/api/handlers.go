package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/k8s-ide/backend/internal/k8s"
	"github.com/k8s-ide/backend/internal/session"
	"github.com/k8s-ide/backend/internal/watch"
)

var upgrader = websocket.Upgrader{
	CheckOrigin:     func(_ *http.Request) bool { return true },
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
}

// Handler groups all HTTP handlers.
type Handler struct {
	mgr         *session.Manager
	watchMgr    *watch.Manager
	resClient   *k8s.ResourceClient
	discCache   *k8s.DiscoveryCache
}

func NewHandler(mgr *session.Manager) *Handler {
	return &Handler{mgr: mgr}
}

// ensureSession refreshes per-request clients from the active session.
func (h *Handler) ensureSession() error {
	sess, err := h.mgr.ActiveSession()
	if err != nil {
		return err
	}
	if h.resClient == nil || h.discCache == nil {
		h.resClient = k8s.NewResourceClient(sess.DynamicClient)
		h.discCache = k8s.NewDiscoveryCache(sess.DiscoveryClient, 5*time.Minute)
		h.watchMgr = watch.NewManager(sess.DynamicClient)
	}
	return nil
}

// ─── Context endpoints ────────────────────────────────────────────────────────

func (h *Handler) ListContexts(w http.ResponseWriter, r *http.Request) {
	ctxs, err := h.mgr.ListContexts()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonOK(w, ctxs)
}

func (h *Handler) OpenSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Context string `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Context == "" {
		jsonError(w, http.StatusBadRequest, "context is required")
		return
	}
	info, err := h.mgr.OpenSession(body.Context)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Reset cached clients for new session.
	h.resClient = nil
	h.discCache = nil
	h.watchMgr = nil

	jsonOK(w, info)
}

// ─── Discovery ────────────────────────────────────────────────────────────────

func (h *Handler) GetDiscovery(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureSession(); err != nil {
		jsonError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	resources, err := h.discCache.Get()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonOK(w, resources)
}

// ─── Resource CRUD ────────────────────────────────────────────────────────────

func (h *Handler) ListResources(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureSession(); err != nil {
		jsonError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	group := chi.URLParam(r, "group")
	if group == "core" {
		group = ""
	}
	version := chi.URLParam(r, "version")
	resource := chi.URLParam(r, "resource")

	q := r.URL.Query()
	var limit int64
	if l := q.Get("limit"); l != "" {
		limit, _ = strconv.ParseInt(l, 10, 64)
	}

	opts := k8s.ListOpts{
		Group:         group,
		Version:       version,
		Resource:      resource,
		Namespace:     q.Get("namespace"),
		LabelSelector: q.Get("labelSelector"),
		FieldSelector: q.Get("fieldSelector"),
		Limit:         limit,
		ContinueToken: q.Get("continue"),
	}

	result, err := h.resClient.List(r.Context(), opts)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	type response struct {
		Items           []unstructured.Unstructured `json:"items"`
		ResourceVersion string                      `json:"resourceVersion"`
		ContinueToken   string                      `json:"continueToken,omitempty"`
	}
	jsonOK(w, response{
		Items:           result.Items,
		ResourceVersion: result.ResourceVersion,
		ContinueToken:   result.ContinueToken,
	})
}

func (h *Handler) GetResource(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureSession(); err != nil {
		jsonError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	group := chi.URLParam(r, "group")
	if group == "core" {
		group = ""
	}
	obj, err := h.resClient.Get(
		r.Context(),
		group,
		chi.URLParam(r, "version"),
		chi.URLParam(r, "resource"),
		"",
		chi.URLParam(r, "name"),
	)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonOK(w, obj)
}

func (h *Handler) GetNamespacedResource(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureSession(); err != nil {
		jsonError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	group := chi.URLParam(r, "group")
	if group == "core" {
		group = ""
	}
	obj, err := h.resClient.Get(
		r.Context(),
		group,
		chi.URLParam(r, "version"),
		chi.URLParam(r, "resource"),
		chi.URLParam(r, "namespace"),
		chi.URLParam(r, "name"),
	)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonOK(w, obj)
}

func (h *Handler) ApplyYAML(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureSession(); err != nil {
		jsonError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	var body string
	if r.Header.Get("Content-Type") == "application/yaml" {
		buf := make([]byte, 1<<20) // 1 MiB max
		n, _ := r.Body.Read(buf)
		body = string(buf[:n])
	} else {
		var req struct{ Yaml string }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, http.StatusBadRequest, "bad request body")
			return
		}
		body = req.Yaml
	}

	disc, err := h.discCache.Get()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	results, err := h.resClient.ApplyYAML(r.Context(), disc, body)
	if err != nil {
		jsonError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	jsonOK(w, results)
}

func (h *Handler) DeleteResource(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureSession(); err != nil {
		jsonError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	group := chi.URLParam(r, "group")
	if group == "core" {
		group = ""
	}
	err := h.resClient.Delete(
		r.Context(),
		group,
		chi.URLParam(r, "version"),
		chi.URLParam(r, "resource"),
		"",
		chi.URLParam(r, "name"),
	)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteNamespacedResource(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureSession(); err != nil {
		jsonError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	group := chi.URLParam(r, "group")
	if group == "core" {
		group = ""
	}
	err := h.resClient.Delete(
		r.Context(),
		group,
		chi.URLParam(r, "version"),
		chi.URLParam(r, "resource"),
		chi.URLParam(r, "namespace"),
		chi.URLParam(r, "name"),
	)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Actions ─────────────────────────────────────────────────────────────────

func (h *Handler) Scale(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureSession(); err != nil {
		jsonError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	var req struct {
		Group     string `json:"group"`
		Version   string `json:"version"`
		Resource  string `json:"resource"`
		Namespace string `json:"namespace"`
		Name      string `json:"name"`
		Replicas  int32  `json:"replicas"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}
	err := h.resClient.ScaleResource(
		r.Context(), req.Group, req.Version, req.Resource,
		req.Namespace, req.Name, req.Replicas,
	)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonOK(w, map[string]interface{}{"success": true, "message": "scaled"})
}

func (h *Handler) Restart(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureSession(); err != nil {
		jsonError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	var req struct {
		Group     string `json:"group"`
		Version   string `json:"version"`
		Resource  string `json:"resource"`
		Namespace string `json:"namespace"`
		Name      string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}
	err := h.resClient.RestartDeployment(
		r.Context(), req.Group, req.Version, req.Resource,
		req.Namespace, req.Name,
	)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonOK(w, map[string]interface{}{"success": true, "message": "restart triggered"})
}

// ─── WebSocket: watch ─────────────────────────────────────────────────────────

func (h *Handler) WatchResources(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureSession(); err != nil {
		jsonError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	q := r.URL.Query()
	group := q.Get("group")
	version := q.Get("version")
	resource := q.Get("resource")
	namespace := q.Get("namespace")
	selector := q.Get("labelSelector")

	if version == "" || resource == "" {
		jsonError(w, http.StatusBadRequest, "version and resource are required")
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	sub := h.watchMgr.Subscribe(group, version, resource, namespace, selector)
	defer sub.Close()

	for {
		select {
		case event, ok := <-sub.Events():
			if !ok {
				return
			}
			type wsEvent struct {
				Type   string      `json:"type"`
				Object interface{} `json:"object"`
			}
			msg := wsEvent{
				Type:   string(event.Type),
				Object: event.Object,
			}
			if err := conn.WriteJSON(msg); err != nil {
				return
			}
		case <-r.Context().Done():
			return
		}
	}
}

// ─── WebSocket: logs ──────────────────────────────────────────────────────────

func (h *Handler) StreamLogs(w http.ResponseWriter, r *http.Request) {
	sess, err := h.mgr.ActiveSession()
	if err != nil {
		jsonError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	namespace := chi.URLParam(r, "namespace")
	pod := chi.URLParam(r, "pod")
	container := chi.URLParam(r, "container")

	q := r.URL.Query()
	follow := q.Get("follow") != "false"
	var tailLines *int64
	if t := q.Get("tailLines"); t != "" {
		n, _ := strconv.ParseInt(t, 10, 64)
		tailLines = &n
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	streamLogs(r.Context(), conn, sess.Clientset, namespace, pod, container, follow, tailLines)
}

// ─── Health ───────────────────────────────────────────────────────────────────

func (h *Handler) Health(w http.ResponseWriter, _ *http.Request) {
	jsonOK(w, map[string]string{"status": "ok"})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func jsonOK(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(v)
}

func jsonError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
