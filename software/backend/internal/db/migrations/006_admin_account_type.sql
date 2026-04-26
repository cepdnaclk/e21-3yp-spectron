-- Separate user and administrator sign-in identities.

ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'USER';

UPDATE users
SET account_type = 'USER'
WHERE account_type IS NULL OR account_type = '';

ALTER TABLE IF EXISTS users
    DROP CONSTRAINT IF EXISTS users_account_type_check;

ALTER TABLE IF EXISTS users
    ADD CONSTRAINT users_account_type_check
    CHECK (account_type IN ('USER', 'ADMIN'));

CREATE INDEX IF NOT EXISTS idx_users_account_type
    ON users(account_type);
