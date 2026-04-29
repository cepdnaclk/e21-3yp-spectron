package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID            uuid.UUID `json:"id"`
	Email         string    `json:"email"`
	Name          *string   `json:"name,omitempty"`
	Phone         *string   `json:"phone,omitempty"`
	AvatarURL     *string   `json:"avatar_url,omitempty"`
	AccountType   string    `json:"account_type,omitempty"`
	Status        string    `json:"status,omitempty"`
	EmailVerified bool      `json:"is_email_verified"`
	CreatedAt     time.Time `json:"created_at"`
}

type Account struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type AccountMembership struct {
	AccountID uuid.UUID `json:"account_id"`
	UserID    uuid.UUID `json:"user_id"`
	Role      string    `json:"role"` // OWNER, ADMIN, VIEWER
}

type UserWithAccounts struct {
	User     User      `json:"user"`
	Accounts []Account `json:"accounts"`
}
