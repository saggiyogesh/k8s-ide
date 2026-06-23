package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/cursor/k8s-ide/apps/backend/internal/k8s"
	"github.com/gorilla/websocket"
)

type Server struct {
	engine   *k8s.Engine
	upgrader websocket.Upgrader
}

func NewServer(engine *k8s.Engine) *Server {
	return &Server{
		engine: engine,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool { return true },
		},
	}
}

func (s *Server) Router() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"version": "0.1.0",
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	})

	mux.HandleFunc("GET /api/contexts", s.handleListContexts)
	mux.HandleFunc("POST /api/session/open", s.handleOpenSession)
	mux.HandleFunc("GET /api/discovery", s.handleDiscovery)
	mux.HandleFunc("POST /api/resources/apply", s.handleApplyYAML)
	mux.HandleFunc("GET /api/resources/{group}/{version}/{resource}", s.handleListResources)
	mux.HandleFunc("GET /api/resources/{group}/{version}/{resource}/{name}", s.handleGetClusterResource)
	mux.HandleFunc("DELETE /api/resources/{group}/{version}/{resource}/{name}", s.handleDeleteClusterResource)
	mux.HandleFunc("GET /api/resources/{group}/{version}/{resource}/n/{namespace}/{name}", s.handleGetNamespacedResource)
	mux.HandleFunc("DELETE /api/resources/{group}/{version}/{resource}/n/{namespace}/{name}", s.handleDeleteNamespacedResource)
	mux.HandleFunc("POST /api/actions/exec-session", s.handleExecSession)
	mux.HandleFunc("POST /api/actions/port-forward-session", s.handlePortForwardSession)
	mux.HandleFunc("POST /api/actions/{action}", s.handleInvokeAction)
	mux.HandleFunc("GET /ws/watch", s.handleWatch)
	mux.HandleFunc("GET /ws/logs/{namespace}/{pod}", s.handleLogs)
	mux.HandleFunc("GET /ws/exec/{namespace}/{pod}", s.handleExec)

	return corsMiddleware(mux)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	http.Error(w, message, status)
}

func readJSON(r *http.Request, target any) error {
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		return fmt.Errorf("decode request body: %w", err)
	}
	return nil
}
