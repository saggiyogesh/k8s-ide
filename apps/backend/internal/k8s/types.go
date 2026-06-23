package k8s

type ClusterContext struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	User      string `json:"user"`
	Namespace string `json:"namespace,omitempty"`
	Current   bool   `json:"current"`
}

type SessionInfo struct {
	Context        string `json:"context"`
	KubeconfigPath string `json:"kubeconfigPath"`
	OpenedAt       string `json:"openedAt"`
}

type ApiResourceDescriptor struct {
	Group        string   `json:"group"`
	Version      string   `json:"version"`
	Kind         string   `json:"kind"`
	Resource     string   `json:"resource"`
	SingularName string   `json:"singularName"`
	ShortNames   []string `json:"shortNames"`
	Categories   []string `json:"categories"`
	Namespaced   bool     `json:"namespaced"`
	Verbs        []string `json:"verbs"`
}

type ResourceRef struct {
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
}

type ListResourcesRequest struct {
	Group         string
	Version       string
	Resource      string
	Namespace     string
	LabelSelector string
	FieldSelector string
	Limit         int64
	Continue      string
}

type GetResourceRequest struct {
	Group     string
	Version   string
	Resource  string
	Namespace string
	Name      string
}

type DeleteResourceRequest struct {
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
}

type ApplyRequest struct {
	YAML         string `json:"yaml"`
	FieldManager string `json:"fieldManager"`
	Force        bool   `json:"force"`
}

type ApplyResult struct {
	Resources []ResourceRef `json:"resources"`
}

type ResourceListResult struct {
	Items           []map[string]any `json:"items"`
	Continue        string           `json:"continue,omitempty"`
	ResourceVersion string           `json:"resourceVersion,omitempty"`
}

type ScaleActionRequest struct {
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
	Replicas  int32  `json:"replicas"`
}

type RestartActionRequest struct {
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
}

type ActionResult struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}
