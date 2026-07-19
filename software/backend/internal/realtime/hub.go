package realtime

import (
	"context"
	"encoding/json"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512
)

type Event struct {
	Scope      string `json:"scope"`
	Kind       string `json:"kind"`
	Resource   string `json:"resource,omitempty"`
	AccountID  string `json:"accountId,omitempty"`
	FarmID     string `json:"farmId,omitempty"`
	OccurredAt string `json:"occurredAt"`
}

type Hub struct {
	register   chan *Client
	unregister chan *Client
	broadcast  chan Event
	clients    map[*Client]struct{}
}

type Client struct {
	hub       *Hub
	conn      *websocket.Conn
	send      chan []byte
	scope     string
	accountID string
}

func NewHub() *Hub {
	return &Hub{
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan Event, 64),
		clients:    make(map[*Client]struct{}),
	}
}

func (h *Hub) Run(ctx context.Context) {
	if h == nil {
		return
	}
	for {
		select {
		case <-ctx.Done():
			for client := range h.clients {
				close(client.send)
				_ = client.conn.Close()
				delete(h.clients, client)
			}
			return
		case client := <-h.register:
			h.clients[client] = struct{}{}
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
		case event := <-h.broadcast:
			if event.OccurredAt == "" {
				event.OccurredAt = time.Now().UTC().Format(time.RFC3339Nano)
			}
			payload, err := json.Marshal(event)
			if err != nil {
				continue
			}
			for client := range h.clients {
				if !client.matches(event) {
					continue
				}
				select {
				case client.send <- payload:
				default:
					delete(h.clients, client)
					close(client.send)
				}
			}
		}
	}
}

func (h *Hub) Broadcast(event Event) {
	if h == nil {
		return
	}
	select {
	case h.broadcast <- event:
	default:
	}
}

func (h *Hub) ServeConn(ctx context.Context, conn *websocket.Conn, scope string, accountID string) {
	if h == nil || conn == nil {
		return
	}
	client := &Client{
		hub:       h,
		conn:      conn,
		send:      make(chan []byte, 16),
		scope:     scope,
		accountID: accountID,
	}

	h.register <- client
	go client.writePump(ctx)
	client.readPump()
	h.unregister <- client
}

func (c *Client) matches(event Event) bool {
	if event.Scope != c.scope {
		return false
	}
	if event.Scope == "customer" && event.AccountID != "" && event.AccountID != c.accountID {
		return false
	}
	return true
}

func (c *Client) readPump() {
	defer c.conn.Close()
	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		if _, _, err := c.conn.NextReader(); err != nil {
			return
		}
	}
}

func (c *Client) writePump(ctx context.Context) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
