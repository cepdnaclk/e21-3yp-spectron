package httpapi

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"spectron-backend/internal/auth"
	"spectron-backend/internal/config"
	"spectron-backend/internal/models"
)

type AuthHandler struct {
	db *pgxpool.Pool
}

const (
	signupSuccessMessage           = "Account created. You can sign in now."
	verificationNotRequiredMessage = "Email verification is no longer required. You can sign in now."
)

func NewAuthHandler(db *pgxpool.Pool, _ config.EmailConfig) *AuthHandler {
	return &AuthHandler{db: db}
}

type RegisterRequest struct {
	Email            string  `json:"email"`
	Password         string  `json:"password"`
	Phone            *string `json:"phone,omitempty"`
	Name             *string `json:"name,omitempty"`
	OrganizationName *string `json:"organizationName,omitempty"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token   string       `json:"token,omitempty"`
	User    *models.User `json:"user,omitempty"`
	Status  string       `json:"status,omitempty"`
	Message string       `json:"message,omitempty"`
}

type CurrentUserResponse struct {
	ID            uuid.UUID                  `json:"id"`
	Email         string                     `json:"email"`
	Name          *string                    `json:"name,omitempty"`
	Phone         *string                    `json:"phone,omitempty"`
	AvatarURL     *string                    `json:"avatar_url,omitempty"`
	AccountType   string                     `json:"account_type"`
	Status        string                     `json:"status"`
	EmailVerified bool                       `json:"is_email_verified"`
	Accounts      []CurrentUserAccountAccess `json:"accounts"`
}

type UpdateProfileRequest struct {
	Name      *string `json:"name,omitempty"`
	Phone     *string `json:"phone,omitempty"`
	AvatarURL *string `json:"avatar_url,omitempty"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type DeleteAccountRequest struct {
	ConfirmEmail string `json:"confirm_email"`
}

type VerifyEmailRequest struct {
	Token string `json:"token"`
}

type ResendVerificationRequest struct {
	Email string `json:"email"`
}

type CreateOwnerRequest struct {
	Email            string  `json:"email"`
	Password         string  `json:"password"`
	Name             *string `json:"name,omitempty"`
	Phone            *string `json:"phone,omitempty"`
	OrganizationName string  `json:"organizationName"`
}

type CreateViewerRequest struct {
	Email    string  `json:"email"`
	Password string  `json:"password"`
	Name     *string `json:"name,omitempty"`
	Phone    *string `json:"phone,omitempty"`
}

type AdminOwnerResponse struct {
	ID               string `json:"id"`
	Email            string `json:"email"`
	Name             string `json:"name,omitempty"`
	Phone            string `json:"phone,omitempty"`
	Status           string `json:"status"`
	AccountID        string `json:"accountId"`
	OrganizationName string `json:"organizationName"`
	ControllerCount  int    `json:"controllerCount"`
	ViewerCount      int    `json:"viewerCount"`
	CreatedAt        string `json:"createdAt"`
}

type CurrentUserAccountAccess struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Role string    `json:"role"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || len(req.Password) < 6 {
		http.Error(w, "email and a password of at least 6 characters are required", http.StatusBadRequest)
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		log.Printf("Failed to begin transaction: %v", err)
		http.Error(w, "database error: failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var existingUserID uuid.UUID
	err = tx.QueryRow(r.Context(), `
		SELECT id
		FROM users
		WHERE email = $1
	`, email).Scan(&existingUserID)
	if err == nil {
		http.Error(w, "email already registered", http.StatusConflict)
		return
	}
	if err != pgx.ErrNoRows {
		log.Printf("Failed to check existing user: %v", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	hashedPassword, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, "failed to hash password", http.StatusInternalServerError)
		return
	}

	userID := uuid.New()
	accountID := uuid.New()

	_, err = tx.Exec(r.Context(), `
		INSERT INTO users (id, email, password_hash, phone, name, account_type, status, is_email_verified)
		VALUES ($1, $2, $3, $4, $5, 'USER', 'ACTIVE', true)
	`, userID, email, hashedPassword, req.Phone, req.Name)
	if err != nil {
		log.Printf("Failed to create user: %v", err)
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "email already registered", http.StatusConflict)
			return
		}
		http.Error(w, "failed to create account", http.StatusInternalServerError)
		return
	}

	// Create account
	accountName := email
	if req.OrganizationName != nil && strings.TrimSpace(*req.OrganizationName) != "" {
		accountName = strings.TrimSpace(*req.OrganizationName)
	} else if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		accountName = strings.TrimSpace(*req.Name)
	}
	_, err = tx.Exec(r.Context(), `
		INSERT INTO accounts (id, name)
		VALUES ($1, $2)
	`, accountID, accountName)
	if err != nil {
		log.Printf("Failed to create account: %v", err)
		http.Error(w, "failed to create account: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Create membership (user is OWNER of their account)
	_, err = tx.Exec(r.Context(), `
		INSERT INTO account_memberships (account_id, user_id, role)
		VALUES ($1, $2, 'OWNER')
	`, accountID, userID)
	if err != nil {
		log.Printf("Failed to create membership: %v", err)
		http.Error(w, "failed to create membership: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		http.Error(w, "failed to commit transaction: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeSignupSuccessResponse(w)
}

func writeSignupSuccessResponse(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		Status:  "ACTIVE",
		Message: signupSuccessMessage,
	})
}

func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "disabled",
		"message": verificationNotRequiredMessage,
	})
}

func (h *AuthHandler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": verificationNotRequiredMessage,
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	h.loginWithAccountType(w, r, "USER")
}

func (h *AuthHandler) AdminLogin(w http.ResponseWriter, r *http.Request) {
	h.loginWithAccountType(w, r, "ADMIN")
}

func (h *AuthHandler) loginWithAccountType(w http.ResponseWriter, r *http.Request, accountType string) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	var userID uuid.UUID
	var accountID uuid.UUID
	var passwordHash string
	var phone *string
	var name *string
	var avatarURL *string
	var status string
	var isEmailVerified bool

	err := h.db.QueryRow(r.Context(), `
		SELECT u.id, u.password_hash, u.phone, u.name, u.avatar_url, u.status, u.is_email_verified, am.account_id
		FROM users u
		JOIN account_memberships am ON u.id = am.user_id
		WHERE u.email = $1
		  AND u.account_type = $2
		  AND (
		      ($2 = 'ADMIN' AND am.role IN ('OWNER', 'ADMIN'))
		      OR ($2 = 'USER' AND am.role IN ('OWNER', 'ADMIN', 'VIEWER'))
		  )
		LIMIT 1
	`, strings.ToLower(strings.TrimSpace(req.Email)), accountType).Scan(&userID, &passwordHash, &phone, &name, &avatarURL, &status, &isEmailVerified, &accountID)
	if err != nil {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	if !isEmailVerified {
		if _, updateErr := h.db.Exec(r.Context(), `
			UPDATE users
			SET is_email_verified = true
			WHERE id = $1
		`, userID); updateErr != nil {
			log.Printf("Failed to auto-verify user %s during login: %v", userID, updateErr)
		}
		isEmailVerified = true
	}

	if status != "ACTIVE" {
		switch status {
		case "PENDING_APPROVAL":
			http.Error(w, "account pending admin approval", http.StatusForbidden)
		case "REJECTED":
			http.Error(w, "account request was rejected", http.StatusForbidden)
		case "DISABLED":
			http.Error(w, "account disabled", http.StatusForbidden)
		default:
			http.Error(w, "account is not active", http.StatusForbidden)
		}
		return
	}

	if !auth.CheckPasswordHash(req.Password, passwordHash) {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	// Generate token
	token, err := auth.GenerateToken(userID, accountID, req.Email)
	if err != nil {
		http.Error(w, "failed to generate token", http.StatusInternalServerError)
		return
	}

	user := models.User{
		ID:            userID,
		Email:         req.Email,
		Name:          name,
		Phone:         phone,
		AvatarURL:     avatarURL,
		AccountType:   accountType,
		Status:        status,
		EmailVerified: isEmailVerified,
	}

	json.NewEncoder(w).Encode(AuthResponse{
		Token: token,
		User:  &user,
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)

	var user models.User
	var accounts []CurrentUserAccountAccess

	err := h.db.QueryRow(r.Context(), `
		SELECT id, email, name, phone, avatar_url, account_type, status, is_email_verified, created_at
		FROM users
		WHERE id = $1
	`, userID).Scan(&user.ID, &user.Email, &user.Name, &user.Phone, &user.AvatarURL, &user.AccountType, &user.Status, &user.EmailVerified, &user.CreatedAt)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT a.id, a.name, a.created_at, am.role
		FROM accounts a
		JOIN account_memberships am ON a.id = am.account_id
		WHERE am.user_id = $1
	`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var acc CurrentUserAccountAccess
			var createdAtIgnored interface{}
			var role string
			if err := rows.Scan(&acc.ID, &acc.Name, &createdAtIgnored, &role); err != nil {
				continue
			}
			acc.Role = role
			accounts = append(accounts, acc)
		}
	}

	response := CurrentUserResponse{
		ID:            user.ID,
		Email:         user.Email,
		Name:          user.Name,
		Phone:         user.Phone,
		AvatarURL:     user.AvatarURL,
		AccountType:   user.AccountType,
		Status:        user.Status,
		EmailVerified: user.EmailVerified,
		Accounts:      accounts,
	}

	json.NewEncoder(w).Encode(response)
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)

	var req UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	name := normalizeOptionalString(req.Name)
	phone := normalizeOptionalString(req.Phone)
	avatarURL := normalizeOptionalString(req.AvatarURL)

	var user models.User
	err := h.db.QueryRow(r.Context(), `
		UPDATE users
		SET name = $2, phone = $3, avatar_url = $4
		WHERE id = $1
		RETURNING id, email, name, phone, avatar_url, created_at
	`, userID, name, phone, avatarURL).Scan(&user.ID, &user.Email, &user.Name, &user.Phone, &user.AvatarURL, &user.CreatedAt)
	if err != nil {
		http.Error(w, "failed to update profile", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(user)
}

func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)

	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	if len(req.NewPassword) < 8 {
		http.Error(w, "new password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	var currentHash string
	err := h.db.QueryRow(r.Context(), `
		SELECT password_hash
		FROM users
		WHERE id = $1
	`, userID).Scan(&currentHash)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	if !auth.CheckPasswordHash(req.CurrentPassword, currentHash) {
		http.Error(w, "current password is incorrect", http.StatusUnauthorized)
		return
	}

	nextHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		http.Error(w, "failed to hash password", http.StatusInternalServerError)
		return
	}

	_, err = h.db.Exec(r.Context(), `
		UPDATE users
		SET password_hash = $2
		WHERE id = $1
	`, userID, nextHash)
	if err != nil {
		http.Error(w, "failed to update password", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status": "password_updated",
	})
}

