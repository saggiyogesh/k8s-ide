package k8s

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/k8s-ide/backend/internal/session"
	watchmanager "github.com/k8s-ide/backend/internal/watch"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	yamlutil "k8s.io/apimachinery/pkg/util/yaml"
	k8swatch "k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/discovery"
	cachedmemory "k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/restmapper"
)

type SessionInfo struct {
	Context        string              `json:"context"`
	KubeconfigPath string              `json:"kubeconfigPath"`
	ConnectedAt    time.Time           `json:"connectedAt"`
	Capabilities   SessionCapabilities `json:"capabilities"`
}

type SessionCapabilities struct {
	Discovery   bool `json:"discovery"`
	DynamicCRUD bool `json:"dynamicCrud"`
	Watch       bool `json:"watch"`
	Logs        bool `json:"logs"`
	Exec        bool `json:"exec"`
	PortForward bool `json:"portForward"`
}

type APIResourceDescriptor struct {
	Group            string   `json:"group"`
	Version          string   `json:"version"`
	Kind             string   `json:"kind"`
	Resource         string   `json:"resource"`
	SingularResource string   `json:"singularResource,omitempty"`
	ShortNames       []string `json:"shortNames"`
	Namespaced       bool     `json:"namespaced"`
	Verbs            []string `json:"verbs"`
	Categories       []string `json:"categories"`
}

type ResourceRef struct {
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Name      string `json:"name,omitempty"`
	Namespace string `json:"namespace,omitempty"`
}

type ListRequest struct {
	Group         string
	Version       string
	Resource      string
	Namespace     string
	LabelSelector string
	FieldSelector string
	Limit         int64
	Continue      string
}

type ResourceListResult struct {
	Items           []map[string]any `json:"items"`
	ContinueToken   string           `json:"continueToken,omitempty"`
	ResourceVersion string           `json:"resourceVersion,omitempty"`
}

type ApplyResult struct {
	Applied []ApplyOperation `json:"applied"`
}

type ApplyOperation struct {
	Ref       ResourceRef `json:"ref"`
	Operation string      `json:"operation"`
}

type ActionRequest struct {
	Action  string         `json:"action"`
	Ref     ResourceRef    `json:"ref"`
	Payload map[string]any `json:"payload,omitempty"`
}

type ActionResult struct {
	Status  string         `json:"status"`
	Message string         `json:"message"`
	Data    map[string]any `json:"data,omitempty"`
}

type LogRequest struct {
	Namespace string
	Pod       string
	Container string
	Follow    bool
	Previous  bool
	TailLines *int64
}

type ExecRequest struct {
	Namespace string   `json:"namespace"`
	Pod       string   `json:"pod"`
	Container string   `json:"container,omitempty"`
	Command   []string `json:"command"`
	TTY       bool     `json:"tty"`
}

type ExecSession struct {
	SessionID string `json:"sessionId"`
	StreamURL string `json:"streamUrl"`
}

type PortForwardRequest struct {
	Namespace string `json:"namespace"`
	Resource  string `json:"resource"`
	Name      string `json:"name"`
	Ports     []int  `json:"ports"`
}

type PortForwardSession struct {
	SessionID  string    `json:"sessionId"`
	LocalPorts []int     `json:"localPorts"`
	StartedAt  time.Time `json:"startedAt"`
}

type serviceClients struct {
	dynamic         dynamic.Interface
	kubernetes      kubernetes.Interface
	discovery       discovery.DiscoveryInterface
	cachedDiscovery discovery.CachedDiscoveryInterface
	mapper          *restmapper.DeferredDiscoveryRESTMapper
}

type Service struct {
	sessions *session.Manager

	mu             sync.RWMutex
	clients        *serviceClients
	discoveryCache []APIResourceDescriptor
	watches        *watchmanager.Manager
}

func NewService(sessionManager *session.Manager) *Service {
	service := &Service{
		sessions: sessionManager,
	}
	service.watches = watchmanager.NewManager(service.watchFactory)
	return service
}

func (s *Service) ListContexts(kubeconfigPath string) ([]session.ContextInfo, string, error) {
	return s.sessions.ListContexts(kubeconfigPath)
}

