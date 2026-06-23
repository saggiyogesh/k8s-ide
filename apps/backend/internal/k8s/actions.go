package k8s

import (
	"context"
	"fmt"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
)

type ActionResult struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

type ScaleRequest struct {
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Replicas  int32  `json:"replicas"`
}

type RestartRequest struct {
	Group     string `json:"group"`
	Version   string `json:"version"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}

type Actions struct {
	clientset kubernetes.Interface
}

func NewActions(clientset kubernetes.Interface) *Actions {
	return &Actions{clientset: clientset}
}

func (a *Actions) Scale(ctx context.Context, req ScaleRequest) (*ActionResult, error) {
	switch req.Resource {
	case "deployments":
		scale, err := a.clientset.AppsV1().Deployments(req.Namespace).GetScale(ctx, req.Name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		scale.Spec.Replicas = req.Replicas
		_, err = a.clientset.AppsV1().Deployments(req.Namespace).UpdateScale(ctx, req.Name, scale, metav1.UpdateOptions{})
		if err != nil {
			return nil, err
		}
		return &ActionResult{Success: true, Message: fmt.Sprintf("scaled to %d replicas", req.Replicas)}, nil
	case "statefulsets":
		scale, err := a.clientset.AppsV1().StatefulSets(req.Namespace).GetScale(ctx, req.Name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		scale.Spec.Replicas = req.Replicas
		_, err = a.clientset.AppsV1().StatefulSets(req.Namespace).UpdateScale(ctx, req.Name, scale, metav1.UpdateOptions{})
		if err != nil {
			return nil, err
		}
		return &ActionResult{Success: true, Message: fmt.Sprintf("scaled to %d replicas", req.Replicas)}, nil
	default:
		return nil, fmt.Errorf("scale not supported for resource %s", req.Resource)
	}
}

func (a *Actions) Restart(ctx context.Context, req RestartRequest) (*ActionResult, error) {
	patch := []byte(`{"spec":{"template":{"metadata":{"annotations":{"k8s-ide/restartedAt":"` + time.Now().UTC().Format(time.RFC3339Nano) + `"}}}}}`)

	switch req.Resource {
	case "deployments":
		_, err := a.clientset.AppsV1().Deployments(req.Namespace).Patch(ctx, req.Name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
		if err != nil {
			return nil, err
		}
	case "statefulsets":
		_, err := a.clientset.AppsV1().StatefulSets(req.Namespace).Patch(ctx, req.Name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
		if err != nil {
			return nil, err
		}
	case "daemonsets":
		_, err := a.clientset.AppsV1().DaemonSets(req.Namespace).Patch(ctx, req.Name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
		if err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("restart not supported for resource %s", req.Resource)
	}

	return &ActionResult{Success: true, Message: "rollout restart triggered"}, nil
}

func (a *Actions) GetDeploymentReplicas(ctx context.Context, namespace, name string) (int32, error) {
	dep, err := a.clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return 0, err
	}
	if dep.Spec.Replicas == nil {
		return 0, nil
	}
	return *dep.Spec.Replicas, nil
}
