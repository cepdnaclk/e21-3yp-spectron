-- Keep one deterministic system-admin account for local/demo operation.
-- Credentials:
--   email: test_admin@spectron.com
--   password: test123

INSERT INTO accounts (id, name)
VALUES ('11111111-1111-4111-8111-111111111111', 'Spectron System Admin')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name;

INSERT INTO users (
    id,
    email,
    password_hash,
    name,
    account_type,
    status
)
VALUES (
    '22222222-2222-4222-8222-222222222222',
    'test_admin@spectron.com',
    '$2a$10$9MeJDk9hxia7zNNFMXPpTOJGBzaFLXu9JGw4sleVh3nVUwah7M5d2',
    'System Admin',
    'ADMIN',
    'ACTIVE'
)
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    name = EXCLUDED.name,
    account_type = 'ADMIN',
    status = 'ACTIVE';

-- Make this the only system-admin login. Other users remain normal user accounts.
UPDATE users
SET account_type = 'USER'
WHERE account_type = 'ADMIN'
  AND email <> 'test_admin@spectron.com';

DELETE FROM account_memberships
WHERE user_id = (
    SELECT id FROM users WHERE email = 'test_admin@spectron.com'
)
AND account_id <> '11111111-1111-4111-8111-111111111111';

INSERT INTO account_memberships (account_id, user_id, role)
SELECT
    '11111111-1111-4111-8111-111111111111',
    id,
    'OWNER'
FROM users
WHERE email = 'test_admin@spectron.com'
ON CONFLICT (account_id, user_id) DO UPDATE
SET role = 'OWNER';
