package main

import (
	"log"
	"net/http"
	"os"

	"github.com/cursor/k8s-ide/apps/backend/internal/api"
	"github.com/cursor/k8s-ide/apps/backend/internal/k8s"
	"github.com/cursor/k8s-ide/apps/backend/internal/session"
	watchpkg "github.com/cursor/k8s-ide/apps/backend/internal/watch"
)

func main() {
	address := os.Getenv("K8S_IDE_ADDR")
	if address == "" {
		address = ":8787"
	}

	sessionService := session.NewService()
	watchManager := watchpkg.NewManager()
	engine := k8s.NewEngine(sessionService, watchManager)
	server := api.NewServer(engine)

	log.Printf("k8s-ide backend listening on %s", address)
	if err := http.ListenAndServe(address, server.Router()); err != nil {
		log.Fatal(err)
	}
}
