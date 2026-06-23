package main

import (
	"log"
	"net/http"
	"os"

	"k8s-ide/backend/internal/api"
	"k8s-ide/backend/internal/k8s"
	"k8s-ide/backend/internal/session"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3010"
	}

	handler := api.NewRouter(session.NewManager(), k8s.NewEngine())
	addr := ":" + port
	log.Printf("k8s backend listening on %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}
