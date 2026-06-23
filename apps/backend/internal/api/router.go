package api

import (
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// NewRouter builds and returns the fully-configured chi router.
func NewRouter(h *Handler) *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Route("/api", func(r chi.Router) {
		r.Get("/contexts", h.ListContexts)
		r.Post("/session/open", h.OpenSession)
		r.Get("/discovery", h.GetDiscovery)

		r.Route("/resources", func(r chi.Router) {
			r.Post("/apply", h.ApplyResource)
			r.Route("/{group}/{version}/{resource}", func(r chi.Router) {
				r.Get("/", h.ListResources)
				r.Get("/{name}", h.GetResource)
				r.Delete("/{name}", h.DeleteResource)
				r.Route("/n/{namespace}", func(r chi.Router) {
					r.Get("/", h.ListResources)
					r.Get("/{name}", h.GetNamespacedResource)
					r.Delete("/{name}", h.DeleteNamespacedResource)
				})
			})
		})

		r.Route("/actions", func(r chi.Router) {
			r.Post("/scale", h.ScaleAction)
			r.Post("/restart", h.RestartAction)
		})
	})

	r.Route("/ws", func(r chi.Router) {
		r.Get("/watch", h.WatchResources)
		r.Get("/logs/{namespace}/{pod}", h.StreamLogs)
	})

	return r
}
