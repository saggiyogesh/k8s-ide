package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/gorilla/websocket"
	"github.com/k8s-ide/backend/internal/k8s"
)

type Handler struct {
	service  *k8s.Service
	upgrader websocket.Upgrader
}

func NewRouter(service *k8s.Service) http.Handler {
	handler := &Handler{
		service: service,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(*http.Request) bool { return true },
		},
	}

	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(middleware.Timeout(60 * time.Second))
	router.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"http://localhost:*", "http://127.0.0.1:*"},
		AllowedMethods: []string{"GET", "POST", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type"},
	}))

	router.Get("/healthz", handler.handleHealth)
	router.Get("/api/contexts", handler.handleContexts)
	router.Post("/api/session/open", handler.handleOpenSession)
	router.Get("/api/discovery", handler.handleDiscovery)
	router.Get("/api/resources/{group}/{version}/{resource}", handler.handleListResources)
	router.Get("/api/resources/{group}/{version}/{resource}/{name}", handler.handleGetClusterResource)
	router.Get("/api/resources/{group}/{version}/{resource}/n/{namespace}/{name}", handler.handleGetNamespacedResource)
	router.Delete("/api/resources/{group}/{version}/{resource}/{name}", handler.handleDeleteClusterResource)
	router.Delete("/api/resources/{group}/{version}/{resource}/n/{namespace}/{name}", handler.handleDeleteNamespacedResource)
	router.Post("/api/resources/apply", handler.handleApply)
	router.Post("/api/actions/{action}", handler.handleAction)
	router.Get("/ws/watch", handler.handleWatch)
	router.Get("/ws/logs/{namespace}/{pod}/{container}", handler.handleLogs)
	router.Get("/ws/exec/{namespace}/{pod}/{container}", handler.handleExec)

	return router
}
