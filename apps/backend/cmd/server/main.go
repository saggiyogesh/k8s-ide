package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/k8s-ide/backend/internal/api"
	"github.com/k8s-ide/backend/internal/k8s"
	"github.com/k8s-ide/backend/internal/session"
	watchpkg "github.com/k8s-ide/backend/internal/watch"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:7080", "listen address")
	kubeconfigPath := flag.String("kubeconfig", "", "path to kubeconfig (defaults to $KUBECONFIG or ~/.kube/config)")
	flag.Parse()

	mgr, err := session.NewManager(*kubeconfigPath)
	if err != nil {
		log.Fatalf("failed to load kubeconfig: %v", err)
	}
	defer mgr.Close()

	// Attempt to open the current-context automatically.
	// Failures here are non-fatal; the client can call /api/session/open later.
	var disc *k8s.DiscoveryCache
	var k8sCli *k8s.Client
	var wm *watchpkg.Manager

	if s, err := openDefaultSession(mgr); err == nil {
		disc = k8s.NewDiscoveryCache(s.DiscoveryClient, 60*time.Second)
		k8sCli = k8s.NewClient(s.DynamicClient)
		wm = watchpkg.NewManager(s.DynamicClient)
	} else {
		log.Printf("warning: could not open default session: %v", err)
		// Create stubs that return errors until a session is opened.
		disc = k8s.NewDiscoveryCache(nil, 60*time.Second)
		k8sCli = k8s.NewClient(nil)
		wm = watchpkg.NewManager(nil)
	}

	// When kubeconfig is reloaded, invalidate the discovery cache.
	mgr.SetReloadCallback(func() {
		if disc != nil {
			disc.Invalidate()
		}
		log.Println("kubeconfig reloaded")
	})

	h := api.NewHandler(mgr, disc, k8sCli, wm)
	srv := &http.Server{
		Addr:         *addr,
		Handler:      h.Router(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0, // streaming endpoints need no write timeout
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		fmt.Printf("k8s-ide backend listening on %s\n", *addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Println("shutting down")
}

func openDefaultSession(mgr *session.Manager) (*session.Session, error) {
	contexts := mgr.Contexts()
	if len(contexts) == 0 {
		return nil, fmt.Errorf("no contexts in kubeconfig")
	}
	// Use the first context as default; the client can override via /api/session/open.
	return mgr.Open(nil, contexts[0].Name) //nolint:staticcheck
}
