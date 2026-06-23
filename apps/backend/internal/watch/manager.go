package watch

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/websocket"
)

type Manager struct {
	upgrader websocket.Upgrader
}

func NewManager() *Manager {
	return &Manager{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool { return true },
		},
	}
}

func (m *Manager) StreamPlaceholder(w http.ResponseWriter, r *http.Request, payload any) error {
	conn, err := m.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	return conn.WriteMessage(websocket.TextMessage, encoded)
}

func (m *Manager) StreamText(w http.ResponseWriter, r *http.Request, lines ...string) error {
	conn, err := m.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	for _, line := range lines {
		if err := conn.WriteMessage(websocket.TextMessage, []byte(line)); err != nil {
			return err
		}
	}

	return nil
}
