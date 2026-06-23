package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/gorilla/websocket"
	"github.com/k8s-ide/backend/internal/k8s"
	"github.com/k8s-ide/backend/internal/actions"
	"github.com/k8s-ide/backend/internal/session"
	watchmgr "github.com/k8s-ide/backend/internal/watch"
)

type Server struct {
	sess    *session.Manager
	engine  *k8s.Engine
	watches *watchmgr.Manager
}

func NewRouter(sess *session.Manager) http.Handler {
	s := &Server{sess: sess}

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

		r.Route("/resources", func(r chi.Router) {
			r.Post("/apply", s.handleApply)
			r.Get("/{group}/{version}/{resource}", s.handleListResources)
			r.Get("/{group}/{version}/{resource}/{name}", s.handleGetResource)
			r.Delete("/{group}/{version}/{resource}/{name}", s.handleDeleteResource)
			r.Get("/{group}/{version}/{resource}/n/{namespace}/{name}", s.handleGetNamespacedResource)
			r.Delete("/{group}/{version}/{resource}/n/{namespace}/{name}", s.handleDeleteNamespacedResource)
		})

		r.Route("/actions", func(r chi.Router) {
			r.Post("/scale", s.handleScale)
			r.Post("/restart", s.handleRestart)
		})
	})

	r.Get("/ws/watch", s.handleWatch)

	return r
}

func (s *Server) ensureEngine(w http.ResponseWriter) bool {
	if s.engine != nil {
		return true
	}
	cfg := s.sess.RestConfig()
	if cfg == nil {
		writeError(w, http.StatusServiceUnavailable, "no active session")
		return false
	}
	engine, err := k8s.NewEngine(cfg)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	s.engine = engine
	s.watches = watchmgr.NewManager(engine.Dynamic())
	return true
}

func (s *Server) handleListContexts(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]interface{}{"contexts": s.sess.ListContexts()})
}

func (s *Server) handleOpenSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Context string `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	info, err := s.sess.OpenSession(body.Context)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.engine = nil
	s.watches = nil
	writeJSON(w, info)
}

func (s *Server) handleDiscovery(w http.ResponseWriter, r *http.Request) {
	if !s.ensureEngine(w) {
		return
	}
	resources, err := s.engine.Discover(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]interface{}{"resources": resources})
}

func parseGVR(r *http.Request) (group, version, resource string) {
	group = decodeGroup(chi.URLParam(r, "group"))
	version = chi.URLParam(r, "version")
	resource = chi.URLParam(r, "resource")
	return
}

func decodeGroup(g string) string {
	if g == "_" {
		return ""
	}
	return g
}

func (s *Server) handleListResources(w http.ResponseWriter, r *http.Request) {
	if !s.ensureEngine(w) {
		return
	}
	group, version, resource := parseGVR(r)
	namespace := r.URL.Query().Get("namespace")
	labelSelector := r.URL.Query().Get("labelSelector")
	fieldSelector := r.URL.Query().Get("fieldSelector")
	continueToken := r.URL.Query().Get("continue")
	limit, _ := strconv.ParseInt(r.URL.Query().Get("limit"), 10, 64)

	gvr := k8s.GVR(group, version, resource)
	result, err := s.engine.List(r.Context(), gvr, namespace, labelSelector, fieldSelector, continueToken, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, result)
}

func (s *Server) handleGetResource(w http.ResponseWriter, r *http.Request) {
	if !s.ensureEngine(w) {
		return
	}
	group, version, resource := parseGVR(r)
	name := chi.URLParam(r, "name")
	gvr := k8s.GVR(group, version, resource)
	obj, err := s.engine.Get(r.Context(), gvr, "", name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, obj)
}

func (s *Server) handleGetNamespacedResource(w http.ResponseWriter, r *http.Request) {
	if !s.ensureEngine(w) {
		return
	}
	group, version, resource := parseGVR(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	gvr := k8s.GVR(group, version, resource)
	obj, err := s.engine.Get(r.Context(), gvr, namespace, name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, obj)
}

func (s *Server) handleDeleteResource(w http.ResponseWriter, r *http.Request) {
	if !s.ensureEngine(w) {
		return
	}
	group, version, resource := parseGVR(r)
	name := chi.URLParam(r, "name")
	gvr := k8s.GVR(group, version, resource)
	if err := s.engine.Delete(r.Context(), gvr, "", name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleDeleteNamespacedResource(w http.ResponseWriter, r *http.Request) {
	if !s.ensureEngine(w) {
		return
	}
	group, version, resource := parseGVR(r)
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	gvr := k8s.GVR(group, version, resource)
	if err := s.engine.Delete(r.Context(), gvr, namespace, name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	if !s.ensureEngine(w) {
		return
	}
	var body struct {
		YAML string `json:"yaml"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	result, err := s.engine.ApplyYAML(r.Context(), body.YAML)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, result)
}

func (s *Server) handleScale(w http.ResponseWriter, r *http.Request) {
	if !s.ensureEngine(w) {
		return
	}
	var req actions.ScaleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	result, err := actions.Scale(r.Context(), s.sess.Clientset(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, result)
}

func (s *Server) handleRestart(w http.ResponseWriter, r *http.Request) {
	if !s.ensureEngine(w) {
		return
	}
	var req actions.RestartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	result, err := actions.Restart(r.Context(), s.sess.Clientset(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, result)
}

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

func (s *Server) handleWatch(w http.ResponseWriter, r *http.Request) {
	if !s.ensureEngine(w) {
		return
	}

	group := decodeGroup(r.URL.Query().Get("group"))
	version := r.URL.Query().Get("version")
	resource := r.URL.Query().Get("resource")
	namespace := r.URL.Query().Get("namespace")
	labelSelector := r.URL.Query().Get("labelSelector")
	fieldSelector := r.URL.Query().Get("fieldSelector")
	resourceVersion := r.URL.Query().Get("resourceVersion")

	gvr := k8s.GVR(group, version, resource)
	ch, unsub := s.watches.Subscribe(r.Context(), gvr, namespace, labelSelector, fieldSelector, resourceVersion)
	defer unsub()

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	for {
		select {
		case <-r.Context().Done():
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			if err := conn.WriteJSON(ev); err != nil {
				return
			}
		}
	}
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
