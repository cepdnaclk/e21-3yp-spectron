-- Separate controller ownership from operational connectivity.

ALTER TABLE IF EXISTS controllers
    ADD COLUMN IF NOT EXISTS controller_uid TEXT,
    ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS owner_account_id UUID REFERENCES accounts(id),
    ADD COLUMN IF NOT EXISTS registered_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS claim_status TEXT NOT NULL DEFAULT 'UNCLAIMED',
    ADD COLUMN IF NOT EXISTS operational_status TEXT NOT NULL DEFAULT 'OFFLINE',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE controllers
SET controller_uid = hw_id
WHERE controller_uid IS NULL OR controller_uid = '';

ALTER TABLE IF EXISTS controllers
    ALTER COLUMN controller_uid SET NOT NULL,
    ALTER COLUMN account_id DROP NOT NULL;

UPDATE controllers
SET registered_by_account_id = account_id
WHERE registered_by_account_id IS NULL;

UPDATE controllers
SET owner_account_id = account_id
WHERE owner_user_id IS NOT NULL
  AND owner_account_id IS NULL;

UPDATE controllers
SET claim_status = CASE
        WHEN owner_user_id IS NOT NULL AND owner_account_id IS NOT NULL THEN 'CLAIMED'
        ELSE 'UNCLAIMED'
    END,
    operational_status = CASE UPPER(COALESCE(status, ''))
        WHEN 'ONLINE' THEN 'ONLINE'
        WHEN 'ERROR' THEN 'ERROR'
        WHEN 'PENDING_CONFIG' THEN 'PENDING_CONFIG'
        WHEN 'PAIRED' THEN 'PENDING_CONFIG'
        ELSE 'OFFLINE'
    END;

-- account_id remains as a compatibility mirror until legacy API models are removed.
UPDATE controllers
SET account_id = CASE WHEN claim_status = 'CLAIMED' THEN owner_account_id ELSE NULL END,
    owner_user_id = CASE WHEN claim_status = 'CLAIMED' THEN owner_user_id ELSE NULL END,
    owner_account_id = CASE WHEN claim_status = 'CLAIMED' THEN owner_account_id ELSE NULL END,
    status = operational_status;

CREATE UNIQUE INDEX IF NOT EXISTS idx_controllers_controller_uid_upper
    ON controllers (UPPER(controller_uid));

CREATE INDEX IF NOT EXISTS idx_controllers_owner_user_id
    ON controllers(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_controllers_owner_account_id
    ON controllers(owner_account_id);

CREATE INDEX IF NOT EXISTS idx_controllers_registered_by_account_id
    ON controllers(registered_by_account_id);

CREATE INDEX IF NOT EXISTS idx_controllers_claim_status
    ON controllers(claim_status);

CREATE INDEX IF NOT EXISTS idx_controllers_operational_status
    ON controllers(operational_status);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'controllers_claim_status_check'
          AND conrelid = 'controllers'::regclass
    ) THEN
        ALTER TABLE controllers
            ADD CONSTRAINT controllers_claim_status_check
            CHECK (claim_status IN ('UNCLAIMED', 'CLAIMED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'controllers_operational_status_check'
          AND conrelid = 'controllers'::regclass
    ) THEN
        ALTER TABLE controllers
            ADD CONSTRAINT controllers_operational_status_check
            CHECK (operational_status IN ('PENDING_CONFIG', 'ONLINE', 'OFFLINE', 'ERROR'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'controllers_claim_ownership_check'
          AND conrelid = 'controllers'::regclass
    ) THEN
        ALTER TABLE controllers
            ADD CONSTRAINT controllers_claim_ownership_check
            CHECK (
                (
                    claim_status = 'CLAIMED'
                    AND owner_account_id IS NOT NULL
                    AND owner_user_id IS NOT NULL
                    AND account_id = owner_account_id
                )
                OR
                (
                    claim_status = 'UNCLAIMED'
                    AND owner_account_id IS NULL
                    AND owner_user_id IS NULL
                    AND account_id IS NULL
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'controllers_owner_membership_fk'
          AND conrelid = 'controllers'::regclass
    ) THEN
        ALTER TABLE controllers
            ADD CONSTRAINT controllers_owner_membership_fk
            FOREIGN KEY (owner_account_id, owner_user_id)
            REFERENCES account_memberships(account_id, user_id)
            NOT VALID;
    END IF;
END $$;

ALTER TABLE controllers
    VALIDATE CONSTRAINT controllers_owner_membership_fk;
