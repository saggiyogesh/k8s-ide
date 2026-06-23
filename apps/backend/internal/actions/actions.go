package actions

import (
	"context"
	"fmt"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
)

type ScaleRequest struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Replicas  int32  `json:"replicas"`
}

type RestartRequest struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`
}

type ActionResult struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

func Scale(ctx context.Context, cs kubernetes.Interface, req ScaleRequest) (*ActionResult, error) {
	switch req.Kind {
	case "Deployment":
		scale, err := cs.AppsV1().Deployments(req.Namespace).GetScale(ctx, req.Name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		scale.Spec.Replicas = req.Replicas
		_, err = cs.AppsV1().Deployments(req.Namespace).UpdateScale(ctx, req.Name, scale, metav1.UpdateOptions{})
		if err != nil {
			return nil, err
		}
	case "StatefulSet":
		scale, err := cs.AppsV1().StatefulSets(req.Namespace).GetScale(ctx, req.Name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		scale.Spec.Replicas = req.Replicas
		_, err = cs.AppsV1().StatefulSets(req.Namespace).UpdateScale(ctx, req.Name, scale, metav1.UpdateOptions{})
		if err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("scale not supported for kind %s", req.Kind)
	}
	return &ActionResult{Success: true, Message: fmt.Sprintf("scaled to %d replicas", req.Replicas)}, nil
}

func Restart(ctx context.Context, cs kubernetes.Interface, req RestartRequest) (*ActionResult, error) {
	ts := time.Now().UTC().Format(time.RFC3339)
	patch := []byte(`{"spec":{"template":{"metadata":{"annotations":{"k8s-ide/restartedAt":"` + ts + `"}}}}}`)
	var err error
	switch req.Kind {
	case "Deployment":
		_, err = cs.AppsV1().Deployments(req.Namespace).Patch(ctx, req.Name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
	case "StatefulSet":
		_, err = cs.AppsV1().StatefulSets(req.Namespace).Patch(ctx, req.Name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
	case "DaemonSet":
		_, err = cs.AppsV1().DaemonSets(req.Namespace).Patch(ctx, req.Name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
	default:
		return nil, fmt.Errorf("restart not supported for kind %s", req.Kind)
	}
	if err != nil {
		return nil, err
	}
	return &ActionResult{Success: true, Message: "rollout restart triggered"}, nil
}
