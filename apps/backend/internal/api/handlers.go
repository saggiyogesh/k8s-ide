package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/cursor/k8s-ide/apps/backend/internal/k8s"
)

func (s *Server) handleListContexts(w http.ResponseWriter, r *http.Request) {
	contexts, err := s.engine.ListContexts()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, contexts)
}

func (s *Server) handleOpenSession(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Context   string `json:"context"`
		Namespace string `json:"namespace"`
	}

	if err := readJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	session, err := s.engine.OpenSession(request.Context, request.Namespace)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, session)
}

func (s *Server) handleDiscovery(w http.ResponseWriter, _ *http.Request) {
	discovery, err := s.engine.GetDiscovery()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, discovery)
}

func (s *Server) handleListResources(w http.ResponseWriter, r *http.Request) {
	result, err := s.engine.ListResources(r.Context(), k8s.ListResourcesOptions{
		Group:         r.PathValue("group"),
		Version:       r.PathValue("version"),
		Resource:      r.PathValue("resource"),
		Namespace:     r.URL.Query().Get("namespace"),
		Search:        r.URL.Query().Get("search"),
		LabelSelector: r.URL.Query().Get("labelSelector"),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleGetClusterResource(w http.ResponseWriter, r *http.Request) {
	resource, err := s.engine.GetResource(r.Context(), k8s.ResourceRef{
		Group:    r.PathValue("group"),
		Version:  r.PathValue("version"),
		Resource: r.PathValue("resource"),
		Name:     r.PathValue("name"),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, resource)
}

func (s *Server) handleGetNamespacedResource(w http.ResponseWriter, r *http.Request) {
	resource, err := s.engine.GetResource(r.Context(), k8s.ResourceRef{
		Group:     r.PathValue("group"),
		Version:   r.PathValue("version"),
		Resource:  r.PathValue("resource"),
		Name:      r.PathValue("name"),
		Namespace: r.PathValue("namespace"),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, resource)
}

func (s *Server) handleDeleteClusterResource(w http.ResponseWriter, r *http.Request) {
	err := s.engine.DeleteResource(r.Context(), k8s.ResourceRef{
		Group:    r.PathValue("group"),
		Version:  r.PathValue("version"),
		Resource: r.PathValue("resource"),
		Name:     r.PathValue("name"),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleDeleteNamespacedResource(w http.ResponseWriter, r *http.Request) {
	err := s.engine.DeleteResource(r.Context(), k8s.ResourceRef{
		Group:     r.PathValue("group"),
		Version:   r.PathValue("version"),
		Resource:  r.PathValue("resource"),
		Name:      r.PathValue("name"),
		Namespace: r.PathValue("namespace"),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleApplyYAML(w http.ResponseWriter, r *http.Request) {
	var request struct {
		YAML string `json:"yaml"`
	}

	if err := readJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := s.engine.ApplyYAML(r.Context(), request.YAML)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleInvokeAction(w http.ResponseWriter, r *http.Request) {
	var request k8s.ResourceActionRequest
	if err := readJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	request.Action = r.PathValue("action")
	result, err := s.engine.InvokeAction(r.Context(), request)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleExecSession(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Namespace string   `json:"namespace"`
		Pod       string   `json:"pod"`
		Container string   `json:"container"`
		Command   []string `json:"command"`
	}

	if err := readJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	session := s.engine.OpenExecSession(r.Context(), request.Namespace, request.Pod, request.Container)
	writeJSON(w, http.StatusOK, session)
}

func (s *Server) handlePortForwardSession(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Namespace  string `json:"namespace"`
		Resource   string `json:"resource"`
		Name       string `json:"name"`
		RemotePort int    `json:"remotePort"`
	}

	if err := readJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	session := s.engine.OpenPortForwardSession(
		r.Context(),
		request.Namespace,
		request.Resource,
		request.Name,
		request.RemotePort,
	)
	writeJSON(w, http.StatusOK, session)
}

func (s *Server) handleWatch(w http.ResponseWriter, r *http.Request) {
	connection, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer connection.Close()

	group := r.URL.Query().Get("group")
	version := r.URL.Query().Get("version")
	resource := r.URL.Query().Get("resource")
	namespace := r.URL.Query().Get("namespace")

	events := s.engine.SubscribeWatch(r.Context(), group, version, resource, namespace)
	initial := k8s.WatchEvent{
		Type:            "BOOKMARK",
		Ref:             k8s.ResourceRef{Group: group, Version: version, Resource: resource, Namespace: namespace},
		ResourceVersion: strconv.FormatInt(time.Now().Unix(), 10),
		Message:         "watch connected",
	}
	if err := connection.WriteJSON(initial); err != nil {
		return
	}

	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			if err := connection.WriteJSON(event); err != nil {
				return
			}
		case tick := <-ticker.C:
			if err := connection.WriteJSON(k8s.WatchEvent{
				Type: "BOOKMARK",
				Ref:  k8s.ResourceRef{Group: group, Version: version, Resource: resource, Namespace: namespace},
				Message: "watch heartbeat",
				ResourceVersion: strconv.FormatInt(tick.Unix(), 10),
			}); err != nil {
				return
			}
		}
	}
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	connection, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer connection.Close()

	namespace := r.PathValue("namespace")
	pod := r.PathValue("pod")
	container := r.URL.Query().Get("container")

	lines := []string{
		"connected to shared log stream",
		"backing engine is scaffolded; swap in remote pod streaming next",
	}
	for _, line := range lines {
		if err := connection.WriteMessage(1, []byte(line)); err != nil {
			return
		}
	}

	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case tick := <-ticker.C:
			message := "[" + tick.UTC().Format(time.RFC3339) + "] " + namespace + "/" + pod
			if container != "" {
				message += " [" + container + "]"
			}
			message += " still attached"
			if err := connection.WriteMessage(1, []byte(message)); err != nil {
				return
			}
		}
	}
}

func (s *Server) handleExec(w http.ResponseWriter, r *http.Request) {
	connection, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer connection.Close()

	namespace := r.PathValue("namespace")
	pod := r.PathValue("pod")

	lines := []string{
		"shared exec websocket connected",
		"pod shell scaffolding is active for " + namespace + "/" + pod,
	}
	for _, line := range lines {
		if err := connection.WriteMessage(1, []byte(line)); err != nil {
			return
		}
	}
}
