package mail

import (
	"bytes"
	"context"
	"fmt"
	"net"
	netmail "net/mail"
	"net/smtp"
	"strings"

	"spectron-backend/internal/config"
)

type Mailer struct {
	cfg config.EmailConfig
}

func NewMailer(cfg config.EmailConfig) *Mailer {
	return &Mailer{cfg: cfg}
}

func (m *Mailer) Configured() bool {
	return strings.TrimSpace(m.cfg.SMTPHost) != ""
}

func (m *Mailer) SendVerificationEmail(ctx context.Context, to string, verificationURL string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	recipient := strings.TrimSpace(to)
	if recipient == "" {
		return fmt.Errorf("recipient email is required")
	}

	if !m.Configured() {
		return fmt.Errorf("SMTP_HOST is required to send verification emails")
	}

	fromHeader := strings.TrimSpace(m.cfg.EmailFrom)
	if fromHeader == "" {
		fromHeader = strings.TrimSpace(m.cfg.SMTPUser)
	}
	if fromHeader == "" {
		return fmt.Errorf("EMAIL_FROM or SMTP_USER is required when SMTP is configured")
	}

	fromAddress := fromHeader
	if parsed, err := netmail.ParseAddress(fromHeader); err == nil {
		fromAddress = parsed.Address
	}

	host := strings.TrimSpace(m.cfg.SMTPHost)
	port := m.cfg.SMTPPort
	if port <= 0 {
		port = 587
	}

	subject := "Verify your Spectron email"
	textBody := fmt.Sprintf(
		"Verify your Spectron account by opening this link:\n\n%s\n\nThis link expires in 30 minutes. If you did not create an account, you can ignore this email.\n",
		verificationURL,
	)

	var msg bytes.Buffer
	writeHeader(&msg, "From", fromHeader)
	writeHeader(&msg, "To", recipient)
	writeHeader(&msg, "Subject", subject)
	writeHeader(&msg, "MIME-Version", "1.0")
	writeHeader(&msg, "Content-Type", `text/plain; charset="UTF-8"`)
	msg.WriteString("\r\n")
	msg.WriteString(textBody)

	var auth smtp.Auth
	if strings.TrimSpace(m.cfg.SMTPUser) != "" || strings.TrimSpace(m.cfg.SMTPPass) != "" {
		auth = smtp.PlainAuth("", strings.TrimSpace(m.cfg.SMTPUser), m.cfg.SMTPPass, host)
	}

	addr := net.JoinHostPort(host, fmt.Sprintf("%d", port))
	return smtp.SendMail(addr, auth, fromAddress, []string{recipient}, msg.Bytes())
}

func writeHeader(buf *bytes.Buffer, key string, value string) {
	sanitized := strings.ReplaceAll(value, "\r", "")
	sanitized = strings.ReplaceAll(sanitized, "\n", "")
	buf.WriteString(key)
	buf.WriteString(": ")
	buf.WriteString(sanitized)
	buf.WriteString("\r\n")
}
