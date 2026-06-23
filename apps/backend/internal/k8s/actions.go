package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	autoscalingv1 "k8s.io/api/autoscaling/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
)

// ActionResult is returned for workload action operations.
type ActionResult struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}

// ScaleOpts controls a scale operation.
type ScaleOpts struct {
	Group     string
	Version   string
	Resource  string
	Namespace string
	Name      string
	Replicas  int32
}

// ScaleWorkload scales a Deployment, StatefulSet, or ReplicaSet.
func ScaleWorkload(ctx context.Context, typed kubernetes.Interface, opts ScaleOpts) (*ActionResult, error) {
	scale := &autoscalingv1.Scale{
		ObjectMeta: metav1.ObjectMeta{Name: opts.Name, Namespace: opts.Namespace},
		Spec:       autoscalingv1.ScaleSpec{Replicas: opts.Replicas},
	}

	var err error
	switch opts.Resource {
	case "deployments":
		_, err = typed.AppsV1().Deployments(opts.Namespace).UpdateScale(ctx, opts.Name, scale, metav1.UpdateOptions{})
	case "statefulsets":
		_, err = typed.AppsV1().StatefulSets(opts.Namespace).UpdateScale(ctx, opts.Name, scale, metav1.UpdateOptions{})
	case "replicasets":
		_, err = typed.AppsV1().ReplicaSets(opts.Namespace).UpdateScale(ctx, opts.Name, scale, metav1.UpdateOptions{})
	default:
		return nil, fmt.Errorf("scale not supported for resource type %q", opts.Resource)
	}
	if err != nil {
		return nil, fmt.Errorf("scaling %s/%s: %w", opts.Resource, opts.Name, err)
	}
	return &ActionResult{Success: true, Message: fmt.Sprintf("scaled %s/%s to %d replicas", opts.Resource, opts.Name, opts.Replicas)}, nil
}

// RestartOpts controls a rollout restart operation.
type RestartOpts struct {
	Resource  string
	Namespace string
	Name      string
}

// RestartWorkload triggers a rollout restart by patching the pod template annotation.
func RestartWorkload(ctx context.Context, typed kubernetes.Interface, opts RestartOpts) (*ActionResult, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	patch := map[string]interface{}{
		"spec": map[string]interface{}{
			"template": map[string]interface{}{
				"metadata": map[string]interface{}{
					"annotations": map[string]interface{}{
						"kubectl.kubernetes.io/restartedAt": now,
					},
				},
			},
		},
	}
	data, err := json.Marshal(patch)
	if err != nil {
		return nil, err
	}

	switch opts.Resource {
	case "deployments":
		_, err = typed.AppsV1().Deployments(opts.Namespace).Patch(ctx, opts.Name, types.MergePatchType, data, metav1.PatchOptions{})
	case "statefulsets":
		_, err = typed.AppsV1().StatefulSets(opts.Namespace).Patch(ctx, opts.Name, types.MergePatchType, data, metav1.PatchOptions{})
	case "daemonsets":
		_, err = typed.AppsV1().DaemonSets(opts.Namespace).Patch(ctx, opts.Name, types.MergePatchType, data, metav1.PatchOptions{})
	default:
		return nil, fmt.Errorf("restart not supported for resource type %q", opts.Resource)
	}
	if err != nil {
		return nil, fmt.Errorf("restarting %s/%s: %w", opts.Resource, opts.Name, err)
	}
	return &ActionResult{Success: true, Message: fmt.Sprintf("restarted %s/%s", opts.Resource, opts.Name)}, nil
}

// GetDeployment fetches a Deployment.
func GetDeployment(ctx context.Context, typed kubernetes.Interface, namespace, name string) (*appsv1.Deployment, error) {
	return typed.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
}