func (h *AuthHandler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)
	accountID := GetAccountID(r).(uuid.UUID)

	var req DeleteAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	var email string
	var role string
	err := h.db.QueryRow(r.Context(), `
		SELECT u.email, am.role
		FROM users u
		JOIN account_memberships am ON u.id = am.user_id
		WHERE u.id = $1 AND am.account_id = $2
	`, userID, accountID).Scan(&email, &role)
	if err != nil {
		http.Error(w, "account not found", http.StatusNotFound)
		return
	}

	if role != "OWNER" {
		http.Error(w, "only account owners can delete an account", http.StatusForbidden)
		return
	}

	if !strings.EqualFold(strings.TrimSpace(req.ConfirmEmail), email) {
		http.Error(w, "confirmation email does not match", http.StatusBadRequest)
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	// The schema does not use ON DELETE CASCADE, so remove account-owned data
	// from leaf tables first to avoid foreign-key violations.
	deletes := []string{
		`DELETE FROM pairing_tokens
		 WHERE issued_for_account_id = $1
		    OR controller_id IN (SELECT id FROM controllers WHERE account_id = $1)`,
		`DELETE FROM sensor_group_members
		 WHERE group_id IN (
		     SELECT sg.id
		     FROM sensor_groups sg
		     JOIN controllers c ON sg.controller_id = c.id
		     WHERE c.owner_account_id = $1
		 )
		    OR sensor_id IN (
		     SELECT s.id
		     FROM sensors s
		     JOIN controllers c ON s.controller_id = c.id
		     WHERE c.owner_account_id = $1
		 )`,
		`DELETE FROM sensor_readings
		 WHERE sensor_id IN (
		     SELECT s.id
		     FROM sensors s
		     JOIN controllers c ON s.controller_id = c.id
		     WHERE c.owner_account_id = $1
		 )`,
		`DELETE FROM sensor_configs
		 WHERE sensor_id IN (
		     SELECT s.id
		     FROM sensors s
		     JOIN controllers c ON s.controller_id = c.id
		     WHERE c.owner_account_id = $1
		 )`,
		`DELETE FROM alerts WHERE account_id = $1`,
		`DELETE FROM sensor_groups
		 WHERE controller_id IN (SELECT id FROM controllers WHERE account_id = $1)`,
		`DELETE FROM sensors
		 WHERE controller_id IN (SELECT id FROM controllers WHERE account_id = $1)`,
		`DELETE FROM controller_configs
		 WHERE controller_id IN (SELECT id FROM controllers WHERE account_id = $1)`,
		`DELETE FROM controllers WHERE account_id = $1`,
		`DELETE FROM account_memberships WHERE account_id = $1`,
		`DELETE FROM accounts WHERE id = $1`,
	}

	for _, query := range deletes {
		if _, err := tx.Exec(r.Context(), query, accountID); err != nil {
			log.Printf("Failed to delete account data: %v", err)
			http.Error(w, "failed to delete account", http.StatusInternalServerError)
			return
		}
	}

	if _, err := tx.Exec(r.Context(), `DELETE FROM account_memberships WHERE user_id = $1`, userID); err != nil {
		log.Printf("Failed to delete user memberships: %v", err)
		http.Error(w, "failed to delete account", http.StatusInternalServerError)
		return
	}

	if _, err := tx.Exec(r.Context(), `DELETE FROM users WHERE id = $1`, userID); err != nil {
		log.Printf("Failed to delete user: %v", err)
		http.Error(w, "failed to delete account", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Printf("Failed to commit account deletion: %v", err)
		http.Error(w, "failed to delete account", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status": "account_deleted",
	})
}

// ListUsers returns all users in the same account(s) as the current user
func (h *AuthHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)

	// Get all users in the same account
	rows, err := h.db.Query(r.Context(), `
		SELECT DISTINCT u.id, u.email, u.name, u.phone, u.status, u.created_at, am.role
		FROM users u
		JOIN account_memberships am ON u.id = am.user_id
		WHERE am.account_id = $1
		ORDER BY u.created_at DESC
	`, accountID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type UserResponse struct {
		ID        uuid.UUID `json:"id"`
		Email     string    `json:"email"`
		Name      *string   `json:"name,omitempty"`
		Phone     *string   `json:"phone,omitempty"`
		Status    string    `json:"status"`
		CreatedAt string    `json:"created_at"`
		Role      string    `json:"role"`
	}

	users := make([]UserResponse, 0)
	for rows.Next() {
		var u UserResponse
		var createdAt time.Time
		err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Phone, &u.Status, &createdAt, &u.Role)
		if err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
		u.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"users": users,
		"count": len(users),
	})
}

