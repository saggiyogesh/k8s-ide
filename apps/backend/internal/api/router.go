package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/k8s-ide/backend/internal/session"
)

func NewRouter(sessions *session.Manager) http.Handler {
	srv := NewServer(sessions)
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/api/health", srv.Health)
	r.Get("/api/contexts", srv.ListContexts)
	r.Post("/api/session/open", srv.OpenSession)
	r.Get("/api/discovery", srv.Discovery)

	r.Post("/api/resources/apply", srv.ApplyResource)

	r.Route("/api/resources/{group}/{version}/{resource}", func(r chi.Router) {
		r.Get("/", srv.ListResources)
		r.Get("/{name}", srv.GetResource)
		r.Delete("/{name}", srv.DeleteResource)
		r.Get("/n/{namespace}/{name}", srv.GetResource)
		r.Delete("/n/{namespace}/{name}", srv.DeleteResource)
	})

	r.Post("/api/actions/scale", srv.Scale)
	r.Post("/api/actions/restart", srv.Restart)

	r.Get("/ws/watch", srv.Watch)
	r.Get("/ws/logs/{namespace}/{pod}", srv.StreamLogs)
	r.Get("/ws/logs/{namespace}/{pod}/{container}", srv.StreamLogs)

	return r
}
