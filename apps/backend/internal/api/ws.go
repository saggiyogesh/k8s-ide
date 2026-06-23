package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/k8s-ide/backend/internal/k8s"
	watchmgr "github.com/k8s-ide/backend/internal/watch"
)

type actionRequest struct {
	Action  string                 `json:"action"`
	Ref     resourceRef            `json:"ref"`
	Payload map[string]interface{} `json:"payload"`
}

type resourceRef struct {
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Kind      string `json:"kind"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

func (s *Server) handleScale(w http.ResponseWriter, r *http.Request) {
	var req actionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	replicasFloat, ok := req.Payload["replicas"].(float64)
	if !ok {
		writeError(w, http.StatusBadRequest, errInvalidPayload("replicas"))
		return
	}
	clientset, err := s.sessions.Clientset()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err)
		return
	}
	if err := k8s.ScaleWorkload(r.Context(), clientset, req.Ref.Namespace, req.Ref.Kind, req.Ref.Name, int32(replicasFloat)); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (s *Server) handleRestart(w http.ResponseWriter, r *http.Request) {
	var req actionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	clientset, err := s.sessions.Clientset()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err)
		return
	}
	if err := k8s.RestartRollout(r.Context(), clientset, req.Ref.Namespace, req.Ref.Kind, req.Ref.Name); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (s *Server) handlePortForward(w http.ResponseWriter, r *http.Request) {
	var req actionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	localPort, _ := req.Payload["localPort"].(float64)
	remotePort, _ := req.Payload["remotePort"].(float64)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"localPort":  int(localPort),
			"remotePort": int(remotePort),
			"message":    "port-forward session scaffolded; stream wiring deferred to phase 3",
		},
	})
}

func (s *Server) handleWatchWS(w http.ResponseWriter, r *http.Request) {
	engine, err := s.engine(r)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	group := r.URL.Query().Get("group")
	version := r.URL.Query().Get("version")
	resource := r.URL.Query().Get("resource")
	namespace := r.URL.Query().Get("namespace")
	labelSelector := r.URL.Query().Get("labelSelector")
	fieldSelector := r.URL.Query().Get("fieldSelector")
	resourceVersion := r.URL.Query().Get("resourceVersion")

	events := make(chan watchmgr.Event, 32)
	ctx := r.Context()
	go func() {
		_ = s.watches.Subscribe(ctx, engine.Dynamic(), group, version, resource, namespace, labelSelector, fieldSelector, resourceVersion, events)
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			if err := conn.WriteJSON(event); err != nil {
				return
			}
		}
	}
}

type payloadError string

func (e payloadError) Error() string { return string(e) }

func errInvalidPayload(field string) error {
	return payloadError("invalid payload field: " + field)
}
