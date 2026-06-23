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
	var (
		addr           = flag.String("addr", envOr("K8S_IDE_ADDR", "127.0.0.1:8080"), "listen address")
		kubeconfigPath = flag.String("kubeconfig", envOr("KUBECONFIG", ""), "path to kubeconfig (default: ~/.kube/config)")
	)
	flag.Parse()

	mgr, err := session.NewManager(*kubeconfigPath, func() {
		log.Println("kubeconfig changed – reload triggered")
	})
	if err != nil {
		log.Printf("warning: could not load kubeconfig: %v", err)
		// Continue anyway – the user can call /api/session/open after fixing the config.
		mgr, _ = session.NewManager("", nil) //nolint:errcheck
	}
	defer mgr.Close()

	handler := api.NewHandler(mgr)
	router := api.NewRouter(handler)

	fmt.Printf("k8s-ide backend listening on http://%s\n", *addr)
	if err := http.ListenAndServe(*addr, router); err != nil {
		log.Fatal(err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