func (s *Service) OpenSession(contextName, kubeconfigPath string) (*SessionInfo, error) {
	activeSession, err := s.sessions.Open(contextName, kubeconfigPath)
	if err != nil {
		return nil, err
	}

	discoveryClient, err := discovery.NewDiscoveryClientForConfig(activeSession.RestConfig)
	if err != nil {
		return nil, err
	}

	dynamicClient, err := dynamic.NewForConfig(activeSession.RestConfig)
	if err != nil {
		return nil, err
	}

	kubernetesClient, err := kubernetes.NewForConfig(activeSession.RestConfig)
	if err != nil {
		return nil, err
	}

	cachedDiscovery := cachedmemory.NewMemCacheClient(discoveryClient)
	mapper := restmapper.NewDeferredDiscoveryRESTMapper(cachedDiscovery)

	s.mu.Lock()
	s.clients = &serviceClients{
		dynamic:         dynamicClient,
		kubernetes:      kubernetesClient,
		discovery:       discoveryClient,
		cachedDiscovery: cachedDiscovery,
		mapper:          mapper,
	}
	s.discoveryCache = nil
	s.mu.Unlock()

	return &SessionInfo{
		Context:        activeSession.Context,
		KubeconfigPath: activeSession.KubeconfigPath,
		ConnectedAt:    activeSession.ConnectedAt,
		Capabilities: SessionCapabilities{
			Discovery:   true,
			DynamicCRUD: true,
			Watch:       true,
			Logs:        true,
			Exec:        false,
			PortForward: false,
		},
	}, nil
}

func (s *Service) GetDiscovery() ([]APIResourceDescriptor, error) {
	s.mu.RLock()
	if len(s.discoveryCache) > 0 {
		cached := append([]APIResourceDescriptor(nil), s.discoveryCache...)
		s.mu.RUnlock()
		return cached, nil
	}
	clients := s.clients
	s.mu.RUnlock()

	if clients == nil {
		return nil, errors.New("no active session")
	}

	resourceLists, err := clients.discovery.ServerPreferredResources()
	if err != nil && !discovery.IsGroupDiscoveryFailedError(err) {
		return nil, err
	}

	descriptors := make([]APIResourceDescriptor, 0, len(resourceLists))
	for _, resourceList := range resourceLists {
		if resourceList == nil {
			continue
		}

		groupVersion, parseErr := schema.ParseGroupVersion(resourceList.GroupVersion)
		if parseErr != nil {
			continue
		}

		for _, resource := range resourceList.APIResources {
			if strings.ContainsRune(resource.Name, '/') {
				continue
			}

			descriptors = append(descriptors, APIResourceDescriptor{
				Group:            groupVersion.Group,
				Version:          groupVersion.Version,
				Kind:             resource.Kind,
				Resource:         resource.Name,
				SingularResource: resource.SingularName,
				ShortNames:       append([]string(nil), resource.ShortNames...),
				Namespaced:       resource.Namespaced,
				Verbs:            append([]string(nil), resource.Verbs...),
				Categories:       append([]string(nil), resource.Categories...),
			})
		}
	}

	sort.Slice(descriptors, func(i, j int) bool {
		if descriptors[i].Group == descriptors[j].Group {
			return descriptors[i].Resource < descriptors[j].Resource
		}
		return descriptors[i].Group < descriptors[j].Group
	})

	s.mu.Lock()
	s.discoveryCache = append([]APIResourceDescriptor(nil), descriptors...)
	s.mu.Unlock()

	return descriptors, nil
}

func (s *Service) ListResources(ctx context.Context, request ListRequest) (*ResourceListResult, error) {
	client, err := s.resourceInterface(request.Group, request.Version, request.Resource, request.Namespace)
	if err != nil {
		return nil, err
	}

	list, err := client.List(ctx, metav1.ListOptions{
		LabelSelector: request.LabelSelector,
		FieldSelector: request.FieldSelector,
		Limit:         request.Limit,
		Continue:      request.Continue,
	})
	if err != nil {
		return nil, err
	}

	items := make([]map[string]any, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, item.Object)
	}

	return &ResourceListResult{
		Items:           items,
		ContinueToken:   list.GetContinue(),
		ResourceVersion: list.GetResourceVersion(),
	}, nil
}

