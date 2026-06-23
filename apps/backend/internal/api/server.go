package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/example/k8s-ide/apps/backend/internal/k8s"
	"github.com/example/k8s-ide/apps/backend/internal/session"
	"github.com/example/k8s-ide/apps/backend/internal/watch"
)

type Server struct {
	engine   *k8s.Engine
	sessions *session.Manager
	watches  *watch.Manager
}

func NewServer(engine *k8s.Engine, sessions *session.Manager, watches *watch.Manager) http.Handler {
	server := &Server{
		engine:   engine,
		sessions: sessions,
		watches:  watches,
	}

	router := chi.NewRouter()
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(middleware.RequestID)
	router.Use(middleware.Timeout(45 * time.Second))

	router.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	router.Route("/api", func(r chi.Router) {
		r.Get("/contexts", server.handleListContexts)
		r.Post("/session/open", server.handleOpenSession)
		r.Get("/discovery", server.handleDiscovery)
		r.Post("/resources/apply", server.handleApply)
		r.Post("/actions/scale", server.handleScale)
		r.Post("/actions/restart", server.handleRestart)
		r.Post("/actions/port-forward", server.handlePortForward)

		r.Get("/resources/{group}/{version}/{resource}", server.handleListClusterResources)
		r.Get("/resources/{group}/{version}/{resource}/{name}", server.handleGetClusterResource)
		r.Delete("/resources/{group}/{version}/{resource}/{name}", server.handleDeleteClusterResource)

		r.Route("/resources/{group}/{version}/{resource}/n/{namespace}", func(r chi.Router) {
			r.Get("/", server.handleListNamespacedResources)
			r.Get("/{name}", server.handleGetNamespacedResource)
			r.Delete("/{name}", server.handleDeleteNamespacedResource)
		})
	})

	router.Route("/ws", func(r chi.Router) {
		r.Get("/watch", server.handleWatch)
		r.Get("/logs/{namespace}/{pod}/{container}", server.handleLogs)
		r.Get("/exec/{namespace}/{pod}/{container}", server.handleExec)
	})

	return router
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func decodeJSON(r *http.Request, target any) error {
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		return fmt.Errorf("decode request body: %w", err)
	}
	return nil
}

func (s *Server) requestContextName(r *http.Request) string {
	if explicit := r.URL.Query().Get("context"); explicit != "" {
		return explicit
	}
	return s.sessions.Context()
}

func (s *Server) listResources(
	ctx context.Context,
	w http.ResponseWriter,
	r *http.Request,
	namespace string,
) {
	result, err := s.engine.ListResources(
		ctx,
		s.requestContextName(r),
		chi.URLParam(r, "group"),
		chi.URLParam(r, "version"),
		chi.URLParam(r, "resource"),
		namespace,
		r.URL.Query().Get("labelSelector"),
		r.URL.Query().Get("fieldSelector"),
	)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) resourceRef(r *http.Request, namespace string) k8s.ResourceRef {
	return k8s.ResourceRef{
		Context:   s.requestContextName(r),
		Group:     chi.URLParam(r, "group"),
		Version:   chi.URLParam(r, "version"),
		Resource:  chi.URLParam(r, "resource"),
		Namespace: namespace,
		Name:      chi.URLParam(r, "name"),
	}
}

func (s *Server) handleListContexts(w http.ResponseWriter, _ *http.Request) {
	contexts, err := s.engine.ListContexts()
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, contexts)
}

func (s *Server) handleOpenSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Context string `json:"context"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	response, err := s.engine.OpenSession(req.Context)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	s.sessions.Set(response["context"], response["namespace"])
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleDiscovery(w http.ResponseWriter, r *http.Request) {
	descriptors, err := s.engine.Discovery(s.requestContextName(r))
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, descriptors)
}

func (s *Server) handleListClusterResources(w http.ResponseWriter, r *http.Request) {
	s.listResources(r.Context(), w, r, "")
}

func (s *Server) handleListNamespacedResources(w http.ResponseWriter, r *http.Request) {
	s.listResources(r.Context(), w, r, chi.URLParam(r, "namespace"))
}

func (s *Server) handleGetClusterResource(w http.ResponseWriter, r *http.Request) {
	item, err := s.engine.GetResource(r.Context(), s.resourceRef(r, ""))
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, item)
}

func (s *Server) handleGetNamespacedResource(w http.ResponseWriter, r *http.Request) {
	item, err := s.engine.GetResource(r.Context(), s.resourceRef(r, chi.URLParam(r, "namespace")))
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, item)
}

func (s *Server) handleDeleteClusterResource(w http.ResponseWriter, r *http.Request) {
	if err := s.engine.DeleteResource(r.Context(), s.resourceRef(r, "")); err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleDeleteNamespacedResource(w http.ResponseWriter, r *http.Request) {
	if err := s.engine.DeleteResource(r.Context(), s.resourceRef(r, chi.URLParam(r, "namespace"))); err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Context string `json:"context"`
		YAML    string `json:"yaml"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if req.YAML == "" {
		writeError(w, http.StatusBadRequest, errors.New("yaml must not be empty"))
		return
	}

	refs, err := s.engine.ApplyYAML(r.Context(), req.Context, req.YAML)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"applied": len(refs),
		"refs":    refs,
	})
}

func (s *Server) handleScale(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Context string                 `json:"context"`
		Target  k8s.ResourceRef        `json:"target"`
		Payload map[string]interface{} `json:"payload"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	if req.Context != "" {
		req.Target.Context = req.Context
	}

	rawReplicas, ok := req.Payload["replicas"]
	if !ok {
		writeError(w, http.StatusBadRequest, errors.New("scale payload requires replicas"))
		return
	}

	replicas, ok := rawReplicas.(float64)
	if !ok {
		writeError(w, http.StatusBadRequest, errors.New("replicas must be numeric"))
		return
	}

	result, err := s.engine.ScaleResource(r.Context(), req.Target, int64(replicas))
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleRestart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Context string          `json:"context"`
		Target  k8s.ResourceRef `json:"target"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	if req.Context != "" {
		req.Target.Context = req.Context
	}

	result, err := s.engine.RestartResource(r.Context(), req.Target)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handlePortForward(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Context   string `json:"context"`
		Namespace string `json:"namespace"`
		Resource  string `json:"resource"`
		Name      string `json:"name"`
		Ports     []int  `json:"ports"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":    fmt.Sprintf("%s:%s:%d", req.Namespace, req.Name, time.Now().Unix()),
		"ports": req.Ports,
	})
}

func (s *Server) handleWatch(w http.ResponseWriter, r *http.Request) {
	payload := map[string]any{
		"type": "BOOKMARK",
		"object": map[string]any{
			"kind": "Status",
			"metadata": map[string]string{
				"name": "watch-connected",
			},
			"status": map[string]string{
				"phase": "Connected",
			},
		},
	}

	if err := s.watches.StreamPlaceholder(w, r, payload); err != nil {
		writeError(w, http.StatusInternalServerError, err)
	}
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	if err := s.watches.StreamText(
		w,
		r,
		fmt.Sprintf("[%s] log streaming foundation is wired", time.Now().Format(time.RFC3339)),
		"pod log tailing will be implemented on top of this websocket surface",
	); err != nil {
		writeError(w, http.StatusInternalServerError, err)
	}
}

func (s *Server) handleExec(w http.ResponseWriter, r *http.Request) {
	if err := s.watches.StreamText(
		w,
		r,
		"exec websocket connected",
		"remotecommand streaming will be attached in the workload-actions phase",
	); err != nil {
		writeError(w, http.StatusInternalServerError, err)
	}
}
