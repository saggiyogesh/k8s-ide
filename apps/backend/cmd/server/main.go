package main

import (
	"log"
	"net/http"
	"os"

	"github.com/example/k8s-ide/apps/backend/internal/api"
	"github.com/example/k8s-ide/apps/backend/internal/k8s"
	"github.com/example/k8s-ide/apps/backend/internal/session"
	"github.com/example/k8s-ide/apps/backend/internal/watch"
)

func main() {
	address := os.Getenv("K8S_IDE_ADDRESS")
	if address == "" {
		address = "127.0.0.1:8741"
	}

	engine := k8s.NewEngine(os.Getenv("K8S_IDE_KUBECONFIG"))
	sessions := session.NewManager()
	watches := watch.NewManager()
	server := api.NewServer(engine, sessions, watches)

	log.Printf("k8s-ide backend listening on %s", address)
	if err := http.ListenAndServe(address, server); err != nil {
		log.Fatal(err)
	}
}
