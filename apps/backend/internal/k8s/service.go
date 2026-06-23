package k8s

import (
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

type Service struct {
	Clientset kubernetes.Interface
	Dynamic   dynamic.Interface
	Discovery discovery.DiscoveryInterface
}

func NewService(cs kubernetes.Interface, dyn dynamic.Interface, disc discovery.DiscoveryInterface) *Service {
	return &Service{
		Clientset: cs,
		Dynamic:   dyn,
		Discovery: disc,
	}
}