func (h *AuthHandler) CreateViewer(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)

	var req CreateViewerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || len(req.Password) < 6 {
		http.Error(w, "email and a password of at least 6 characters are required", http.StatusBadRequest)
		return
	}

	hashedPassword, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, "failed to hash password", http.StatusInternalServerError)
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	userID := uuid.New()
	_, err = tx.Exec(r.Context(), `
		INSERT INTO users (id, email, password_hash, phone, name, account_type, status, is_email_verified)
		VALUES ($1, $2, $3, $4, $5, 'USER', 'ACTIVE', true)
	`, userID, email, hashedPassword, req.Phone, req.Name)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "email already registered", http.StatusConflict)
		} else {
			http.Error(w, "failed to create viewer", http.StatusInternalServerError)
		}
		return
	}

	_, err = tx.Exec(r.Context(), `
		INSERT INTO account_memberships (account_id, user_id, role)
		VALUES ($1, $2, 'VIEWER')
	`, accountID, userID)
	if err != nil {
		http.Error(w, "failed to add viewer to account", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to create viewer", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(models.User{
		ID:          userID,
		Email:       email,
		Name:        req.Name,
		Phone:       req.Phone,
		AccountType: "USER",
		Status:      "ACTIVE",
	})
}

func (h *AuthHandler) DeleteViewer(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)
	viewerIDParam := strings.TrimSpace(chi.URLParam(r, "userId"))
	viewerID, err := uuid.Parse(viewerIDParam)
	if err != nil {
		http.Error(w, "invalid viewer id", http.StatusBadRequest)
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var role string
	err = tx.QueryRow(r.Context(), `
		SELECT am.role
		FROM account_memberships am
		WHERE am.account_id = $1 AND am.user_id = $2
	`, accountID, viewerID).Scan(&role)
	if err == pgx.ErrNoRows {
		http.Error(w, "viewer not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if role != "VIEWER" {
		http.Error(w, "only viewer accounts can be removed", http.StatusBadRequest)
		return
	}

	command, err := tx.Exec(r.Context(), `
		DELETE FROM account_memberships
		WHERE account_id = $1 AND user_id = $2 AND role = 'VIEWER'
	`, accountID, viewerID)
	if err != nil {
		log.Printf("Failed to remove viewer membership: %v", err)
		http.Error(w, "failed to remove viewer", http.StatusInternalServerError)
		return
	}
	if command.RowsAffected() == 0 {
		http.Error(w, "viewer not found", http.StatusNotFound)
		return
	}

	var remainingMemberships int
	if err := tx.QueryRow(r.Context(), `
		SELECT COUNT(*)::int
		FROM account_memberships
		WHERE user_id = $1
	`, viewerID).Scan(&remainingMemberships); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	if remainingMemberships == 0 {
		if _, err := tx.Exec(r.Context(), `
			DELETE FROM users
			WHERE id = $1 AND account_type = 'USER'
		`, viewerID); err != nil {
			log.Printf("Failed to delete viewer user: %v", err)
			http.Error(w, "failed to remove viewer", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to remove viewer", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status": "viewer_removed",
	})
}

func (h *AuthHandler) AdminListOwners(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT
			u.id,
			u.email,
			COALESCE(u.name, ''),
			COALESCE(u.phone, ''),
			u.status,
			a.id,
			a.name,
			u.created_at,
			COUNT(DISTINCT c.id)::int,
			COUNT(DISTINCT viewer.user_id)::int
		FROM account_memberships owner_membership
		JOIN users u ON u.id = owner_membership.user_id
		JOIN accounts a ON a.id = owner_membership.account_id
		LEFT JOIN controllers c ON c.owner_account_id = a.id AND c.claim_status = 'CLAIMED'
		LEFT JOIN account_memberships viewer ON viewer.account_id = a.id AND viewer.role = 'VIEWER'
		WHERE u.account_type = 'USER' AND owner_membership.role = 'OWNER'
		GROUP BY u.id, u.email, u.name, u.phone, u.status, a.id, a.name, u.created_at
		ORDER BY
			CASE u.status WHEN 'PENDING_APPROVAL' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END,
			u.created_at DESC
	`)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	owners := make([]AdminOwnerResponse, 0)
	for rows.Next() {
		var owner AdminOwnerResponse
		var id uuid.UUID
		var accountID uuid.UUID
		var createdAt time.Time
		if err := rows.Scan(
			&id,
			&owner.Email,
			&owner.Name,
			&owner.Phone,
			&owner.Status,
			&accountID,
			&owner.OrganizationName,
			&createdAt,
			&owner.ControllerCount,
			&owner.ViewerCount,
		); err != nil {
			continue
		}
		owner.ID = id.String()
		owner.AccountID = accountID.String()
		owner.CreatedAt = createdAt.Format(time.RFC3339)
		owners = append(owners, owner)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"owners": owners})
}

func (h *AuthHandler) AdminCreateOwner(w http.ResponseWriter, r *http.Request) {
	actorUserID := GetUserID(r).(uuid.UUID)
	var req CreateOwnerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	orgName := strings.TrimSpace(req.OrganizationName)
	if orgName == "" && req.Name != nil {
		orgName = strings.TrimSpace(*req.Name)
	}
	if orgName == "" {
		orgName = email
	}
	if email == "" || len(req.Password) < 6 {
		http.Error(w, "email and a password of at least 6 characters are required", http.StatusBadRequest)
		return
	}

	hashedPassword, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, "failed to hash password", http.StatusInternalServerError)
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	userID := uuid.New()
	accountID := uuid.New()
	_, err = tx.Exec(r.Context(), `
		INSERT INTO users (id, email, password_hash, phone, name, account_type, status, is_email_verified)
		VALUES ($1, $2, $3, $4, $5, 'USER', 'ACTIVE', true)
	`, userID, email, hashedPassword, req.Phone, req.Name)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "email already registered", http.StatusConflict)
		} else {
			http.Error(w, "failed to create owner", http.StatusInternalServerError)
		}
		return
	}

	if _, err = tx.Exec(r.Context(), `INSERT INTO accounts (id, name) VALUES ($1, $2)`, accountID, orgName); err != nil {
		http.Error(w, "failed to create account", http.StatusInternalServerError)
		return
	}
	if _, err = tx.Exec(r.Context(), `
		INSERT INTO account_memberships (account_id, user_id, role)
		VALUES ($1, $2, 'OWNER')
	`, accountID, userID); err != nil {
		http.Error(w, "failed to create owner membership", http.StatusInternalServerError)
		return
	}

	if err := recordAdminAuditEvent(r.Context(), tx, r, actorUserID, adminAuditEventInput{
		Action:      "OWNER_CREATED",
		TargetType:  "USER",
		TargetID:    userID.String(),
		TargetLabel: email,
		Details: map[string]any{
			"accountId":        accountID.String(),
			"organizationName": orgName,
			"status":           "ACTIVE",
		},
	}); err != nil {
		http.Error(w, "failed to record owner audit event", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to create owner", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(AdminOwnerResponse{
		ID:               userID.String(),
		Email:            email,
		Status:           "ACTIVE",
		AccountID:        accountID.String(),
		OrganizationName: orgName,
		CreatedAt:        time.Now().Format(time.RFC3339),
	})
}

func (h *AuthHandler) AdminApproveOwner(w http.ResponseWriter, r *http.Request) {
	h.adminSetOwnerStatus(w, r, "ACTIVE")
}

func (h *AuthHandler) AdminRejectOwner(w http.ResponseWriter, r *http.Request) {
	h.adminSetOwnerStatus(w, r, "REJECTED")
}

func (h *AuthHandler) adminSetOwnerStatus(w http.ResponseWriter, r *http.Request, status string) {
	actorUserID := GetUserID(r).(uuid.UUID)
	userIDParam := strings.TrimSpace(chi.URLParam(r, "userId"))
	userID, err := uuid.Parse(userIDParam)
	if err != nil {
		http.Error(w, "invalid owner id", http.StatusBadRequest)
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var email string
	var previousStatus string
	err = tx.QueryRow(r.Context(), `
		SELECT u.email, u.status
		FROM users u
		WHERE u.id = $1
		  AND u.account_type = 'USER'
		  AND EXISTS (
		      SELECT 1
		      FROM account_memberships am
		      WHERE am.user_id = u.id AND am.role = 'OWNER'
		  )
		FOR UPDATE
	`, userID).Scan(&email, &previousStatus)
	if err == pgx.ErrNoRows {
		http.Error(w, "owner not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "failed to load owner", http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec(r.Context(), `
		UPDATE users u
		SET status = $2
		WHERE u.id = $1
	`, userID, status)
	if err != nil {
		http.Error(w, "failed to update owner", http.StatusInternalServerError)
		return
	}

	action := "OWNER_STATUS_CHANGED"
	if status == "ACTIVE" {
		action = "OWNER_APPROVED"
	} else if status == "REJECTED" {
		action = "OWNER_REJECTED"
	}
	if err := recordAdminAuditEvent(r.Context(), tx, r, actorUserID, adminAuditEventInput{
		Action:      action,
		TargetType:  "USER",
		TargetID:    userID.String(),
		TargetLabel: email,
		Details: map[string]any{
			"previousStatus": previousStatus,
			"newStatus":      status,
		},
	}); err != nil {
		http.Error(w, "failed to record owner audit event", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to update owner", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"id":     userID.String(),
		"status": status,
	})
}
