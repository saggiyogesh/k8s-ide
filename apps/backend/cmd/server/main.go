package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/k8s-ide/backend/internal/api"
	"github.com/k8s-ide/backend/internal/session"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:9475", "listen address")
	kubeconfig := flag.String("kubeconfig", "", "path to kubeconfig file")
	flag.Parse()

	if env := os.Getenv("KUBECONFIG"); *kubeconfig == "" && env != "" {
		*kubeconfig = env
	}

	sessions, err := session.NewManager(*kubeconfig)
	if err != nil {
		log.Printf("warning: kubeconfig load: %v", err)
		sessions, _ = session.NewManager(*kubeconfig)
	}

	router := api.NewRouter(sessions)
	log.Printf("k8s-ide backend listening on http://%s", *addr)
	if err := http.ListenAndServe(*addr, router); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}
