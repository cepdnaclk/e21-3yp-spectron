package models

import (
	"time"

	"github.com/google/uuid"
)

type Controller struct {
	ID        uuid.UUID `json:"id"`
	AccountID uuid.UUID `json:"account_id"`
	HWID      string    `json:"hw_id"`
	Name      *string   `json:"name,omitempty"`
	Purpose   *string   `json:"purpose,omitempty"`
	Location  *string   `json:"location,omitempty"`
	QRCode    *string   `json:"qr_code,omitempty"`
	Status    string    `json:"status"` // ONLINE, OFFLINE, PENDING_CONFIG
	LastSeen  *time.Time `json:"last_seen,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

type PairControllerRequest struct {
	QRToken string `json:"qr_token"`
}

type UpdateControllerRequest struct {
	Name     *string `json:"name,omitempty"`
	Purpose  *string `json:"purpose,omitempty"`
	Location *string `json:"location,omitempty"`
}
