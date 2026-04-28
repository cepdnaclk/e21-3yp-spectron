-- Email verification replaces the old signup-time admin approval gate.
-- Existing users who already verified their email should be able to sign in.

UPDATE users
SET status = 'ACTIVE'
WHERE account_type = 'USER'
  AND status = 'PENDING_APPROVAL'
  AND is_email_verified = true;