func (s *Service) GetResource(ctx context.Context, ref ResourceRef) (map[string]any, error) {
	if ref.Name == "" {
		return nil, errors.New("resource name is required")
	}

	client, err := s.resourceInterface(ref.Group, ref.Version, ref.Resource, ref.Namespace)
	if err != nil {
		return nil, err
	}

	resource, err := client.Get(ctx, ref.Name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	return resource.Object, nil
}

func (s *Service) DeleteResource(ctx context.Context, ref ResourceRef) error {
	if ref.Name == "" {
		return errors.New("resource name is required")
	}

	client, err := s.resourceInterface(ref.Group, ref.Version, ref.Resource, ref.Namespace)
	if err != nil {
		return err
	}

	return client.Delete(ctx, ref.Name, metav1.DeleteOptions{})
}

func (s *Service) ApplyYAML(ctx context.Context, yamlDocument string) (*ApplyResult, error) {
	clients, err := s.snapshotClients()
	if err != nil {
		return nil, err
	}

	decoder := yamlutil.NewYAMLOrJSONDecoder(strings.NewReader(yamlDocument), 4096)
	result := &ApplyResult{Applied: []ApplyOperation{}}

	for {
		payload := map[string]any{}
		if err := decoder.Decode(&payload); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return nil, err
		}

		if len(payload) == 0 {
			continue
		}

		resource := &unstructured.Unstructured{Object: payload}
		gvk := resource.GroupVersionKind()
		if gvk.Empty() {
			return nil, errors.New("every YAML document must include apiVersion and kind")
		}

		mapping, err := clients.mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
		if err != nil {
			return nil, err
		}

		name := resource.GetName()
		if name == "" {
			return nil, errors.New("every YAML document must include metadata.name")
		}

		namespace := resource.GetNamespace()
		if mapping.Scope.Name() == "namespace" && namespace == "" {
			namespace = "default"
			resource.SetNamespace(namespace)
		}

		namespaceable := clients.dynamic.Resource(mapping.Resource)
		var client dynamic.ResourceInterface = namespaceable
		if namespace != "" {
			client = namespaceable.Namespace(namespace)
		}

		operation := "configured"
		if _, err := client.Get(ctx, name, metav1.GetOptions{}); err != nil {
			if apierrors.IsNotFound(err) {
				operation = "created"
			} else {
				return nil, err
			}
		}

		data, err := json.Marshal(resource.Object)
		if err != nil {
			return nil, err
		}

		force := true
		if _, err := client.Patch(ctx, name, types.ApplyPatchType, data, metav1.PatchOptions{
			FieldManager: "k8s-ide",
			Force:        &force,
		}); err != nil {
			return nil, err
		}

		result.Applied = append(result.Applied, ApplyOperation{
			Ref: ResourceRef{
				Group:     mapping.Resource.Group,
				Version:   mapping.Resource.Version,
				Resource:  mapping.Resource.Resource,
				Name:      name,
				Namespace: namespace,
			},
			Operation: operation,
		})
	}

	return result, nil
}

func (s *Service) InvokeAction(ctx context.Context, request ActionRequest) (*ActionResult, error) {
	switch request.Action {
	case "delete":
		if err := s.DeleteResource(ctx, request.Ref); err != nil {
			return nil, err
		}
		return &ActionResult{Status: "ok", Message: "resource deleted"}, nil
	case "scale":
		replicas, err := parseReplicas(request.Payload)
		if err != nil {
			return nil, err
		}
		payload := map[string]any{
			"spec": map[string]any{
				"replicas": replicas,
			},
		}
		if err := s.mergePatch(ctx, request.Ref, payload); err != nil {
			return nil, err
		}
		return &ActionResult{
			Status:  "ok",
			Message: "scale action applied",
			Data:    map[string]any{"replicas": replicas},
		}, nil
	case "restart":
		payload := map[string]any{
			"spec": map[string]any{
				"template": map[string]any{
					"metadata": map[string]any{
						"annotations": map[string]any{
							"kubectl.kubernetes.io/restartedAt": time.Now().UTC().Format(time.RFC3339),
						},
					},
				},
			},
		}
		if err := s.mergePatch(ctx, request.Ref, payload); err != nil {
			return nil, err
		}
		return &ActionResult{Status: "ok", Message: "restart annotation applied"}, nil
	case "logs":
		return &ActionResult{Status: "ok", Message: "connect to the websocket logs endpoint to stream logs"}, nil
	case "exec":
		return &ActionResult{Status: "error", Message: "exec websocket upgrade is not implemented yet"}, nil
	case "port-forward":
		return &ActionResult{Status: "error", Message: "port forwarding is not implemented yet"}, nil
	default:
		return nil, fmt.Errorf("unsupported action: %s", request.Action)
	}
}

