package api

import (
	"bufio"
	"context"
	"io"

	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
)

func streamLogs(
	ctx context.Context,
	conn *websocket.Conn,
	cs kubernetes.Interface,
	namespace, pod, container string,
	follow bool,
	tailLines *int64,
) {
	opts := &corev1.PodLogOptions{
		Container: container,
		Follow:    follow,
		TailLines: tailLines,
	}

	req := cs.CoreV1().Pods(namespace).GetLogs(pod, opts)
	stream, err := req.Stream(ctx)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("ERROR: "+err.Error()))
		return
	}
	defer stream.Close()

	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 64*1024), 64*1024)

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return
		default:
		}
		line := scanner.Text()
		if err := conn.WriteMessage(websocket.TextMessage, []byte(line)); err != nil {
			return
		}
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("ERROR: "+err.Error()))
	}
}
