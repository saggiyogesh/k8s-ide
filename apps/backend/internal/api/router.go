package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"
	"k8s-ide/backend/internal/k8s"
	"k8s-ide/backend/internal/session"
)

type server struct {
	manager  *session.Manager
	engine   *k8s.Engine
	upgrader websocket.Upgrader
}

type openSessionRequest struct {
	Context        string `json:"context"`
	KubeconfigPath string `json:"kubeconfigPath"`
}

type applyRequest struct {
	YAML string `json:"yaml"`
}

func NewRouter(manager *session.Manager, engine *k8s.Engine) http.Handler {
	s := &server{
		manager: manager,
		engine:  engine,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool { return true },
		},
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(api chi.Router) {
		api.Get("/contexts", s.handleListContexts)
		api.Post("/session/open", s.handleOpenSession)
		api.Get("/discovery", s.handleDiscovery)
		api.Post("/resources/apply", s.handleApplyYAML)
		api.Get("/resources/{group}/{version}/{resource}", s.handleListResources)
		api.Get("/resources/{group}/{version}/{resource}/n/{namespace}", s.handleListResources)
		api.Get("/resources/{group}/{version}/{resource}/{name}", s.handleGetResource)
		api.Get("/resources/{group}/{version}/{resource}/n/{namespace}/{name}", s.handleGetResource)
		api.Delete("/resources/{group}/{version}/{resource}/{name}", s.handleDeleteResource)
		api.Delete("/resources/{group}/{version}/{resource}/n/{namespace}/{name}", s.handleDeleteResource)
		api.Post("/actions/{action}", s.handleNotImplemented)
	})

	r.Get("/ws/watch", s.handleNotImplementedSocket)
	r.Get("/ws/logs/{namespace}/{pod}/{container}", s.handleNotImplementedSocket)
	r.Get("/ws/exec/{namespace}/{pod}/{container}", s.handleNotImplementedSocket)

	return r
}

func (s *server) handleListContexts(w http.ResponseWriter, r *http.Request) {
	contexts, err := s.engine.ListContexts(r.URL.Query().Get("kubeconfigPath"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, contexts)
}

func (s *server) handleOpenSession(w http.ResponseWriter, r *http.Request) {
	var payload openSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	opened, err := s.engine.OpenSession(payload.KubeconfigPath, payload.Context)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	state := session.State{
		ContextName:    opened.ContextName,
		Cluster:        opened.Cluster,
		Namespace:      opened.Namespace,
		KubeconfigPath: opened.KubeconfigPath,
		OpenedAt:       opened.OpenedAt,
		Connected:      opened.Connected,
	}
	s.manager.Set(state)
	writeJSON(w, http.StatusOK, opened)
}

func (s *server) handleDiscovery(w http.ResponseWriter, _ *http.Request) {
	current, ok := s.currentSession()
	if !ok {
		writeError(w, http.StatusPreconditionFailed, errors.New("open a session before requesting discovery"))
		return
	}

	discovery, err := s.engine.Discovery(current)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, discovery)
}

func (s *server) handleListResources(w http.ResponseWriter, r *http.Request) {
	current, ok := s.currentSession()
	if !ok {
		writeError(w, http.StatusPreconditionFailed, errors.New("open a session before listing resources"))
		return
	}

	limit := int64(100)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		limit = parsed
	}

	items, err := s.engine.ListResources(r.Context(), current, k8s.ListOptions{
		Group:         decodeGroupParam(chi.URLParam(r, "group")),
		Version:       chi.URLParam(r, "version"),
		Resource:      chi.URLParam(r, "resource"),
		Namespace:     chi.URLParam(r, "namespace"),
		ContinueToken: r.URL.Query().Get("continue"),
		FieldSelector: r.URL.Query().Get("fieldSelector"),
		LabelSelector: r.URL.Query().Get("labelSelector"),
		Limit:         limit,
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, items)
}

func (s *server) handleGetResource(w http.ResponseWriter, r *http.Request) {
	current, ok := s.currentSession()
	if !ok {
		writeError(w, http.StatusPreconditionFailed, errors.New("open a session before reading resources"))
		return
	}

	resource, err := s.engine.GetResource(r.Context(), current, k8s.GetOptions{
		Group:     decodeGroupParam(chi.URLParam(r, "group")),
		Version:   chi.URLParam(r, "version"),
		Resource:  chi.URLParam(r, "resource"),
		Namespace: chi.URLParam(r, "namespace"),
		Name:      chi.URLParam(r, "name"),
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, resource)
}

func (s *server) handleDeleteResource(w http.ResponseWriter, r *http.Request) {
	current, ok := s.currentSession()
	if !ok {
		writeError(w, http.StatusPreconditionFailed, errors.New("open a session before deleting resources"))
		return
	}

	err := s.engine.DeleteResource(r.Context(), current, k8s.DeleteOptions{
		Group:     decodeGroupParam(chi.URLParam(r, "group")),
		Version:   chi.URLParam(r, "version"),
		Resource:  chi.URLParam(r, "resource"),
		Namespace: chi.URLParam(r, "namespace"),
		Name:      chi.URLParam(r, "name"),
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleApplyYAML(w http.ResponseWriter, r *http.Request) {
	current, ok := s.currentSession()
	if !ok {
		writeError(w, http.StatusPreconditionFailed, errors.New("open a session before applying yaml"))
		return
	}

	var payload applyRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	result, err := s.engine.ApplyYAML(r.Context(), current, payload.YAML)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *server) handleNotImplemented(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusNotImplemented, map[string]string{
		"error": "workload actions are scaffolded but not implemented yet",
	})
}

func (s *server) handleNotImplementedSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	_ = conn.WriteJSON(map[string]string{
		"error": "streaming endpoints are scaffolded but not implemented yet",
	})
}

func (s *server) currentSession() (k8s.SessionInfo, bool) {
	current, ok := s.manager.Current()
	if !ok {
		return k8s.SessionInfo{}, false
	}

	return k8s.SessionInfo{
		ContextName:    current.ContextName,
		Cluster:        current.Cluster,
		Namespace:      current.Namespace,
		KubeconfigPath: current.KubeconfigPath,
		OpenedAt:       current.OpenedAt,
		Connected:      current.Connected,
	}, true
}

func decodeGroupParam(group string) string {
	if group == "_" {
		return ""
	}
	return group
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
