package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/discovery"
	"sigs.k8s.io/yaml"
)

type ApiResourceDescriptor struct {
	Group      string   `json:"group"`
	Version    string   `json:"version"`
	Resource   string   `json:"resource"`
	Kind       string   `json:"kind"`
	Namespaced bool     `json:"namespaced"`
	Verbs      []string `json:"verbs"`
	ShortNames []string `json:"shortNames,omitempty"`
	Categories []string `json:"categories,omitempty"`
}

type ResourceRef struct {
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Kind      string `json:"kind"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
	UID       string `json:"uid,omitempty"`
}

type ResourceListItem struct {
	Ref       ResourceRef       `json:"ref"`
	CreatedAt string            `json:"createdAt,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
	Status    string            `json:"status,omitempty"`
	Extra     map[string]string `json:"extra,omitempty"`
}

type ResourceListResult struct {
	Items            []ResourceListItem `json:"items"`
	Continue         string             `json:"continue,omitempty"`
	ResourceVersion  string             `json:"resourceVersion,omitempty"`
}

type ApplyResult struct {
	Action   string      `json:"action"`
	Resource ResourceRef `json:"resource"`
}

func Discover(ctx context.Context, disc discovery.DiscoveryInterface) ([]ApiResourceDescriptor, error) {
	groups, err := disc.ServerGroups()
	if err != nil {
		return nil, err
	}

	var out []ApiResourceDescriptor
	for _, g := range groups.Groups {
		group := g.Name
		gv, err := disc.ServerResourcesForGroupVersion(g.PreferredVersion.GroupVersion)
		if err != nil {
			continue
		}
		for _, r := range gv.APIResources {
			if strings.Contains(r.Name, "/") {
				continue
			}
			out = append(out, ApiResourceDescriptor{
				Group:      group,
				Version:    g.PreferredVersion.Version,
				Resource:   r.Name,
				Kind:       r.Kind,
				Namespaced: r.Namespaced,
				Verbs:      r.Verbs,
				ShortNames: r.ShortNames,
				Categories: r.Categories,
			})
		}
	}

	// Core group
	coreGV, err := disc.ServerResourcesForGroupVersion("v1")
	if err == nil {
		for _, r := range coreGV.APIResources {
			if strings.Contains(r.Name, "/") {
				continue
			}
			out = append(out, ApiResourceDescriptor{
				Group:      "",
				Version:    "v1",
				Resource:   r.Name,
				Kind:       r.Kind,
				Namespaced: r.Namespaced,
				Verbs:      r.Verbs,
				ShortNames: r.ShortNames,
				Categories: r.Categories,
			})
		}
	}

	return out, nil
}

func normalizeGroup(group string) string {
	if group == "core" {
		return ""
	}
	return group
}

func gvr(group, version, resource string) schema.GroupVersionResource {
	return schema.GroupVersionResource{
		Group:    normalizeGroup(group),
		Version:  version,
		Resource: resource,
	}
}

type ListOpts struct {
	Group         string
	Version       string
	Resource      string
	Namespace     string
	LabelSelector string
	FieldSelector string
	Limit         int64
	Continue      string
}

func ListResources(ctx context.Context, svc *Service, opts ListOpts) (*ResourceListResult, error) {
	gvr := gvr(opts.Group, opts.Version, opts.Resource)
	listOpts := metav1.ListOptions{
		LabelSelector: opts.LabelSelector,
		FieldSelector: opts.FieldSelector,
		Limit:         opts.Limit,
		Continue:      opts.Continue,
	}

	var list *unstructured.UnstructuredList
	var err error
	if opts.Namespace != "" {
		list, err = svc.Dynamic.Resource(gvr).Namespace(opts.Namespace).List(ctx, listOpts)
	} else {
		list, err = svc.Dynamic.Resource(gvr).List(ctx, listOpts)
	}
	if err != nil {
		return nil, err
	}

	items := make([]ResourceListItem, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, toListItem(item, opts.Group, opts.Version, opts.Resource))
	}

	return &ResourceListResult{
		Items:           items,
		Continue:        list.GetContinue(),
		ResourceVersion: list.GetResourceVersion(),
	}, nil
}

