package k8s

import (
	"context"
	"fmt"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/util/retry"
)

func ScaleWorkload(ctx context.Context, clientset kubernetes.Interface, namespace, kind, name string, replicas int32) error {
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		switch kind {
		case "Deployment":
			dep, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
			if err != nil {
				return err
			}
			if dep.Spec.Replicas != nil && *dep.Spec.Replicas == replicas {
				return nil
			}
			dep.Spec.Replicas = &replicas
			_, err = clientset.AppsV1().Deployments(namespace).Update(ctx, dep, metav1.UpdateOptions{})
			return err
		case "StatefulSet":
			sts, err := clientset.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
			if err != nil {
				return err
			}
			if sts.Spec.Replicas != nil && *sts.Spec.Replicas == replicas {
				return nil
			}
			sts.Spec.Replicas = &replicas
			_, err = clientset.AppsV1().StatefulSets(namespace).Update(ctx, sts, metav1.UpdateOptions{})
			return err
		case "ReplicaSet":
			rs, err := clientset.AppsV1().ReplicaSets(namespace).Get(ctx, name, metav1.GetOptions{})
			if err != nil {
				return err
			}
			if rs.Spec.Replicas != nil && *rs.Spec.Replicas == replicas {
				return nil
			}
			rs.Spec.Replicas = &replicas
			_, err = clientset.AppsV1().ReplicaSets(namespace).Update(ctx, rs, metav1.UpdateOptions{})
			return err
		default:
			return fmt.Errorf("scale not supported for kind %s", kind)
		}
	})
}

func RestartRollout(ctx context.Context, clientset kubernetes.Interface, namespace, kind, name string) error {
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		now := time.Now().UTC().Format(time.RFC3339)
		patch := []byte(fmt.Sprintf(`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`, now))

		switch kind {
		case "Deployment":
			_, err := clientset.AppsV1().Deployments(namespace).Patch(ctx, name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
			return err
		case "StatefulSet":
			_, err := clientset.AppsV1().StatefulSets(namespace).Patch(ctx, name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
			return err
		case "DaemonSet":
			_, err := clientset.AppsV1().DaemonSets(namespace).Patch(ctx, name, types.StrategicMergePatchType, patch, metav1.PatchOptions{})
			return err
		default:
			return fmt.Errorf("restart not supported for kind %s", kind)
		}
	})
}
