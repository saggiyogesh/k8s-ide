package api

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/k8s-ide/backend/internal/k8s"
	watchmanager "github.com/k8s-ide/backend/internal/watch"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func (h *Handler) handleHealth(writer http.ResponseWriter, _ *http.Request) {
	writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleContexts(writer http.ResponseWriter, request *http.Request) {
	contexts, _, err := h.service.ListContexts(request.URL.Query().Get("kubeconfigPath"))
	if err != nil {
		writeError(writer, http.StatusInternalServerError, err)
		return
	}

	writeJSON(writer, http.StatusOK, contexts)
}

func (h *Handler) handleOpenSession(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		Context        string `json:"context"`
		KubeconfigPath string `json:"kubeconfigPath"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	sessionInfo, err := h.service.OpenSession(payload.Context, payload.KubeconfigPath)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writeJSON(writer, http.StatusOK, sessionInfo)
}

func (h *Handler) handleDiscovery(writer http.ResponseWriter, _ *http.Request) {
	descriptors, err := h.service.GetDiscovery()
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writeJSON(writer, http.StatusOK, descriptors)
}

func (h *Handler) handleListResources(writer http.ResponseWriter, request *http.Request) {
	limit := int64(250)
	if rawLimit := request.URL.Query().Get("limit"); rawLimit != "" {
		if parsed, err := strconv.ParseInt(rawLimit, 10, 64); err == nil {
			limit = parsed
		}
	}

	result, err := h.service.ListResources(request.Context(), k8s.ListRequest{
		Group:         decodeGroup(chi.URLParam(request, "group")),
		Version:       chi.URLParam(request, "version"),
		Resource:      chi.URLParam(request, "resource"),
		Namespace:     request.URL.Query().Get("namespace"),
		LabelSelector: request.URL.Query().Get("labelSelector"),
		FieldSelector: request.URL.Query().Get("fieldSelector"),
		Continue:      request.URL.Query().Get("continue"),
		Limit:         limit,
	})
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writeJSON(writer, http.StatusOK, result)
}

func (h *Handler) handleGetClusterResource(writer http.ResponseWriter, request *http.Request) {
	h.handleGetResource(writer, request, "")
}

func (h *Handler) handleGetNamespacedResource(writer http.ResponseWriter, request *http.Request) {
	h.handleGetResource(writer, request, chi.URLParam(request, "namespace"))
}

func (h *Handler) handleDeleteClusterResource(writer http.ResponseWriter, request *http.Request) {
	h.handleDeleteResource(writer, request, "")
}

func (h *Handler) handleDeleteNamespacedResource(writer http.ResponseWriter, request *http.Request) {
	h.handleDeleteResource(writer, request, chi.URLParam(request, "namespace"))
}

func (h *Handler) handleApply(writer http.ResponseWriter, request *http.Request) {
	var payload struct {
		YAML string `json:"yaml"`
	}
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	result, err := h.service.ApplyYAML(request.Context(), payload.YAML)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writeJSON(writer, http.StatusOK, result)
}

func (h *Handler) handleAction(writer http.ResponseWriter, request *http.Request) {
	action := chi.URLParam(request, "action")
	if action == "exec" {
		var execRequest k8s.ExecRequest
		if err := json.NewDecoder(request.Body).Decode(&execRequest); err != nil {
			writeError(writer, http.StatusBadRequest, err)
			return
		}

		writeJSON(writer, http.StatusOK, h.service.CreateExecSession(execRequest))
		return
	}

	if action == "port-forward" {
		var portForwardRequest k8s.PortForwardRequest
		if err := json.NewDecoder(request.Body).Decode(&portForwardRequest); err != nil {
			writeError(writer, http.StatusBadRequest, err)
			return
		}

		writeJSON(writer, http.StatusOK, h.service.StartPortForward(portForwardRequest))
		return
	}

	var payload k8s.ActionRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}
	payload.Action = action

	result, err := h.service.InvokeAction(request.Context(), payload)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writeJSON(writer, http.StatusOK, result)
}

func (h *Handler) handleWatch(writer http.ResponseWriter, request *http.Request) {
	connection, err := h.upgrader.Upgrade(writer, request, nil)
	if err != nil {
		return
	}
	defer connection.Close()

	subscription, unsubscribe, err := h.service.Watches().Subscribe(request.Context(), watchmanager.SubscriptionOptions{
		GVR: schema.GroupVersionResource{
			Group:    decodeGroup(request.URL.Query().Get("group")),
			Version:  request.URL.Query().Get("version"),
			Resource: request.URL.Query().Get("resource"),
		},
		Namespace:     request.URL.Query().Get("namespace"),
		LabelSelector: request.URL.Query().Get("labelSelector"),
		FieldSelector: request.URL.Query().Get("fieldSelector"),
	})
	if err != nil {
		_ = connection.WriteJSON(map[string]string{"error": err.Error()})
		return
	}
	defer unsubscribe()

	for {
		select {
		case <-request.Context().Done():
			return
		case event, ok := <-subscription:
			if !ok {
				return
			}
			if err := connection.WriteJSON(event); err != nil {
				return
			}
		}
	}
}

func (h *Handler) handleLogs(writer http.ResponseWriter, request *http.Request) {
	connection, err := h.upgrader.Upgrade(writer, request, nil)
	if err != nil {
		return
	}
	defer connection.Close()

	tailLines, err := parseTailLines(request.URL.Query().Get("tailLines"))
	if err != nil {
		_ = connection.WriteJSON(map[string]string{"error": err.Error()})
		return
	}

	stream, err := h.service.StreamLogs(request.Context(), k8s.LogRequest{
		Namespace: chi.URLParam(request, "namespace"),
		Pod:       chi.URLParam(request, "pod"),
		Container: decodeContainer(chi.URLParam(request, "container")),
		Follow:    parseBool(request.URL.Query().Get("follow"), true),
		Previous:  parseBool(request.URL.Query().Get("previous"), false),
		TailLines: tailLines,
	})
	if err != nil {
		_ = connection.WriteJSON(map[string]string{"error": err.Error()})
		return
	}
	defer stream.Close()

	scanner := bufio.NewScanner(stream)
	for scanner.Scan() {
		if err := connection.WriteJSON(scanner.Text()); err != nil {
			return
		}
	}

	if err := scanner.Err(); err != nil {
		_ = connection.WriteJSON(map[string]string{"error": err.Error()})
	}
}

func (h *Handler) handleExec(writer http.ResponseWriter, request *http.Request) {
	connection, err := h.upgrader.Upgrade(writer, request, nil)
	if err != nil {
		return
	}
	defer connection.Close()

	_ = connection.WriteJSON(map[string]string{
		"error": "interactive exec transport is not implemented in this scaffold yet",
	})
}

func (h *Handler) handleGetResource(writer http.ResponseWriter, request *http.Request, namespace string) {
	resource, err := h.service.GetResource(request.Context(), k8s.ResourceRef{
		Group:     decodeGroup(chi.URLParam(request, "group")),
		Version:   chi.URLParam(request, "version"),
		Resource:  chi.URLParam(request, "resource"),
		Name:      chi.URLParam(request, "name"),
		Namespace: namespace,
	})
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writeJSON(writer, http.StatusOK, resource)
}

func (h *Handler) handleDeleteResource(writer http.ResponseWriter, request *http.Request, namespace string) {
	err := h.service.DeleteResource(request.Context(), k8s.ResourceRef{
		Group:     decodeGroup(chi.URLParam(request, "group")),
		Version:   chi.URLParam(request, "version"),
		Resource:  chi.URLParam(request, "resource"),
		Name:      chi.URLParam(request, "name"),
		Namespace: namespace,
	})
	if err != nil {
		writeError(writer, http.StatusBadRequest, err)
		return
	}

	writer.WriteHeader(http.StatusNoContent)
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}

func writeError(writer http.ResponseWriter, status int, err error) {
	writeJSON(writer, status, map[string]string{"error": err.Error()})
}

func decodeGroup(group string) string {
	if group == "_" {
		return ""
	}
	return group
}

func decodeContainer(container string) string {
	if container == "_" {
		return ""
	}
	return container
}

func parseBool(raw string, fallback bool) bool {
	if raw == "" {
		return fallback
	}

	switch strings.ToLower(raw) {
	case "1", "true", "yes":
		return true
	case "0", "false", "no":
		return false
	default:
		return fallback
	}
}

func parseTailLines(raw string) (*int64, error) {
	if raw == "" {
		return nil, nil
	}

	parsed, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return nil, err
	}

	return &parsed, nil
}

func withTimeout(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, 30*time.Second)
}

func ignoreEOF(err error) error {
	if err == nil || errors.Is(err, context.Canceled) {
		return nil
	}

	return err
}