func toListItem(obj unstructured.Unstructured, group, version, resource string) ResourceListItem {
	ref := ResourceRef{
		Group:    normalizeGroup(group),
		Version:  version,
		Resource: resource,
		Kind:     obj.GetKind(),
		Name:     obj.GetName(),
		UID:      string(obj.GetUID()),
	}
	if obj.GetNamespace() != "" {
		ref.Namespace = obj.GetNamespace()
	}

	status := ""
	if phase, ok, _ := unstructured.NestedString(obj.Object, "status", "phase"); ok {
		status = phase
	} else if replicas, ok, _ := unstructured.NestedInt64(obj.Object, "status", "replicas"); ok {
		ready, _, _ := unstructured.NestedInt64(obj.Object, "status", "readyReplicas")
		status = fmt.Sprintf("%d/%d", ready, replicas)
	}

	return ResourceListItem{
		Ref:       ref,
		CreatedAt: obj.GetCreationTimestamp().Format("2006-01-02T15:04:05Z"),
		Labels:    obj.GetLabels(),
		Status:    status,
	}
}

type GetOpts struct {
	Group     string
	Version   string
	Resource  string
	Namespace string
	Name      string
}

func GetResource(ctx context.Context, svc *Service, opts GetOpts) (*unstructured.Unstructured, error) {
	gvr := gvr(opts.Group, opts.Version, opts.Resource)
	if opts.Namespace != "" {
		return svc.Dynamic.Resource(gvr).Namespace(opts.Namespace).Get(ctx, opts.Name, metav1.GetOptions{})
	}
	return svc.Dynamic.Resource(gvr).Get(ctx, opts.Name, metav1.GetOptions{})
}

func DeleteResource(ctx context.Context, svc *Service, opts GetOpts) error {
	gvr := gvr(opts.Group, opts.Version, opts.Resource)
	if opts.Namespace != "" {
		return svc.Dynamic.Resource(gvr).Namespace(opts.Namespace).Delete(ctx, opts.Name, metav1.DeleteOptions{})
	}
	return svc.Dynamic.Resource(gvr).Delete(ctx, opts.Name, metav1.DeleteOptions{})
}

func ApplyYAML(ctx context.Context, svc *Service, yamlContent string) (*ApplyResult, error) {
	var obj unstructured.Unstructured
	if err := yaml.Unmarshal([]byte(yamlContent), &obj.Object); err != nil {
		return nil, fmt.Errorf("invalid yaml: %w", err)
	}

	gv, err := schema.ParseGroupVersion(obj.GetAPIVersion())
	if err != nil {
		return nil, err
	}

	gvr, namespaced, err := resolveGVR(ctx, svc, gv.Group, gv.Version, obj.GetKind())
	if err != nil {
		return nil, err
	}

	name := obj.GetName()
	ns := obj.GetNamespace()
	action := "created"

	var existing *unstructured.Unstructured
	if namespaced && ns != "" {
		existing, err = svc.Dynamic.Resource(gvr).Namespace(ns).Get(ctx, name, metav1.GetOptions{})
	} else if !namespaced {
		existing, err = svc.Dynamic.Resource(gvr).Get(ctx, name, metav1.GetOptions{})
	}

	var result *unstructured.Unstructured
	if err == nil && existing != nil {
		obj.SetResourceVersion(existing.GetResourceVersion())
		if namespaced && ns != "" {
			result, err = svc.Dynamic.Resource(gvr).Namespace(ns).Update(ctx, &obj, metav1.UpdateOptions{})
		} else {
			result, err = svc.Dynamic.Resource(gvr).Update(ctx, &obj, metav1.UpdateOptions{})
		}
		action = "updated"
	} else {
		if namespaced && ns != "" {
			result, err = svc.Dynamic.Resource(gvr).Namespace(ns).Create(ctx, &obj, metav1.CreateOptions{})
		} else {
			result, err = svc.Dynamic.Resource(gvr).Create(ctx, &obj, metav1.CreateOptions{})
		}
	}
	if err != nil {
		return nil, err
	}

	return &ApplyResult{
		Action: action,
		Resource: ResourceRef{
			Group:     gvr.Group,
			Version:   gvr.Version,
			Resource:  gvr.Resource,
			Kind:      result.GetKind(),
			Namespace: result.GetNamespace(),
			Name:      result.GetName(),
			UID:       string(result.GetUID()),
		},
	}, nil
}

