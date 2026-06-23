package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"

	"github.com/k8s-ide/backend/internal/k8s"
	"github.com/k8s-ide/backend/internal/session"
	watchmgr "github.com/k8s-ide/backend/internal/watch"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Server struct {
	sessions *session.Manager
	engine   *k8s.Engine
	actions  *k8s.Actions
	watches  *watchmgr.Manager
}

func NewServer(sessions *session.Manager) *Server {
	return &Server{sessions: sessions}
}

func (s *Server) ensureEngine() error {
	if s.engine != nil {
		return nil
	}
	clientset, err := s.sessions.Clientset()
	if err != nil {
		return err
	}
	restConfig, err := s.sessions.RestConfig()
	if err != nil {
		return err
	}
	engine, err := k8s.NewEngine(restConfig, clientset)
	if err != nil {
		return err
	}
	s.engine = engine
	s.actions = k8s.NewActions(clientset)
	s.watches = watchmgr.NewManager(engine)
	return nil
}

func (s *Server) Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) ListContexts(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{"contexts": s.sessions.ListContexts()})
}

func (s *Server) OpenSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Context string `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	info, err := s.sessions.OpenContext(req.Context)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.engine = nil
	s.actions = nil
	s.watches = nil
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) Discovery(w http.ResponseWriter, r *http.Request) {
	if err := s.ensureEngine(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	resources, err := s.engine.Discover()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"resources": resources})
}

func (s *Server) ListResources(w http.ResponseWriter, r *http.Request) {
	if err := s.ensureEngine(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	group := decodeGroup(chi.URLParam(r, "group"))
	version := chi.URLParam(r, "version")
	resource := chi.URLParam(r, "resource")
	namespace := r.URL.Query().Get("namespace")
	labelSelector := r.URL.Query().Get("labelSelector")
	fieldSelector := r.URL.Query().Get("fieldSelector")
	continueToken := r.URL.Query().Get("continue")
	limit, _ := strconv.ParseInt(r.URL.Query().Get("limit"), 10, 64)

	result, err := s.engine.List(r.Context(), group, version, resource, namespace, labelSelector, fieldSelector, continueToken, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) GetResource(w http.ResponseWriter, r *http.Request) {
	if err := s.ensureEngine(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	group := decodeGroup(chi.URLParam(r, "group"))
	version := chi.URLParam(r, "version")
	resource := chi.URLParam(r, "resource")
	name := chi.URLParam(r, "name")
	namespace := chi.URLParam(r, "namespace")

	obj, err := s.engine.Get(r.Context(), group, version, resource, namespace, name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, obj)
}

func (s *Server) DeleteResource(w http.ResponseWriter, r *http.Request) {
	if err := s.ensureEngine(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	group := decodeGroup(chi.URLParam(r, "group"))
	version := chi.URLParam(r, "version")
	resource := chi.URLParam(r, "resource")
	name := chi.URLParam(r, "name")
	namespace := chi.URLParam(r, "namespace")

	if err := s.engine.Delete(r.Context(), group, version, resource, namespace, name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) ApplyResource(w http.ResponseWriter, r *http.Request) {
	if err := s.ensureEngine(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := s.engine.ApplyYAML(r.Context(), string(body))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) Scale(w http.ResponseWriter, r *http.Request) {
	if err := s.ensureEngine(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req k8s.ScaleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := s.actions.Scale(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) Restart(w http.ResponseWriter, r *http.Request) {
	if err := s.ensureEngine(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req k8s.RestartRequest
	if err := json.Unmarshal(body, &req); err != nil || req.Name == "" {
		var wrapped struct {
			Ref struct {
				Group     string `json:"group"`
				Version   string `json:"version"`
				Resource  string `json:"resource"`
				Namespace string `json:"namespace"`
				Name      string `json:"name"`
			} `json:"ref"`
		}
		if err2 := json.Unmarshal(body, &wrapped); err2 != nil || wrapped.Ref.Name == "" {
			writeError(w, http.StatusBadRequest, "invalid restart request")
			return
		}
		req = k8s.RestartRequest{
			Group: wrapped.Ref.Group, Version: wrapped.Ref.Version,
			Resource: wrapped.Ref.Resource, Namespace: wrapped.Ref.Namespace, Name: wrapped.Ref.Name,
		}
	}

	result, err := s.actions.Restart(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) Watch(w http.ResponseWriter, r *http.Request) {
	if err := s.ensureEngine(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade: %v", err)
		return
	}
	defer conn.Close()

	group := r.URL.Query().Get("group")
	version := r.URL.Query().Get("version")
	resource := r.URL.Query().Get("resource")
	namespace := r.URL.Query().Get("namespace")
	labelSelector := r.URL.Query().Get("labelSelector")
	fieldSelector := r.URL.Query().Get("fieldSelector")
	resourceVersion := r.URL.Query().Get("resourceVersion")

	key := watchmgr.WatchKey(group, version, resource, namespace)
	events, cancel := s.watches.Subscribe(r.Context(), key, group, version, resource, namespace, labelSelector, fieldSelector, resourceVersion)
	defer cancel()

	for ev := range events {
		if err := conn.WriteJSON(ev); err != nil {
			return
		}
	}
}

func (s *Server) StreamLogs(w http.ResponseWriter, r *http.Request) {
	if err := s.ensureEngine(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	namespace := chi.URLParam(r, "namespace")
	pod := chi.URLParam(r, "pod")
	container := chi.URLParam(r, "container")

	clientset, err := s.sessions.Clientset()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(err.Error()))
		return
	}

	tailLines := int64(100)
	if v := r.URL.Query().Get("tailLines"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			tailLines = n
		}
	}
	follow := r.URL.Query().Get("follow") == "true"
	previous := r.URL.Query().Get("previous") == "true"

	opts := &corev1.PodLogOptions{
		Container: container,
		Follow:    follow,
		Previous:  previous,
		TailLines: &tailLines,
	}

	req := clientset.CoreV1().Pods(namespace).GetLogs(pod, opts)
	stream, err := req.Stream(r.Context())
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(err.Error()))
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

func decodeGroup(g string) string {
	if g == "_" {
		return ""
	}
	return g
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write json: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func normalizeResourcePath(path string) string {
	return strings.TrimPrefix(path, "/")
}
