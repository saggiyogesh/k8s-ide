package k8s_test

import (
	"context"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	autoscalingv1 "k8s.io/api/autoscaling/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"

	k8sinternal "github.com/k8s-ide/backend/internal/k8s"
)

func int32Ptr(i int32) *int32 { return &i }

func TestScaleWorkload(t *testing.T) {
	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-deploy",
			Namespace: "default",
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "test"}},
		},
	}
	typedClient := fake.NewClientset(deployment)

	// The fake client needs a reactor to handle scale sub-resources.
	typedClient.Fake.PrependReactor("update", "deployments", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
		return true, &autoscalingv1.Scale{Spec: autoscalingv1.ScaleSpec{Replicas: 3}}, nil
	})

	result, err := k8sinternal.ScaleWorkload(context.Background(), typedClient, k8sinternal.ScaleOpts{
		Resource:  "deployments",
		Namespace: "default",
		Name:      "my-deploy",
		Replicas:  3,
	})
	if err != nil {
		t.Fatalf("ScaleWorkload failed: %v", err)
	}
	if !result.Success {
		t.Errorf("expected success=true")
	}
}

func TestRestartWorkload(t *testing.T) {
	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-deploy",
			Namespace: "default",
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "test"}},
		},
	}
	typedClient := fake.NewClientset(deployment)

	result, err := k8sinternal.RestartWorkload(context.Background(), typedClient, k8sinternal.RestartOpts{
		Resource:  "deployments",
		Namespace: "default",
		Name:      "my-deploy",
	})
	if err != nil {
		t.Fatalf("RestartWorkload failed: %v", err)
	}
	if !result.Success {
		t.Errorf("expected success=true")
	}
}
