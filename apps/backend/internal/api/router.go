package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"

	"github.com/example/k8s-ide/apps/backend/internal/k8s"
	backendwatch "github.com/example/k8s-ide/apps/backend/internal/watch"
)

type Server struct {
	engine       *k8s.Engine
	watchManager *backendwatch.Manager
	upgrader     websocket.Upgrader
}

func NewRouter(engine *k8s.Engine, watchManager *backendwatch.Manager) http.Handler {
	server := &Server{
		engine:       engine,
		watchManager: watchManager,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool {
				return true
			},
		},
	}

	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(middleware.Logger)
	router.Use(middleware.Timeout(30 * time.Second))

	router.Get("/health", func(writer http.ResponseWriter, request *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]any{
			"ok":      true,
			"streams": watchManager.Snapshot(),
		})
	})

	router.Get("/api/contexts", server.handleListContexts)
	router.Post("/api/session/open", server.handleOpenSession)
	router.Get("/api/discovery", server.handleDiscovery)

	router.Get("/api/resources/{group}/{version}/{resource}", server.handleListResources)
	router.Get("/api/resources/{group}/{version}/{resource}/{name}", server.handleGetClusterResource)
	router.Get("/api/resources/{group}/{version}/{resource}/n/{namespace}/{name}", server.handleGetNamespacedResource)
	router.Delete("/api/resources/{group}/{version}/{resource}/{name}", server.handleDeleteClusterResource)
	router.Delete("/api/resources/{group}/{version}/{resource}/n/{namespace}/{name}", server.handleDeleteNamespacedResource)
	router.Post("/api/resources/apply", server.handleApplyYAML)

	router.Post("/api/actions/{action}", server.handleAction)

	router.Get("/ws/watch/{group}/{version}/{resource}", server.handleWatchSocket)
	router.Get("/ws/logs/{namespace}/{pod}", server.handleLogsSocket)
	router.Get("/ws/exec/{namespace}/{pod}", server.handleExecSocket)

	return router
}

func (s *Server) handleListContexts(writer http.ResponseWriter, _ *http.Request) {
	contexts, err := s.engine.ListContexts()
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err)
		return
	}

	writeJSON(writer, http.StatusOK, contexts)
}

func (s *Server) handleOpenSession(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Context string `json:"context"`
	}

	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	sessionInfo, err := s.engine.OpenSession(request.Context(), payload.Context)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writeJSON(writer, http.StatusOK, sessionInfo)
}

func (s *Server) handleDiscovery(writer http.ResponseWriter, request *http.Request) {
	descriptors, err := s.engine.DiscoverResources(request.Context())
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writeJSON(writer, http.StatusOK, descriptors)
}

func (s *Server) handleListResources(writer http.ResponseWriter, request *http.Request) {
	query := readResourceQuery(request)
	list, err := s.engine.ListResources(request.Context(), query)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writeJSON(writer, http.StatusOK, list)
}

func (s *Server) handleGetClusterResource(writer http.ResponseWriter, request *http.Request) {
	s.handleGetResource(writer, request, "")
}

func (s *Server) handleGetNamespacedResource(writer http.ResponseWriter, request *http.Request) {
	s.handleGetResource(writer, request, chi.URLParam(request, "namespace"))
}

func (s *Server) handleGetResource(writer http.ResponseWriter, request *http.Request, namespace string) {
	resource, err := s.engine.GetResource(request.Context(), k8s.ResourceTarget{
		Group:     decodeGroupParam(chi.URLParam(request, "group")),
		Version:   chi.URLParam(request, "version"),
		Resource:  chi.URLParam(request, "resource"),
		Namespace: namespace,
		Name:      chi.URLParam(request, "name"),
	})
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writeJSON(writer, http.StatusOK, resource)
}

func (s *Server) handleDeleteClusterResource(writer http.ResponseWriter, request *http.Request) {
	s.handleDeleteResource(writer, request, "")
}

func (s *Server) handleDeleteNamespacedResource(writer http.ResponseWriter, request *http.Request) {
	s.handleDeleteResource(writer, request, chi.URLParam(request, "namespace"))
}

