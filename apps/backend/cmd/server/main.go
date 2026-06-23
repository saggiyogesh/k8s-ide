package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/k8s-ide/backend/internal/api"
	"github.com/k8s-ide/backend/internal/session"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:9470", "listen address")
	kubeconfig := flag.String("kubeconfig", "", "path to kubeconfig (default: ~/.kube/config)")
	flag.Parse()

	sess, err := session.NewManager(*kubeconfig)
	if err != nil {
		log.Fatalf("session manager: %v", err)
	}

	router := api.NewRouter(sess)
	srv := &http.Server{
		Addr:         *addr,
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("k8s-ide backend listening on http://%s", *addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