func ResourceToMap(obj *unstructured.Unstructured) map[string]interface{} {
	return obj.Object
}

func EncodeJSON(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}

func resolveGVR(ctx context.Context, svc *Service, group, version, kind string) (schema.GroupVersionResource, bool, error) {
	if group == "" && version == "v1" {
		switch kind {
		case "Pod":
			return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}, true, nil
		case "Service":
			return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}, true, nil
		case "ConfigMap":
			return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "configmaps"}, true, nil
		case "Secret":
			return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "secrets"}, true, nil
		case "Namespace":
			return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "namespaces"}, false, nil
		case "PersistentVolumeClaim":
			return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "persistentvolumeclaims"}, true, nil
		case "Deployment":
			return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}, true, nil
		}
	}

	resources, err := Discover(ctx, svc.Discovery)
	if err != nil {
		return schema.GroupVersionResource{}, false, err
	}
	for _, r := range resources {
		if r.Kind == kind && r.Group == group && r.Version == version {
			return schema.GroupVersionResource{
				Group:    normalizeGroup(group),
				Version:  version,
				Resource: r.Resource,
			}, r.Namespaced, nil
		}
	}
	return schema.GroupVersionResource{}, false, fmt.Errorf("unable to resolve GVR for %s/%s %s", group, version, kind)
}

type ScaleRequest struct {
	Ref    ResourceRef `json:"ref"`
	Params struct {
		Replicas int32 `json:"replicas"`
	} `json:"params"`
}

func ScaleResource(ctx context.Context, svc *Service, ref ResourceRef, replicas int32) error {
	switch ref.Kind {
	case "Deployment":
		_, err := svc.Clientset.AppsV1().Deployments(ref.Namespace).Patch(
			ctx, ref.Name, types.MergePatchType,
			[]byte(fmt.Sprintf(`{"spec":{"replicas":%d}}`, replicas)),
			metav1.PatchOptions{},
		)
		return err
	case "StatefulSet":
		_, err := svc.Clientset.AppsV1().StatefulSets(ref.Namespace).Patch(
			ctx, ref.Name, types.MergePatchType,
			[]byte(fmt.Sprintf(`{"spec":{"replicas":%d}}`, replicas)),
			metav1.PatchOptions{},
		)
		return err
	default:
		return fmt.Errorf("scale not supported for kind %s", ref.Kind)
	}
}

func RestartResource(ctx context.Context, svc *Service, ref ResourceRef) error {
	patch := []byte(`{"spec":{"template":{"metadata":{"annotations":{"k8s-ide/restartedAt":"` + metav1.Now().Format("2006-01-02T15:04:05Z") + `"}}}}}`)
	switch ref.Kind {
	case "Deployment":
		_, err := svc.Clientset.AppsV1().Deployments(ref.Namespace).Patch(ctx, ref.Name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
		return err
	case "StatefulSet":
		_, err := svc.Clientset.AppsV1().StatefulSets(ref.Namespace).Patch(ctx, ref.Name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
		return err
	case "DaemonSet":
		_, err := svc.Clientset.AppsV1().DaemonSets(ref.Namespace).Patch(ctx, ref.Name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
		return err
	default:
		return fmt.Errorf("restart not supported for kind %s", ref.Kind)
	}
}
