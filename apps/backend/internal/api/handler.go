package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"
	"github.com/k8s-ide/backend/internal/k8s"
	sessionpkg "github.com/k8s-ide/backend/internal/session"
	watchpkg "github.com/k8s-ide/backend/internal/watch"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Handler bundles the API dependencies.
type Handler struct {
	sessions  *sessionpkg.Manager
	discovery *k8s.DiscoveryCache
	k8sClient *k8s.Client
	watches   *watchpkg.Manager
}

// NewHandler creates a new Handler.
func NewHandler(
	sessions *sessionpkg.Manager,
	disc *k8s.DiscoveryCache,
	k8sCli *k8s.Client,
	wm *watchpkg.Manager,
) *Handler {
	return &Handler{
		sessions:  sessions,
		discovery: disc,
		k8sClient: k8sCli,
		watches:   wm,
	}
}

// Router builds and returns the chi router.
func (h *Handler) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	r.Get("/api/contexts", h.listContexts)
	r.Post("/api/session/open", h.openSession)
	r.Get("/api/discovery", h.getDiscovery)

	// Cluster-scoped resources
	r.Get("/api/resources/{group}/{version}/{resource}", h.listResources)
	r.Get("/api/resources/{group}/{version}/{resource}/{name}", h.getResource)
	r.Delete("/api/resources/{group}/{version}/{resource}/{name}", h.deleteResource)

	// Namespaced resources
	r.Get("/api/resources/{group}/{version}/{resource}/n/{namespace}", h.listResources)
	r.Get("/api/resources/{group}/{version}/{resource}/n/{namespace}/{name}", h.getResource)
	r.Delete("/api/resources/{group}/{version}/{resource}/n/{namespace}/{name}", h.deleteResource)

	r.Post("/api/resources/apply", h.applyYaml)

	r.Post("/api/actions/scale", h.actionScale)
	r.Post("/api/actions/restart", h.actionRestart)
	r.Post("/api/actions/port-forward", h.actionPortForward)

	// WebSocket endpoints
	r.Get("/ws/watch", h.wsWatch)
	r.Get("/ws/logs/{namespace}/{pod}/{container}", h.wsLogs)
	r.Get("/ws/exec/{namespace}/{pod}/{container}", h.wsExec)

	return r
}

// ---------------------------------------------------------------------------
// REST handlers
// ---------------------------------------------------------------------------

func (h *Handler) listContexts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.sessions.Contexts())
}

func (h *Handler) openSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Context string `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpError(w, http.StatusBadRequest, err.Error())
		return
	}
	sess, err := h.sessions.Open(r.Context(), body.Context)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]string{
		"context":       sess.Context,
		"namespace":     sess.Namespace,
		"serverVersion": sess.ServerVersion,
	})
}

func (h *Handler) getDiscovery(w http.ResponseWriter, r *http.Request) {
	resources, err := h.discovery.Get()
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, resources)
}

func (h *Handler) listResources(w http.ResponseWriter, r *http.Request) {
	group, version, resource := routeGVR(r)
	namespace := chi.URLParam(r, "namespace")
	q := r.URL.Query()
	var limit int64
	if ls := q.Get("limit"); ls != "" {
		limit, _ = strconv.ParseInt(ls, 10, 64)
	}
	result, err := h.k8sClient.List(r.Context(), k8s.ListOptions{
		Group:         normalizeGroup(group),
		Version:       version,
		Resource:      resource,
		Namespace:     namespace,
		LabelSelector: q.Get("labelSelector"),
		FieldSelector: q.Get("fieldSelector"),
		Limit:         limit,
		ContinueToken: q.Get("continue"),
	})
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, result)
}

func (h *Handler) getResource(w http.ResponseWriter, r *http.Request) {
	group, version, resource := routeGVR(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	obj, err := h.k8sClient.Get(r.Context(), normalizeGroup(group), version, resource, namespace, name)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, obj)
}

func (h *Handler) deleteResource(w http.ResponseWriter, r *http.Request) {
	group, version, resource := routeGVR(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	if err := h.k8sClient.Delete(r.Context(), normalizeGroup(group), version, resource, namespace, name); err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) applyYaml(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Yaml string `json:"yaml"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpError(w, http.StatusBadRequest, err.Error())
		return
	}
	result, err := h.k8sClient.Apply(r.Context(), body.Yaml)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, result)
}

