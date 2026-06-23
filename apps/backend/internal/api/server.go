package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/k8s-ide/k8s-ide/apps/backend/internal/k8s"
	"github.com/k8s-ide/k8s-ide/apps/backend/internal/session"
	backendwatch "github.com/k8s-ide/k8s-ide/apps/backend/internal/watch"
)

type Server struct {
	sessions   *session.Manager
	engine     *k8s.Engine
	watchers   *backendwatch.Manager
	websocket  websocket.Upgrader
	httpServer *http.Server
}

type Config struct {
	Address string
}

type actionRequest struct {
	Action string `json:"action"`
	Target struct {
		Context   string `json:"context"`
		Group     string `json:"group"`
		Version   string `json:"version"`
		Resource  string `json:"resource"`
		Namespace string `json:"namespace,omitempty"`
		Name      string `json:"name"`
	} `json:"target"`
	Payload map[string]any `json:"payload,omitempty"`
}

type applyRequest struct {
	Context string `json:"context"`
	YAML    string `json:"yaml"`
}

type execRequest struct {
	Context   string   `json:"context"`
	Namespace string   `json:"namespace"`
	Pod       string   `json:"pod"`
	Container string   `json:"container,omitempty"`
	Command   []string `json:"command"`
	TTY       bool     `json:"tty"`
}

type portForwardRequest struct {
	Context   string `json:"context"`
	Namespace string `json:"namespace"`
	Resource  string `json:"resource"`
	Name      string `json:"name"`
	Ports     []int  `json:"ports"`
}

func NewServer(config Config, sessions *session.Manager, engine *k8s.Engine, watchers *backendwatch.Manager) *Server {
	server := &Server{
		sessions: sessions,
		engine:   engine,
		watchers: watchers,
		websocket: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}

	router := chi.NewRouter()
	router.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	router.Get("/api/contexts", server.handleListContexts)
	router.Post("/api/session/open", server.handleOpenSession)
	router.Get("/api/discovery", server.handleDiscovery)
	router.Post("/api/resources/apply", server.handleApplyYAML)
	router.Route("/api/resources/{group}/{version}/{resource}", func(r chi.Router) {
		r.Get("/", server.handleListResources)
		r.Get("/n/{namespace}", server.handleListResources)
		r.Get("/{name}", server.handleGetResource)
		r.Get("/n/{namespace}/{name}", server.handleGetResource)
		r.Delete("/{name}", server.handleDeleteResource)
		r.Delete("/n/{namespace}/{name}", server.handleDeleteResource)
	})

	router.Post("/api/actions/scale", server.handleScale)
	router.Post("/api/actions/restart", server.handleRestart)
	router.Post("/api/actions/exec", server.handleExec)
	router.Post("/api/actions/port-forward", server.handlePortForward)

	router.Get("/ws/watch", server.handleWatch)
	router.Get("/ws/logs/{namespace}/{pod}/{container}", server.handleLogs)
	router.Get("/ws/exec/{namespace}/{pod}/{container}", server.handleExecSocket)

	server.httpServer = &http.Server{
		Addr:              config.Address,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	return server
}

func (s *Server) Start() error {
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}

func (s *Server) handleListContexts(w http.ResponseWriter, r *http.Request) {
	contexts, err := s.sessions.ListContexts(r.URL.Query().Get("kubeconfigPath"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, contexts)
}

func (s *Server) handleOpenSession(w http.ResponseWriter, r *http.Request) {
	var request session.OpenRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	sessionInfo, err := s.sessions.Open(r.Context(), request)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, sessionInfo)
}

func (s *Server) handleDiscovery(w http.ResponseWriter, r *http.Request) {
	descriptors, err := s.engine.Discovery(r.Context(), r.URL.Query().Get("context"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, descriptors)
}

func (s *Server) handleListResources(w http.ResponseWriter, r *http.Request) {
	query, err := decodeResourceQuery(r, "")
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	items, err := s.engine.ListResources(r.Context(), query)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items":           items.Items,
		"continueToken":   items.GetContinue(),
		"resourceVersion": items.GetResourceVersion(),
	})
}

