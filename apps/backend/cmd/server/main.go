package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/example/k8s-ide/apps/backend/internal/api"
	"github.com/example/k8s-ide/apps/backend/internal/k8s"
	"github.com/example/k8s-ide/apps/backend/internal/session"
	backendwatch "github.com/example/k8s-ide/apps/backend/internal/watch"
)

func main() {
	baseContext, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	port := os.Getenv("PORT")
	if port == "" {
		port = "9845"
	}

	loader := session.NewLoader()
	watchManager := backendwatch.NewManager()
	engine := k8s.NewEngine(loader, watchManager)

	server := &http.Server{
		Addr:              "127.0.0.1:" + port,
		Handler:           api.WithBaseContext(baseContext, api.NewRouter(engine, watchManager)),
		ReadHeaderTimeout: 15 * time.Second,
	}

	log.Printf("starting Kubernetes IDE backend on http://%s", server.Addr)

	go func() {
		<-baseContext.Done()

		shutdownContext, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()

		if err := server.Shutdown(shutdownContext); err != nil {
			log.Printf("backend shutdown error: %v", err)
		}
	}()

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
