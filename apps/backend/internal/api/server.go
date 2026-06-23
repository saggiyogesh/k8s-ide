package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/gorilla/websocket"
	"github.com/k8s-ide/backend/internal/k8s"
	"github.com/k8s-ide/backend/internal/session"
	"github.com/k8s-ide/backend/internal/watch"
)

type Server struct {
	sessions *session.Manager
	watches  *watch.Manager
	upgrader websocket.Upgrader
}

func NewServer(sessions *session.Manager) *Server {
	return &Server{
		sessions: sessions,
		watches:  watch.NewManager(),
		upgrader: websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
	}
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(r chi.Router) {
		r.Get("/contexts", s.handleListContexts)
		r.Post("/session/open", s.handleOpenSession)
		r.Get("/discovery", s.handleDiscovery)

		r.Get("/resources/{group}/{version}/{resource}", s.handleListResources)
		r.Get("/resources/{group}/{version}/{resource}/{name}", s.handleGetResource)
		r.Get("/resources/{group}/{version}/{resource}/n/{namespace}/{name}", s.handleGetNamespacedResource)
		r.Delete("/resources/{group}/{version}/{resource}/{name}", s.handleDeleteResource)
		r.Delete("/resources/{group}/{version}/{resource}/n/{namespace}/{name}", s.handleDeleteNamespacedResource)
		r.Post("/resources/apply", s.handleApply)

		r.Post("/actions/scale", s.handleScale)
		r.Post("/actions/restart", s.handleRestart)
	})

	r.Get("/ws/watch", s.handleWatch)

	return r
}

func (s *Server) k8sService() (*k8s.Service, error) {
	clients, err := s.sessions.Clients()
	if err != nil {
		return nil, err
	}
	return k8s.NewService(clients.Clientset, clients.Dynamic, clients.Discovery), nil
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (s *Server) handleListContexts(w http.ResponseWriter, r *http.Request) {
	ctxs, err := s.sessions.ListContexts()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]interface{}{"contexts": ctxs})
}

func (s *Server) handleOpenSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Context string `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	info, err := s.sessions.OpenContext(body.Context)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, info)
}

func (s *Server) handleDiscovery(w http.ResponseWriter, r *http.Request) {
	svc, err := s.k8sService()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	resources, err := k8s.Discover(r.Context(), svc.Discovery)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]interface{}{"resources": resources})
}

func (s *Server) handleListResources(w http.ResponseWriter, r *http.Request) {
	svc, err := s.k8sService()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	q := r.URL.Query()
	limit := int64(0)
	if l := q.Get("limit"); l != "" {
		if n, err := strconv.ParseInt(l, 10, 64); err == nil {
			limit = n
		}
	}
	result, err := k8s.ListResources(r.Context(), svc, k8s.ListOpts{
		Group:         chi.URLParam(r, "group"),
		Version:       chi.URLParam(r, "version"),
		Resource:      chi.URLParam(r, "resource"),
		Namespace:     q.Get("namespace"),
		LabelSelector: q.Get("labelSelector"),
		FieldSelector: q.Get("fieldSelector"),
		Limit:         limit,
		Continue:      q.Get("continue"),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, result)
}

func (s *Server) handleGetResource(w http.ResponseWriter, r *http.Request) {
	s.handleGet(w, r, "")
}

func (s *Server) handleGetNamespacedResource(w http.ResponseWriter, r *http.Request) {
	s.handleGet(w, r, chi.URLParam(r, "namespace"))
}

func (s *Server) handleGet(w http.ResponseWriter, r *http.Request, namespace string) {
	svc, err := s.k8sService()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	obj, err := k8s.GetResource(r.Context(), svc, k8s.GetOpts{
		Group:     chi.URLParam(r, "group"),
		Version:   chi.URLParam(r, "version"),
		Resource:  chi.URLParam(r, "resource"),
		Namespace: namespace,
		Name:      chi.URLParam(r, "name"),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, obj.Object)
}

func (s *Server) handleDeleteResource(w http.ResponseWriter, r *http.Request) {
	s.handleDelete(w, r, "")
}

func (s *Server) handleDeleteNamespacedResource(w http.ResponseWriter, r *http.Request) {
	s.handleDelete(w, r, chi.URLParam(r, "namespace"))
}

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request, namespace string) {
	svc, err := s.k8sService()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	err = k8s.DeleteResource(r.Context(), svc, k8s.GetOpts{
		Group:     chi.URLParam(r, "group"),
		Version:   chi.URLParam(r, "version"),
		Resource:  chi.URLParam(r, "resource"),
		Namespace: namespace,
		Name:      chi.URLParam(r, "name"),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	svc, err := s.k8sService()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var body struct {
		YAML string `json:"yaml"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	result, err := k8s.ApplyYAML(r.Context(), svc, body.YAML)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, result)
}

func (s *Server) handleScale(w http.ResponseWriter, r *http.Request) {
	svc, err := s.k8sService()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var req k8s.ScaleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := k8s.ScaleResource(r.Context(), svc, req.Ref, req.Params.Replicas); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]interface{}{"success": true})
}

func (s *Server) handleRestart(w http.ResponseWriter, r *http.Request) {
	svc, err := s.k8sService()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var req struct {
		Ref k8s.ResourceRef `json:"ref"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := k8s.RestartResource(r.Context(), svc, req.Ref); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]interface{}{"success": true})
}

func (s *Server) handleWatch(w http.ResponseWriter, r *http.Request) {
	clients, err := s.sessions.Clients()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	q := r.URL.Query()
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ch, unsub := s.watches.Subscribe(
		r.Context(),
		clients.Dynamic,
		q.Get("group"),
		q.Get("version"),
		q.Get("resource"),
		q.Get("namespace"),
		q.Get("labelSelector"),
		q.Get("resourceVersion"),
	)
	defer unsub()

	for {
		select {
		case <-r.Context().Done():
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			data, _ := watch.EncodeEvent(ev)
			if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return
			}
		}
	}
}

// suppress unused import
var _ = io.EOF