func (s *Server) handleGetResource(w http.ResponseWriter, r *http.Request) {
	query, err := decodeResourceQuery(r, chi.URLParam(r, "name"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	item, err := s.engine.GetResource(r.Context(), query)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, item.Object)
}

func (s *Server) handleDeleteResource(w http.ResponseWriter, r *http.Request) {
	query, err := decodeResourceQuery(r, chi.URLParam(r, "name"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	if err := s.engine.DeleteResource(r.Context(), query); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleApplyYAML(w http.ResponseWriter, r *http.Request) {
	var request applyRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	result, err := s.engine.ApplyYAML(r.Context(), request.Context, request.YAML)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleScale(w http.ResponseWriter, r *http.Request) {
	var request actionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	value, ok := request.Payload["replicas"]
	if !ok {
		writeError(w, http.StatusBadRequest, errors.New("replicas payload is required"))
		return
	}

	replicas, err := int64FromAny(value)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	err = s.engine.Scale(r.Context(), k8s.ResourceQuery{
		Context:   request.Target.Context,
		Group:     request.Target.Group,
		Version:   request.Target.Version,
		Resource:  request.Target.Resource,
		Namespace: request.Target.Namespace,
		Name:      request.Target.Name,
	}, replicas)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"action":  "scale",
		"message": "scaled resource",
	})
}

func (s *Server) handleRestart(w http.ResponseWriter, r *http.Request) {
	var request actionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	err := s.engine.Restart(r.Context(), k8s.ResourceQuery{
		Context:   request.Target.Context,
		Group:     request.Target.Group,
		Version:   request.Target.Version,
		Resource:  request.Target.Resource,
		Namespace: request.Target.Namespace,
		Name:      request.Target.Name,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"action":  "restart",
		"message": "restarted resource",
	})
}

func (s *Server) handleExec(w http.ResponseWriter, r *http.Request) {
	var request execRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusNotImplemented, map[string]any{
		"sessionId":    "",
		"websocketUrl": "/ws/exec/" + request.Namespace + "/" + request.Pod + "/" + defaultContainer(request.Container),
		"message":      "exec plumbing is scaffolded; remotecommand wiring is still pending",
	})
}

func (s *Server) handlePortForward(w http.ResponseWriter, r *http.Request) {
	var request portForwardRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusNotImplemented, map[string]any{
		"sessionId":    "",
		"localPorts":   request.Ports,
		"websocketUrl": "",
		"message":      "port-forward scaffolding is present; stream wiring is still pending",
	})
}

func (s *Server) handleWatch(w http.ResponseWriter, r *http.Request) {
	conn, err := s.websocket.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	query, err := decodeResourceQuery(r, "")
	if err != nil {
		_ = conn.WriteJSON(map[string]string{"error": err.Error()})
		return
	}

	events, unsubscribe, err := s.watchers.Subscribe(r.Context(), query)
	if err != nil {
		_ = conn.WriteJSON(map[string]string{"error": err.Error()})
		return
	}
	defer unsubscribe()

	for event := range events {
		event.Type = strings.ToLower(event.Type)
		if err := conn.WriteJSON(event); err != nil {
			return
		}
	}
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	conn, err := s.websocket.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	contextName := r.URL.Query().Get("context")
	namespace := chi.URLParam(r, "namespace")
	pod := chi.URLParam(r, "pod")
	container := chi.URLParam(r, "container")
	if container == "_" {
		container = ""
	}

	tailLines, _ := strconv.ParseInt(r.URL.Query().Get("tailLines"), 10, 64)
	follow := strings.EqualFold(r.URL.Query().Get("follow"), "true")

	err = s.engine.StreamLogs(r.Context(), contextName, namespace, pod, container, tailLines, follow, func(line string) error {
		return conn.WriteMessage(websocket.TextMessage, []byte(line))
	})
	if err != nil {
		_ = conn.WriteJSON(map[string]string{"error": err.Error()})
	}
}

func (s *Server) handleExecSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.websocket.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	_ = conn.WriteJSON(map[string]string{
		"message": "exec websocket endpoint scaffolded; remote terminal support pending",
	})
}

func decodeResourceQuery(r *http.Request, name string) (k8s.ResourceQuery, error) {
	limit := int64(0)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return k8s.ResourceQuery{}, err
		}
		limit = parsed
	}

	return k8s.ResourceQuery{
		Context:       r.URL.Query().Get("context"),
		Group:         defaultGroup(chi.URLParam(r, "group")),
		Version:       chi.URLParam(r, "version"),
		Resource:      chi.URLParam(r, "resource"),
		Namespace:     chi.URLParam(r, "namespace"),
		Name:          name,
		LabelSelector: r.URL.Query().Get("labelSelector"),
		FieldSelector: r.URL.Query().Get("fieldSelector"),
		Limit:         limit,
	}, nil
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, statusCode int, err error) {
	writeJSON(w, statusCode, map[string]string{"error": err.Error()})
}

func defaultGroup(group string) string {
	if group == "core" {
		return ""
	}
	return group
}

func defaultContainer(container string) string {
	if container == "" {
		return "_"
	}
	return container
}

func int64FromAny(value any) (int64, error) {
	switch converted := value.(type) {
	case float64:
		return int64(converted), nil
	case int64:
		return converted, nil
	case int:
		return int64(converted), nil
	default:
		return 0, errors.New("replicas must be numeric")
	}
}
