package api

import corev1 "k8s.io/api/core/v1"

func podLogOpts(container string, tailLines int64, follow bool) corev1.PodLogOptions {
	opts := corev1.PodLogOptions{
		Follow:    follow,
		TailLines: &tailLines,
	}
	if container != "" {
		opts.Container = container
	}
	return opts
}