func (h *Handler) actionScale(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Group    string `json:"group"`
		Version  string `json:"version"`
		Resource string `json:"resource"`
		Name     string `json:"name"`
		Namespace string `json:"namespace"`
		Params   struct {
			Replicas int32 `json:"replicas"`
		} `json:"params"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpError(w, http.StatusBadRequest, err.Error())
		return
	}
	obj, err := h.k8sClient.Scale(r.Context(), normalizeGroup(body.Group), body.Version, body.Resource, body.Namespace, body.Name, body.Params.Replicas)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]interface{}{"success": true, "resource": obj})
}

func (h *Handler) actionRestart(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Group    string `json:"group"`
		Version  string `json:"version"`
		Resource string `json:"resource"`
		Name     string `json:"name"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpError(w, http.StatusBadRequest, err.Error())
		return
	}
	obj, err := h.k8sClient.RolloutRestart(r.Context(), normalizeGroup(body.Group), body.Version, body.Resource, body.Namespace, body.Name)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]interface{}{"success": true, "resource": obj})
}

func (h *Handler) actionPortForward(w http.ResponseWriter, r *http.Request) {
	// Port-forward requires a persistent WS connection; for the REST entry point
	// we return the WS URL the client should connect to.
	var body struct {
		Namespace  string `json:"namespace"`
		Name       string `json:"name"`
		Kind       string `json:"kind"`
		LocalPort  int    `json:"localPort"`
		RemotePort int    `json:"remotePort"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpError(w, http.StatusBadRequest, err.Error())
		return
	}
	wsURL := "/ws/portforward/" + body.Namespace + "/" + body.Name
	writeJSON(w, map[string]interface{}{
		"sessionId":  body.Namespace + "-" + body.Name,
		"wsUrl":      wsURL,
		"localPort":  body.LocalPort,
		"remotePort": body.RemotePort,
	})
}

// ---------------------------------------------------------------------------
// WebSocket handlers
// ---------------------------------------------------------------------------

func (h *Handler) wsWatch(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	q := r.URL.Query()
	key := watchpkg.WatchKey{
		Group:         normalizeGroup(q.Get("group")),
		Version:       q.Get("version"),
		Resource:      q.Get("resource"),
		Namespace:     q.Get("namespace"),
		LabelSelector: q.Get("labelSelector"),
	}

	ch, cancel := h.watches.Subscribe(r.Context(), key)
	defer cancel()

	for ev := range ch {
		data, err := json.Marshal(ev)
		if err != nil {
			continue
		}
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			return
		}
	}
}

func (h *Handler) wsLogs(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	sess := h.sessions.Active()
	if sess == nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"no active session"}`))
		return
	}

	namespace := chi.URLParam(r, "namespace")
	pod := chi.URLParam(r, "pod")
	container := chi.URLParam(r, "container")
	q := r.URL.Query()

	var tailLines *int64
	if tl := q.Get("tailLines"); tl != "" {
		if n, err := strconv.ParseInt(tl, 10, 64); err == nil {
			tailLines = &n
		}
	}

	req := sess.DiscoveryClient.RESTClient().Get().
		Namespace(namespace).
		Resource("pods").
		Name(pod).
		SubResource("log").
		Param("container", container).
		Param("follow", q.Get("follow"))
	if tailLines != nil {
		req = req.Param("tailLines", strconv.FormatInt(*tailLines, 10))
	}

	stream, err := req.Stream(r.Context())
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"`+err.Error()+`"}`))
		return
	}
	defer stream.Close()

	buf := make([]byte, 4096)
	for {
		n, err := stream.Read(buf)
		if n > 0 {
			if werr := conn.WriteMessage(websocket.TextMessage, buf[:n]); werr != nil {
				return
			}
		}
		if err != nil {
			return
		}
	}
}

func (h *Handler) wsExec(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	// Full exec implementation requires remotecommand + SPDY; placeholder sends
	// an informational message.
	_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"INFO","data":"exec session starting"}`))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func routeGVR(r *http.Request) (group, version, resource string) {
	return chi.URLParam(r, "group"), chi.URLParam(r, "version"), chi.URLParam(r, "resource")
}

// normalizeGroup converts the "_" placeholder used in URL paths back to an
// empty string (core API group).
func normalizeGroup(g string) string {
	if g == "_" {
		return ""
	}
	return g
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func httpError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
