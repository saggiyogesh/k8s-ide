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
	var (
		addr           = flag.String("addr", "127.0.0.1:7319", "listen address")
		kubeconfigPath = flag.String("kubeconfig", "", "path to kubeconfig")
	)
	flag.Parse()

	store, err := session.NewStore(*kubeconfigPath)
	if err != nil {
		log.Fatalf("create session store: %v", err)
	}

	engine := k8s.NewEngine(store)
	handler := withCORS(api.NewRouter(engine))

	log.Printf("k8s backend listening on http://%s", *addr)
	if err := http.ListenAndServe(*addr, handler); err != nil {
		log.Fatalf("serve backend: %v", err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
