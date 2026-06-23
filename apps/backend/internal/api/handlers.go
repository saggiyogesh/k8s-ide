// Package api wires the HTTP and WebSocket handlers onto the chi router.
package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/tools/remotecommand"
	"sigs.k8s.io/yaml"

	"github.com/k8s-ide/backend/internal/k8s"
	"github.com/k8s-ide/backend/internal/session"
	"github.com/k8s-ide/backend/internal/watch"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(_ *http.Request) bool { return true },
}

// Handler holds shared dependencies for all HTTP handlers.
type Handler struct {
	session      *session.Manager
	watchManager *watch.Manager
	discovery    *k8s.DiscoveryCache
}

// New creates a Handler.
func New(sess *session.Manager, wm *watch.Manager, disc *k8s.DiscoveryCache) *Handler {
	return &Handler{session: sess, watchManager: wm, discovery: disc}
}

// RegisterRoutes mounts all routes on the provided chi router.
func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/api/contexts", h.handleGetContexts)
	r.Post("/api/session/open", h.handleOpenSession)
	r.Get("/api/discovery", h.handleGetDiscovery)

	// Resource CRUD
	r.Get("/api/resources/{group}/{version}/{resource}", h.handleListResources)
	r.Get("/api/resources/{group}/{version}/{resource}/n/{namespace}", h.handleListResources)
	r.Get("/api/resources/{group}/{version}/{resource}/{name}", h.handleGetResource)
	r.Get("/api/resources/{group}/{version}/{resource}/n/{namespace}/{name}", h.handleGetResource)
	r.Post("/api/resources/apply", h.handleApplyYAML)
	r.Delete("/api/resources/{group}/{version}/{resource}/{name}", h.handleDeleteResource)
	r.Delete("/api/resources/{group}/{version}/{resource}/n/{namespace}/{name}", h.handleDeleteResource)

	// Actions
	r.Post("/api/actions/scale", h.handleScale)
	r.Post("/api/actions/restart", h.handleRestart)

	// WebSocket streams
	r.Get("/ws/watch", h.handleWatchWS)
	r.Get("/ws/logs/{namespace}/{pod}/{container}", h.handleLogsWS)
	r.Get("/ws/exec/{namespace}/{pod}/{container}", h.handleExecWS)
}

// --- Context and session ---

func (h *Handler) handleGetContexts(w http.ResponseWriter, r *http.Request) {
	raw := h.session.RawConfig()
	type contextEntry struct {
		Name      string `json:"name"`
		Cluster   string `json:"cluster"`
		User      string `json:"user"`
		Namespace string `json:"namespace,omitempty"`
	}
	entries := make([]contextEntry, 0, len(raw.Contexts))
	for name, ctx := range raw.Contexts {
		if ctx == nil {
			continue
		}
		entries = append(entries, contextEntry{
			Name:      name,
			Cluster:   ctx.Cluster,
			User:      ctx.AuthInfo,
			Namespace: ctx.Namespace,
		})
	}
	writeJSON(w, http.StatusOK, entries)
}

