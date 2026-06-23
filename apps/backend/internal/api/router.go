package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"
	"k8s.io/apimachinery/pkg/watch"

	"github.com/k8s-ide/backend/internal/k8s"
)

type Server struct {
	engine   *k8s.Engine
	upgrader websocket.Upgrader
}

func NewRouter(engine *k8s.Engine) http.Handler {
	server := &Server{
		engine: engine,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool {
				return true
			},
		},
	}

	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Logger)
	router.Use(middleware.Recoverer)

	router.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	router.Route("/api", func(r chi.Router) {
		r.Get("/contexts", server.handleContexts)
		r.Get("/session", server.handleGetSession)
		r.Post("/session/open", server.handleOpenSession)
		r.Get("/discovery", server.handleDiscovery)
		r.Post("/resources/apply", server.handleApplyResources)
		r.Get("/resources/{group}/{version}/{resource}", server.handleListResources)
		r.Get("/resources/{group}/{version}/{resource}/n/{namespace}/{name}", server.handleGetNamespacedResource)
		r.Get("/resources/{group}/{version}/{resource}/{name}", server.handleGetClusterResource)
		r.Delete("/resources/{group}/{version}/{resource}/n/{namespace}/{name}", server.handleDeleteNamespacedResource)
		r.Delete("/resources/{group}/{version}/{resource}/{name}", server.handleDeleteClusterResource)
		r.Post("/actions/scale", server.handleScaleResource)
		r.Post("/actions/restart", server.handleRestartResource)
		r.Post("/actions/exec", server.handleNotImplemented("exec"))
		r.Post("/actions/port-forward", server.handleNotImplemented("port-forward"))
	})

	router.Route("/ws", func(r chi.Router) {
		r.Get("/watch", server.handleWatchResources)
		r.Get("/logs/{namespace}/{pod}", server.handleNotImplemented("logs"))
		r.Get("/exec/{namespace}/{pod}", server.handleNotImplemented("exec"))
	})

	return router
}

func (s *Server) handleContexts(w http.ResponseWriter, r *http.Request) {
	items, err := s.engine.ListContexts(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.engine.GetSession(r.Context()))
}

func (s *Server) handleOpenSession(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Context string `json:"context"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	session, err := s.engine.OpenSession(r.Context(), request.Context)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, session)
}

func (s *Server) handleDiscovery(w http.ResponseWriter, r *http.Request) {
	items, err := s.engine.Discovery(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handleListResources(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.ParseInt(r.URL.Query().Get("limit"), 10, 64)
	result, err := s.engine.ListResources(r.Context(), k8s.ListResourcesRequest{
		Group:         chi.URLParam(r, "group"),
		Version:       chi.URLParam(r, "version"),
		Resource:      chi.URLParam(r, "resource"),
		Namespace:     r.URL.Query().Get("namespace"),
		LabelSelector: r.URL.Query().Get("labelSelector"),
		FieldSelector: r.URL.Query().Get("fieldSelector"),
		Limit:         limit,
		Continue:      r.URL.Query().Get("continue"),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleGetNamespacedResource(w http.ResponseWriter, r *http.Request) {
	s.handleGetResource(w, r, chi.URLParam(r, "namespace"))
}

func (s *Server) handleGetClusterResource(w http.ResponseWriter, r *http.Request) {
	s.handleGetResource(w, r, "")
}

func (s *Server) handleGetResource(w http.ResponseWriter, r *http.Request, namespace string) {
	result, err := s.engine.GetResource(r.Context(), k8s.GetResourceRequest{
		Group:     chi.URLParam(r, "group"),
		Version:   chi.URLParam(r, "version"),
		Resource:  chi.URLParam(r, "resource"),
		Namespace: namespace,
		Name:      chi.URLParam(r, "name"),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleDeleteNamespacedResource(w http.ResponseWriter, r *http.Request) {
	s.handleDeleteResource(w, r, chi.URLParam(r, "namespace"))
}

func (s *Server) handleDeleteClusterResource(w http.ResponseWriter, r *http.Request) {
	s.handleDeleteResource(w, r, "")
}

func (s *Server) handleDeleteResource(w http.ResponseWriter, r *http.Request, namespace string) {
	err := s.engine.DeleteResource(r.Context(), k8s.DeleteResourceRequest{
		Group:     chi.URLParam(r, "group"),
		Version:   chi.URLParam(r, "version"),
		Resource:  chi.URLParam(r, "resource"),
		Namespace: namespace,
		Name:      chi.URLParam(r, "name"),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleApplyResources(w http.ResponseWriter, r *http.Request) {
	var request k8s.ApplyRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	result, err := s.engine.ApplyResources(r.Context(), request)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleScaleResource(w http.ResponseWriter, r *http.Request) {
	var request k8s.ScaleActionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	result, err := s.engine.ScaleResource(r.Context(), request)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleRestartResource(w http.ResponseWriter, r *http.Request) {
	var request k8s.RestartActionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	result, err := s.engine.RestartResource(r.Context(), request)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleWatchResources(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	limit, _ := strconv.ParseInt(r.URL.Query().Get("limit"), 10, 64)
	stream, err := s.engine.WatchResources(context.Background(), k8s.ListResourcesRequest{
		Group:         r.URL.Query().Get("group"),
		Version:       r.URL.Query().Get("version"),
		Resource:      r.URL.Query().Get("resource"),
		Namespace:     r.URL.Query().Get("namespace"),
		LabelSelector: r.URL.Query().Get("labelSelector"),
		FieldSelector: r.URL.Query().Get("fieldSelector"),
		Limit:         limit,
	})
	if err != nil {
		_ = conn.WriteJSON(map[string]string{"error": err.Error()})
		return
	}
	defer stream.Stop()

	for event := range stream.ResultChan() {
		payload := map[string]any{
			"type":   string(event.Type),
			"object": extractObject(event),
		}
		if err := conn.WriteJSON(payload); err != nil {
			return
		}
	}
}

func (s *Server) handleNotImplemented(feature string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotImplemented, errors.New(feature+" is scaffolded but not implemented yet"))
	}
}

func extractObject(event watch.Event) any {
	if event.Object == nil {
		return nil
	}
	if object, ok := event.Object.(interface{ UnstructuredContent() map[string]any }); ok {
		return object.UnstructuredContent()
	}
	return event.Object
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
