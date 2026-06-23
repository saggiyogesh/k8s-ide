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
	addr := flag.String("addr", "127.0.0.1:9475", "listen address")
	kubeconfig := flag.String("kubeconfig", "", "path to kubeconfig")
	flag.Parse()

	sess := session.NewManager(*kubeconfig)
	srv := api.NewServer(sess)

	httpServer := &http.Server{
		Addr:              *addr,
		Handler:           srv.Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("k8s-ide backend listening on http://%s", *addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
}
