package main

import (
	"flag"
	"log"
	"net/http"

	"github.com/k8s-ide/backend/internal/api"
	"github.com/k8s-ide/backend/internal/k8s"
	"github.com/k8s-ide/backend/internal/session"
)

func main() {
	listenAddress := flag.String("listen", "127.0.0.1:43210", "HTTP listen address")
	flag.Parse()

	service := k8s.NewService(session.NewManager())
	router := api.NewRouter(service)

	log.Printf("k8s-ide backend listening on http://%s", *listenAddress)
	if err := http.ListenAndServe(*listenAddress, router); err != nil {
		log.Fatal(err)
	}
}
