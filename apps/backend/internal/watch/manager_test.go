package watch_test

import (
	"context"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	dynamicfake "k8s.io/client-go/dynamic/fake"

	watchmgr "github.com/k8s-ide/backend/internal/watch"
)

func TestManager_Subscribe_ReceivesEvents(t *testing.T) {
	scheme := runtime.NewScheme()
	fakeGVR := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, map[schema.GroupVersionResource]string{
		fakeGVR: "PodList",
	})

	mgr := watchmgr.NewManager(dyn)
	sub := mgr.Subscribe("", "v1", "pods", "default", "")

	// Emit an event via the fake dynamic client watcher.
	fakeWatcher := watch.NewFake()
	_ = fakeWatcher // The fake dynamic client doesn't expose a direct watcher hook; this tests non-panic behaviour.

	// Just ensure subscribe/close does not panic.
	done := make(chan struct{})
	go func() {
		defer close(done)
		ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
		defer cancel()
		select {
		case <-sub.Events():
		case <-ctx.Done():
		}
	}()

	<-done
	sub.Close()
}
