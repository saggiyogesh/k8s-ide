package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/k8s-ide/k8s-ide/apps/backend/internal/api"
	"github.com/k8s-ide/k8s-ide/apps/backend/internal/k8s"
	"github.com/k8s-ide/k8s-ide/apps/backend/internal/session"
	backendwatch "github.com/k8s-ide/k8s-ide/apps/backend/internal/watch"
)

func main() {
	address := envOrDefault("K8S_IDE_BACKEND_ADDR", "127.0.0.1:7447")
	version := envOrDefault("K8S_IDE_BACKEND_VERSION", "0.1.0")

	sessionManager := session.NewManager(version)
	engine := k8s.NewEngine(sessionManager)
	watchManager := backendwatch.NewManager(engine)
	server := api.NewServer(api.Config{Address: address}, sessionManager, engine, watchManager)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("backend shutdown failed: %v", err)
		}
	}()

	log.Printf("k8s-ide backend listening on %s", address)
	if err := server.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
