package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/cors"

	"github.com/k8s-ide/backend/internal/api"
	internalK8s "github.com/k8s-ide/backend/internal/k8s"
	"github.com/k8s-ide/backend/internal/session"
	"github.com/k8s-ide/backend/internal/watch"
)

func main() {
	var (
		addr           = flag.String("addr", "127.0.0.1:7777", "address to listen on")
		kubeconfigPath = flag.String("kubeconfig", "", "path to kubeconfig (defaults to ~/.kube/config)")
		discoveryTTL   = flag.Duration("discovery-ttl", 5*time.Minute, "discovery cache TTL")
	)
	flag.Parse()

	sess, err := session.New(*kubeconfigPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load kubeconfig: %v\n", err)
		os.Exit(1)
	}

	// DiscoveryCache needs a typed client. We create a minimal one from the
	// first available context so discovery can be served before OpenSession.
	contexts := sess.Contexts()
	if len(contexts) > 0 {
		if err := sess.OpenContext(contexts[0]); err != nil {
			fmt.Fprintf(os.Stderr, "warning: could not open default context %q: %v\n", contexts[0], err)
		}
	}

	var disc *internalK8s.DiscoveryCache
	if sess.TypedClient() != nil {
		disc = internalK8s.NewDiscoveryCache(sess.TypedClient().Discovery(), *discoveryTTL)
	} else {
		disc = internalK8s.NewDiscoveryCache(nil, *discoveryTTL)
	}

	wm := watch.New()
	h := api.New(sess, wm, disc)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)

	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: false,
	})
	r.Use(c.Handler)

	h.RegisterRoutes(r)

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "listen %s: %v\n", *addr, err)
		os.Exit(1)
	}

	srv := &http.Server{
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0, // allow streaming responses
		IdleTimeout:  60 * time.Second,
	}

	fmt.Printf("k8s-ide backend listening on %s\n", *addr)

	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Fprintf(os.Stderr, "server error: %v\n", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	fmt.Println("server stopped")
}
