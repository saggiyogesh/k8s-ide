package main

import (
	"errors"
	"flag"
	"log"
	"net/http"
	"time"

	"github.com/k8s-ide/backend/internal/api"
	"github.com/k8s-ide/backend/internal/k8s"
	"github.com/k8s-ide/backend/internal/session"
	watcher "github.com/k8s-ide/backend/internal/watch"
)

func main() {
	listenAddr := flag.String("listen", "127.0.0.1:7447", "HTTP listen address")
	kubeconfig := flag.String("kubeconfig", "", "optional kubeconfig path")
	flag.Parse()

	sessions := session.NewManager(*kubeconfig)
	engine := k8s.NewEngine(sessions)
	watchManager := watcher.NewManager(sessions)
	server := api.NewServer(engine, watchManager)

	httpServer := &http.Server{
		Addr:              *listenAddr,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("k8s-ide backend listening on http://%s", *listenAddr)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
