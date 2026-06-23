package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/k8s-ide/backend/internal/k8s"
	"github.com/k8s-ide/backend/internal/session"
	"github.com/k8s-ide/backend/internal/watch"
)

type Server struct {
	sessions *session.Manager
	watches  *watch.Manager
}

func NewServer(sessions *session.Manager) *Server {
	return &Server{
		sessions: sessions,
		watches:  watch.NewManager(),
	}
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: false,
	}))

	r.Get("/api/health", s.handleHealth)
	r.Get("/api/contexts", s.handleListContexts)
	r.Post("/api/session/open", s.handleOpenSession)
	r.Get("/api/discovery", s.handleDiscovery)

	r.Route("/api/resources", func(r chi.Router) {
		r.Post("/apply", s.handleApply)
		r.Get("/{group}/{version}/{resource}", s.handleListResources)
		r.Get("/{version}/{resource}", s.handleListCoreResources)
		r.Get("/{group}/{version}/{resource}/{name}", s.handleGetClusterResource)
		r.Get("/{version}/{resource}/{name}", s.handleGetCoreResource)
		r.Get("/{group}/{version}/{resource}/n/{namespace}/{name}", s.handleGetNamespacedResource)
		r.Get("/{version}/{resource}/n/{namespace}/{name}", s.handleGetCoreNamespacedResource)
		r.Delete("/{group}/{version}/{resource}/{name}", s.handleDeleteClusterResource)
		r.Delete("/{version}/{resource}/{name}", s.handleDeleteCoreResource)
		r.Delete("/{group}/{version}/{resource}/n/{namespace}/{name}", s.handleDeleteNamespacedResource)
		r.Delete("/{version}/{resource}/n/{namespace}/{name}", s.handleDeleteCoreNamespacedResource)
	})

	r.Post("/api/actions/scale", s.handleScale)
	r.Post("/api/actions/restart", s.handleRestart)
	r.Post("/api/actions/port-forward", s.handlePortForward)

	r.Get("/ws/watch", s.handleWatchWS)

	return r
}

func (s *Server) engine(r *http.Request) (*k8s.Engine, error) {
	restConfig, err := s.sessions.RESTConfig()
	if err != nil {
		return nil, err
	}
	return k8s.NewEngine(restConfig)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleListContexts(w http.ResponseWriter, r *http.Request) {
	contexts, err := s.sessions.ListContexts()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, contexts)
}

func (s *Server) handleOpenSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Context string `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	info, err := s.sessions.OpenSession(body.Context)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleDiscovery(w http.ResponseWriter, r *http.Request) {
	engine, err := s.engine(r)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err)
		return
	}
	items, err := engine.Discover(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handleListResources(w http.ResponseWriter, r *http.Request) {
	group := chi.URLParam(r, "group")
	version := chi.URLParam(r, "version")
	resource := chi.URLParam(r, "resource")
	s.listResources(w, r, group, version, resource)
}

func (s *Server) handleListCoreResources(w http.ResponseWriter, r *http.Request) {
	version := chi.URLParam(r, "version")
	resource := chi.URLParam(r, "resource")
	s.listResources(w, r, "", version, resource)
}

func (s *Server) listResources(w http.ResponseWriter, r *http.Request, group, version, resource string) {
	engine, err := s.engine(r)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err)
		return
	}

	namespace := r.URL.Query().Get("namespace")
	limit, _ := strconv.ParseInt(r.URL.Query().Get("limit"), 10, 64)
	result, err := engine.List(
		r.Context(),
		group,
		version,
		resource,
		namespace,
		r.URL.Query().Get("labelSelector"),
		r.URL.Query().Get("fieldSelector"),
		r.URL.Query().Get("continue"),
		limit,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleGetClusterResource(w http.ResponseWriter, r *http.Request) {
	s.getResource(w, r, chi.URLParam(r, "group"), chi.URLParam(r, "version"), chi.URLParam(r, "resource"), "", chi.URLParam(r, "name"))
}

func (s *Server) handleGetCoreResource(w http.ResponseWriter, r *http.Request) {
	s.getResource(w, r, "", chi.URLParam(r, "version"), chi.URLParam(r, "resource"), "", chi.URLParam(r, "name"))
}

func (s *Server) handleGetNamespacedResource(w http.ResponseWriter, r *http.Request) {
	s.getResource(w, r, chi.URLParam(r, "group"), chi.URLParam(r, "version"), chi.URLParam(r, "resource"), chi.URLParam(r, "namespace"), chi.URLParam(r, "name"))
}

func (s *Server) handleGetCoreNamespacedResource(w http.ResponseWriter, r *http.Request) {
	s.getResource(w, r, "", chi.URLParam(r, "version"), chi.URLParam(r, "resource"), chi.URLParam(r, "namespace"), chi.URLParam(r, "name"))
}

func (s *Server) getResource(w http.ResponseWriter, r *http.Request, group, version, resource, namespace, name string) {
	engine, err := s.engine(r)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err)
		return
	}
	obj, err := engine.Get(r.Context(), group, version, resource, namespace, name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, obj)
}

func (s *Server) handleDeleteClusterResource(w http.ResponseWriter, r *http.Request) {
	s.deleteResource(w, r, chi.URLParam(r, "group"), chi.URLParam(r, "version"), chi.URLParam(r, "resource"), "", chi.URLParam(r, "name"))
}

func (s *Server) handleDeleteCoreResource(w http.ResponseWriter, r *http.Request) {
	s.deleteResource(w, r, "", chi.URLParam(r, "version"), chi.URLParam(r, "resource"), "", chi.URLParam(r, "name"))
}

func (s *Server) handleDeleteNamespacedResource(w http.ResponseWriter, r *http.Request) {
	s.deleteResource(w, r, chi.URLParam(r, "group"), chi.URLParam(r, "version"), chi.URLParam(r, "resource"), chi.URLParam(r, "namespace"), chi.URLParam(r, "name"))
}

func (s *Server) handleDeleteCoreNamespacedResource(w http.ResponseWriter, r *http.Request) {
	s.deleteResource(w, r, "", chi.URLParam(r, "version"), chi.URLParam(r, "resource"), chi.URLParam(r, "namespace"), chi.URLParam(r, "name"))
}

func (s *Server) deleteResource(w http.ResponseWriter, r *http.Request, group, version, resource, namespace, name string) {
	engine, err := s.engine(r)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err)
		return
	}
	if err := engine.Delete(r.Context(), group, version, resource, namespace, name); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	engine, err := s.engine(r)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err)
		return
	}
	result, err := engine.ApplyYAML(r.Context(), string(body))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