func (h *Handler) handleOpenSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Context string `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.session.OpenContext(body.Context); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	typed := h.session.TypedClient()
	sv, err := typed.Discovery().ServerVersion()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "fetching server version: "+err.Error())
		return
	}

	nsList, err := typed.CoreV1().Namespaces().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "listing namespaces: "+err.Error())
		return
	}
	namespaces := make([]string, 0, len(nsList.Items))
	for _, ns := range nsList.Items {
		namespaces = append(namespaces, ns.Name)
	}

	// Rebuild discovery cache after switching context.
	h.discovery.Invalidate()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"context":       body.Context,
		"serverVersion": sv.GitVersion,
		"namespaces":    namespaces,
	})
}

func (h *Handler) handleGetDiscovery(w http.ResponseWriter, r *http.Request) {
	_ = r
	resources, err := h.discovery.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resources)
}

// --- Resource CRUD ---

func (h *Handler) handleListResources(w http.ResponseWriter, r *http.Request) {
	group := chi.URLParam(r, "group")
	if group == "core" {
		group = ""
	}
	version := chi.URLParam(r, "version")
	resource := chi.URLParam(r, "resource")
	namespace := chi.URLParam(r, "namespace")

	q := r.URL.Query()
	var limit int64
	if l := q.Get("limit"); l != "" {
		if n, err := strconv.ParseInt(l, 10, 64); err == nil {
			limit = n
		}
	}

	result, err := k8s.ListResources(r.Context(), h.session.DynamicClient(), k8s.ListOpts{
		Group:         group,
		Version:       version,
		Resource:      resource,
		Namespace:     namespace,
		LabelSelector: q.Get("labelSelector"),
		FieldSelector: q.Get("fieldSelector"),
		Limit:         limit,
		ContinueToken: q.Get("continueToken"),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Return a flat JSON structure matching the wire type.
	type response struct {
		Items           []interface{} `json:"items"`
		Total           int           `json:"total"`
		ContinueToken   string        `json:"continueToken,omitempty"`
		ResourceVersion string        `json:"resourceVersion"`
	}
	items := make([]interface{}, len(result.Items))
	for i, item := range result.Items {
		items[i] = item.Object
	}
	writeJSON(w, http.StatusOK, response{
		Items:           items,
		Total:           result.Total,
		ContinueToken:   result.ContinueToken,
		ResourceVersion: result.ResourceVersion,
	})
}

func (h *Handler) handleGetResource(w http.ResponseWriter, r *http.Request) {
	group := chi.URLParam(r, "group")
	if group == "core" {
		group = ""
	}
	obj, err := k8s.GetResource(r.Context(), h.session.DynamicClient(), k8s.GetOpts{
		Group:     group,
		Version:   chi.URLParam(r, "version"),
		Resource:  chi.URLParam(r, "resource"),
		Namespace: chi.URLParam(r, "namespace"),
		Name:      chi.URLParam(r, "name"),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, obj.Object)
}

func (h *Handler) handleApplyYAML(w http.ResponseWriter, r *http.Request) {
	var body struct {
		YAML string `json:"yaml"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	docs := splitYAMLDocs(body.YAML)
	var results []k8s.ApplyResult
	for _, doc := range docs {
		if strings.TrimSpace(doc) == "" {
			continue
		}
		jsonBytes, err := yaml.YAMLToJSON([]byte(doc))
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid YAML: "+err.Error())
			return
		}
		var obj unstructured.Unstructured
		if err := json.Unmarshal(jsonBytes, &obj.Object); err != nil {
			writeError(w, http.StatusBadRequest, "invalid YAML structure: "+err.Error())
			return
		}
		res, err := k8s.ApplyYAML(r.Context(), h.session.DynamicClient(), &obj)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		results = append(results, *res)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *Handler) handleDeleteResource(w http.ResponseWriter, r *http.Request) {
	group := chi.URLParam(r, "group")
	if group == "core" {
		group = ""
	}
	if err := k8s.DeleteResource(r.Context(), h.session.DynamicClient(), k8s.DeleteOpts{
		Group:     group,
		Version:   chi.URLParam(r, "version"),
		Resource:  chi.URLParam(r, "resource"),
		Namespace: chi.URLParam(r, "namespace"),
		Name:      chi.URLParam(r, "name"),
	}); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Actions ---

func (h *Handler) handleScale(w http.ResponseWriter, r *http.Request) {
	var opts k8s.ScaleOpts
	if err := json.NewDecoder(r.Body).Decode(&opts); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	result, err := k8s.ScaleWorkload(r.Context(), h.session.TypedClient(), opts)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) handleRestart(w http.ResponseWriter, r *http.Request) {
	var opts k8s.RestartOpts
	if err := json.NewDecoder(r.Body).Decode(&opts); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	result, err := k8s.RestartWorkload(r.Context(), h.session.TypedClient(), opts)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// --- WebSocket handlers ---

func (h *Handler) handleWatchWS(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	group := q.Get("group")
	if group == "core" {
		group = ""
	}
	version := q.Get("version")
	resource := q.Get("resource")
	namespace := q.Get("namespace")
	labelSelector := q.Get("labelSelector")

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ch, cancel, err := h.watchManager.Subscribe(
		h.session.DynamicClient(),
		group, version, resource, namespace, labelSelector,
	)
	if err != nil {
		_ = conn.WriteJSON(map[string]string{"error": err.Error()})
		return
	}
	defer cancel()

	ctx, cancelCtx := context.WithCancel(r.Context())
	defer cancelCtx()

	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				cancelCtx()
				return
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case evt, ok := <-ch:
			if !ok {
				return
			}
			if err := conn.WriteJSON(evt); err != nil {
				return
			}
		}
	}
}

func (h *Handler) handleLogsWS(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	pod := chi.URLParam(r, "pod")
	container := chi.URLParam(r, "container")

	q := r.URL.Query()
	follow := q.Get("follow") == "true"
	var tailLines *int64
	if t := q.Get("tailLines"); t != "" {
		if n, err := strconv.ParseInt(t, 10, 64); err == nil {
			tailLines = &n
		}
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	req := h.session.TypedClient().CoreV1().Pods(namespace).GetLogs(pod, &corev1.PodLogOptions{
		Container: container,
		Follow:    follow,
		TailLines: tailLines,
	})

	stream, err := req.Stream(r.Context())
	if err != nil {
		_ = conn.WriteJSON(map[string]string{"error": err.Error()})
		return
	}
	defer stream.Close()

	buf := make([]byte, 4096)
	for {
		n, err := stream.Read(buf)
		if n > 0 {
			if werr := conn.WriteJSON(map[string]string{"data": string(buf[:n])}); werr != nil {
				return
			}
		}
		if err == io.EOF {
			return
		}
		if err != nil {
			return
		}
	}
}

func (h *Handler) handleExecWS(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	pod := chi.URLParam(r, "pod")
	container := chi.URLParam(r, "container")

	q := r.URL.Query()
	command := q["command"]
	if len(command) == 0 {
		command = []string{"/bin/sh"}
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	req := h.session.TypedClient().CoreV1().RESTClient().Post().
		Resource("pods").
		Name(pod).
		Namespace(namespace).
		SubResource("exec")
	req.VersionedParams(&corev1.PodExecOptions{
		Container: container,
		Command:   command,
		Stdin:     true,
		Stdout:    true,
		Stderr:    true,
		TTY:       true,
	}, metav1.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(h.session.RestConfig(), "POST", req.URL())
	if err != nil {
		_ = conn.WriteJSON(map[string]string{"error": err.Error()})
		return
	}

	pr, pw := io.Pipe()
	go func() {
		defer pw.Close()
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			_, _ = pw.Write(msg)
		}
	}()

	outPr, outPw := io.Pipe()
	go func() {
		defer outPr.Close()
		buf := make([]byte, 4096)
		for {
			n, err := outPr.Read(buf)
			if n > 0 {
				_ = conn.WriteMessage(websocket.BinaryMessage, buf[:n])
			}
			if err != nil {
				return
			}
		}
	}()

	_ = exec.StreamWithContext(r.Context(), remotecommand.StreamOptions{
		Stdin:  pr,
		Stdout: outPw,
		Stderr: outPw,
		Tty:    true,
	})
}

// --- Helpers ---

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func splitYAMLDocs(input string) []string {
	return strings.Split(input, "\n---")
}
