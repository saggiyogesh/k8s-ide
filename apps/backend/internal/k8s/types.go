package k8s

type ClusterContext struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster,omitempty"`
	User      string `json:"user,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	IsCurrent bool   `json:"isCurrent"`
}

type SessionInfo struct {
	Context        string `json:"context"`
	Namespace      string `json:"namespace"`
	ConnectedAt    string `json:"connectedAt"`
	BackendVersion string `json:"backendVersion"`
}

type ApiResourceDescriptor struct {
	Group            string   `json:"group"`
	Version          string   `json:"version"`
	Kind             string   `json:"kind"`
	Resource         string   `json:"resource"`
	SingularResource string   `json:"singularResource"`
	Namespaced       bool     `json:"namespaced"`
	Verbs            []string `json:"verbs"`
	ShortNames       []string `json:"shortNames"`
	Categories       []string `json:"categories"`
	Scope            string   `json:"scope"`
}

type ResourceRef struct {
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
}

type KubeResource struct {
	Ref        ResourceRef      `json:"ref"`
	Kind       string           `json:"kind"`
	APIVersion string           `json:"apiVersion"`
	Metadata   ResourceMetadata `json:"metadata"`
	Spec       map[string]any   `json:"spec"`
	Status     map[string]any   `json:"status"`
	Summary    map[string]any   `json:"summary"`
	YAML       string           `json:"yaml"`
	Phase      string           `json:"phase"`
}

type ResourceMetadata struct {
	UID               string            `json:"uid"`
	CreationTimestamp string            `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels,omitempty"`
	Annotations       map[string]string `json:"annotations,omitempty"`
}

type ResourceListResult struct {
	Items           []KubeResource `json:"items"`
	Total           int            `json:"total"`
	Continue        string         `json:"continue,omitempty"`
	ResourceVersion string         `json:"resourceVersion,omitempty"`
}

type ListResourcesOptions struct {
	Group         string
	Version       string
	Resource      string
	Namespace     string
	Search        string
	LabelSelector string
}

type ApplyResult struct {
	Applied  []ResourceRef `json:"applied"`
	Warnings []string      `json:"warnings"`
}

type ResourceActionRequest struct {
	Action string         `json:"action"`
	Ref    ResourceRef    `json:"ref"`
	Args   map[string]any `json:"args,omitempty"`
}

type ActionResult struct {
	Action  string         `json:"action"`
	Success bool           `json:"success"`
	Message string         `json:"message"`
	Data    map[string]any `json:"data,omitempty"`
}

type WatchEvent struct {
	Type            string        `json:"type"`
	Ref             ResourceRef   `json:"ref"`
	Resource        *KubeResource `json:"resource,omitempty"`
	ResourceVersion string        `json:"resourceVersion,omitempty"`
	Message         string        `json:"message,omitempty"`
}

type ExecSession struct {
	SessionID string `json:"sessionId"`
	StreamURL string `json:"streamUrl"`
}

type PortForwardSession struct {
	SessionID string `json:"sessionId"`
	Address   string `json:"address"`
	LocalPort int    `json:"localPort"`
}