func (s *Service) StreamLogs(ctx context.Context, request LogRequest) (io.ReadCloser, error) {
	clients, err := s.snapshotClients()
	if err != nil {
		return nil, err
	}

	options := &corev1.PodLogOptions{
		Container: request.Container,
		Follow:    request.Follow,
		Previous:  request.Previous,
	}
	if request.TailLines != nil {
		options.TailLines = request.TailLines
	}

	return clients.kubernetes.CoreV1().Pods(request.Namespace).GetLogs(request.Pod, options).Stream(ctx)
}

func (s *Service) CreateExecSession(request ExecRequest) *ExecSession {
	return &ExecSession{
		SessionID: uuid.NewString(),
		StreamURL: fmt.Sprintf(
			"/ws/exec/%s/%s/%s",
			request.Namespace,
			request.Pod,
			request.Container,
		),
	}
}

func (s *Service) StartPortForward(request PortForwardRequest) *PortForwardSession {
	return &PortForwardSession{
		SessionID:  uuid.NewString(),
		LocalPorts: append([]int(nil), request.Ports...),
		StartedAt:  time.Now().UTC(),
	}
}

func (s *Service) Watches() *watchmanager.Manager {
	return s.watches
}

func (s *Service) watchFactory(ctx context.Context, opts watchmanager.SubscriptionOptions) (k8swatch.Interface, error) {
	client, err := s.resourceInterface(opts.GVR.Group, opts.GVR.Version, opts.GVR.Resource, opts.Namespace)
	if err != nil {
		return nil, err
	}

	return client.Watch(ctx, metav1.ListOptions{
		LabelSelector: opts.LabelSelector,
		FieldSelector: opts.FieldSelector,
	})
}

func (s *Service) mergePatch(ctx context.Context, ref ResourceRef, payload map[string]any) error {
	if ref.Name == "" {
		return errors.New("resource name is required")
	}

	client, err := s.resourceInterface(ref.Group, ref.Version, ref.Resource, ref.Namespace)
	if err != nil {
		return err
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	_, err = client.Patch(ctx, ref.Name, types.MergePatchType, data, metav1.PatchOptions{})
	return err
}

func (s *Service) resourceInterface(group, version, resource, namespace string) (dynamic.ResourceInterface, error) {
	clients, err := s.snapshotClients()
	if err != nil {
		return nil, err
	}

	gvr := schema.GroupVersionResource{
		Group:    group,
		Version:  version,
		Resource: resource,
	}

	client := clients.dynamic.Resource(gvr)
	if namespace != "" {
		return client.Namespace(namespace), nil
	}

	return client, nil
}

func (s *Service) snapshotClients() (*serviceClients, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.clients == nil {
		return nil, errors.New("no active session")
	}

	return s.clients, nil
}

func parseReplicas(payload map[string]any) (int64, error) {
	if payload == nil {
		return 0, errors.New("replicas payload is required")
	}

	value, exists := payload["replicas"]
	if !exists {
		return 0, errors.New("replicas payload is required")
	}

	switch typed := value.(type) {
	case int:
		return int64(typed), nil
	case int32:
		return int64(typed), nil
	case int64:
		return typed, nil
	case float64:
		return int64(typed), nil
	default:
		return 0, errors.New("replicas must be a number")
	}
}
