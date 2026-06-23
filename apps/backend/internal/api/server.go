package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/k8s-ide/backend/internal/k8s"
	watcher "github.com/k8s-ide/backend/internal/watch"
)

type Server struct {
	engine  *k8s.Engine
	watches *watcher.Manager
}

func NewServer(engine *k8s.Engine, watches *watcher.Manager) *Server {
	return &Server{engine: engine, watches: watches}
}

func (s *Server) Routes() http.Handler {
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(middleware.Logger)
	router.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type"},
	}))

	router.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	router.Get("/api/contexts", s.handleListContexts)
	router.Post("/api/session/open", s.handleOpenSession)
	router.Get("/api/discovery", s.handleDiscovery)

	router.Route("/api/resources", func(r chi.Router) {
		r.Post("/apply", s.handleApplyYAML)
		r.Get("/{group}/{version}/{resource}", s.handleListResources)
		r.Get("/{group}/{version}/{resource}/n/{namespace}/{name}", s.handleGetResource)
		r.Get("/{group}/{version}/{resource}/{name}", s.handleGetResource)
		r.Delete("/{group}/{version}/{resource}/n/{namespace}/{name}", s.handleDeleteResource)
		r.Delete("/{group}/{version}/{resource}/{name}", s.handleDeleteResource)
	})

	router.Route("/api/actions", func(r chi.Router) {
		r.Post("/scale", s.handleScale)
		r.Post("/restart", s.handleRestart)
		r.Post("/port-forward", func(w http.ResponseWriter, _ *http.Request) {
			writeError(w, http.StatusNotImplemented, errors.New("port-forward will be exposed through a websocket-backed stream in a follow-up"))
		})
	})

	router.Route("/ws", func(r chi.Router) {
		r.Get("/watch", s.handleWatch)
		r.Get("/logs/{namespace}/{pod}/{container}", s.handleStubStream("logs"))
		r.Get("/exec/{namespace}/{pod}/{container}", s.handleStubStream("exec"))
	})

	return router
}

func requestContext(r *http.Request) string {
	return r.URL.Query().Get("context")
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func (s *Server) handleListContexts(w http.ResponseWriter, r *http.Request) {
	contexts, err := s.engine.ListContexts(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, contexts)
}

func (s *Server) handleOpenSession(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Context string `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	sessionInfo, err := s.engine.OpenSession(r.Context(), request.Context)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, sessionInfo)
}

func (s *Server) handleDiscovery(w http.ResponseWriter, r *http.Request) {
	discovery, err := s.engine.Discovery(requestContext(r))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, discovery)
}

func (s *Server) handleListResources(w http.ResponseWriter, r *http.Request) {
	limit := int64(0)
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("invalid limit: %w", err))
			return
		}
		limit = parsed
	}

	result, err := s.engine.ListResources(k8s.ListOptions{
		Context:       requestContext(r),
		Group:         chi.URLParam(r, "group"),
		Version:       chi.URLParam(r, "version"),
		Resource:      chi.URLParam(r, "resource"),
		Namespace:     r.URL.Query().Get("namespace"),
		LabelSelector: r.URL.Query().Get("labelSelector"),
		FieldSelector: r.URL.Query().Get("fieldSelector"),
		Continue:      r.URL.Query().Get("continue"),
		Limit:         limit,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleGetResource(w http.ResponseWriter, r *http.Request) {
	resource, err := s.engine.GetResource(k8s.GetOptions{
		Context:   requestContext(r),
		Group:     chi.URLParam(r, "group"),
		Version:   chi.URLParam(r, "version"),
		Resource:  chi.URLParam(r, "resource"),
		Namespace: chi.URLParam(r, "namespace"),
		Name:      chi.URLParam(r, "name"),
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, resource)
}

func (s *Server) handleDeleteResource(w http.ResponseWriter, r *http.Request) {
	err := s.engine.DeleteResource(k8s.DeleteOptions{
		Context:   requestContext(r),
		Group:     chi.URLParam(r, "group"),
		Version:   chi.URLParam(r, "version"),
		Resource:  chi.URLParam(r, "resource"),
		Namespace: chi.URLParam(r, "namespace"),
		Name:      chi.URLParam(r, "name"),
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleApplyYAML(w http.ResponseWriter, r *http.Request) {
	var request k8s.ApplyRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	result, err := s.engine.ApplyYAML(request)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleScale(w http.ResponseWriter, r *http.Request) {
	var request k8s.ScaleActionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	result, err := s.engine.ScaleWorkload(request)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleRestart(w http.ResponseWriter, r *http.Request) {
	var request k8s.RestartActionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	result, err := s.engine.RestartWorkload(request)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleWatch(w http.ResponseWriter, r *http.Request) {
	if err := s.watches.ServeWS(w, r, watcher.StreamOptions{
		Context:       requestContext(r),
		Group:         r.URL.Query().Get("group"),
		Version:       r.URL.Query().Get("version"),
		Resource:      r.URL.Query().Get("resource"),
		Namespace:     r.URL.Query().Get("namespace"),
		LabelSelector: r.URL.Query().Get("labelSelector"),
		FieldSelector: r.URL.Query().Get("fieldSelector"),
	}); err != nil {
		writeError(w, http.StatusBadRequest, err)
	}
}

func (s *Server) handleStubStream(kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := watcher.ServeStubStream(w, r, kind); err != nil {
			writeError(w, http.StatusBadRequest, err)
		}
	}
}
