package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/k8s-ide/backend/internal/session"
)

func NewRouter(mgr *session.Manager) http.Handler {
	h := NewHandler(mgr)

	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/healthz", h.Health)

	r.Route("/api", func(r chi.Router) {
		r.Get("/contexts", h.ListContexts)
		r.Post("/session/open", h.OpenSession)
		r.Get("/discovery", h.GetDiscovery)

		// Cluster-scoped resources
		r.Get("/resources/{group}/{version}/{resource}", h.ListResources)
		r.Get("/resources/{group}/{version}/{resource}/{name}", h.GetResource)
		r.Delete("/resources/{group}/{version}/{resource}/{name}", h.DeleteResource)

		// Namespaced resources
		r.Get("/resources/{group}/{version}/{resource}/n/{namespace}/{name}", h.GetNamespacedResource)
		r.Delete("/resources/{group}/{version}/{resource}/n/{namespace}/{name}", h.DeleteNamespacedResource)

		// Apply
		r.Post("/resources/apply", h.ApplyYAML)

		// Actions
		r.Post("/actions/scale", h.Scale)
		r.Post("/actions/restart", h.Restart)
	})

	// WebSocket endpoints
	r.Get("/ws/watch", h.WatchResources)
	r.Get("/ws/logs/{namespace}/{pod}/{container}", h.StreamLogs)

	return r
}