func (s *Server) handleDeleteResource(writer http.ResponseWriter, request *http.Request, namespace string) {
	err := s.engine.DeleteResource(request.Context(), k8s.ResourceTarget{
		Group:     decodeGroupParam(chi.URLParam(request, "group")),
		Version:   chi.URLParam(request, "version"),
		Resource:  chi.URLParam(request, "resource"),
		Namespace: namespace,
		Name:      chi.URLParam(request, "name"),
	})
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleApplyYAML(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		YAML string `json:"yaml"`
	}

	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	result, err := s.engine.ApplyYAML(request.Context(), payload.YAML)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writeJSON(writer, http.StatusOK, result)
}

func (s *Server) handleAction(writer http.ResponseWriter, request *http.Request) {
	var actionRequest k8s.ActionRequest
	if err := json.NewDecoder(request.Body).Decode(&actionRequest); err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	actionRequest.Action = chi.URLParam(request, "action")
	if actionRequest.Action == "port-forward" {
		session, err := s.engine.StartPortForward(request.Context(), actionRequest)
		if err != nil {
			writeError(writer, http.StatusBadRequest, err)
			return
		}

		writeJSON(writer, http.StatusOK, session)
		return
	}

	result, err := s.engine.InvokeAction(request.Context(), actionRequest)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writeJSON(writer, http.StatusOK, result)
}

func (s *Server) handleWatchSocket(writer http.ResponseWriter, request *http.Request) {
	namespace := request.URL.Query().Get("namespace")
	key := fmt.Sprintf(
		"%s/%s/%s/%s",
		decodeGroupParam(chi.URLParam(request, "group")),
		chi.URLParam(request, "version"),
		chi.URLParam(request, "resource"),
		namespace,
	)
	state := s.watchManager.Touch(key)

	s.writeSocketJSON(writer, request, map[string]any{
		"type": "BOOKMARK",
		"object": map[string]any{
			"kind": "WatchStreamStatus",
			"metadata": map[string]any{
				"name": key,
			},
			"status": "watch manager scaffold initialized",
			"subscribers": state.Subscribers,
		},
	})
}

func (s *Server) handleLogsSocket(writer http.ResponseWriter, request *http.Request) {
	s.writeSocketJSON(writer, request, map[string]string{
		"line": fmt.Sprintf(
			"logs scaffold for %s/%s; full stream integration is the next step",
			chi.URLParam(request, "namespace"),
			chi.URLParam(request, "pod"),
		),
	})
}

func (s *Server) handleExecSocket(writer http.ResponseWriter, request *http.Request) {
	command := request.URL.Query().Get("command")
	s.writeSocketJSON(writer, request, map[string]string{
		"line": fmt.Sprintf(
			"exec scaffold for %s/%s command=%q",
			chi.URLParam(request, "namespace"),
			chi.URLParam(request, "pod"),
			command,
		),
	})
}

func (s *Server) writeSocketJSON(writer http.ResponseWriter, request *http.Request, payload any) {
	conn, err := s.upgrader.Upgrade(writer, request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	_ = conn.WriteJSON(payload)
	_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
}

func readResourceQuery(request *http.Request) k8s.ResourceQuery {
	limit, _ := strconv.ParseInt(request.URL.Query().Get("limit"), 10, 64)
	namespace := request.URL.Query().Get("namespace")

	return k8s.ResourceQuery{
		Group:         decodeGroupParam(chi.URLParam(request, "group")),
		Version:       chi.URLParam(request, "version"),
		Resource:      chi.URLParam(request, "resource"),
		Namespace:     namespace,
		LabelSelector: request.URL.Query().Get("labelSelector"),
		FieldSelector: request.URL.Query().Get("fieldSelector"),
		Limit:         limit,
	}
}

func decodeGroupParam(value string) string {
	if value == "" || value == "core" || value == "_" {
		return ""
	}

	return value
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}

func writeError(writer http.ResponseWriter, status int, err error) {
	writeJSON(writer, status, map[string]any{
		"error": err.Error(),
	})
}

func WithBaseContext(base context.Context, next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		next.ServeHTTP(writer, request.WithContext(base))
	})
}
