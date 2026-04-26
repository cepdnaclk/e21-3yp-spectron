# SPECTRON Backup And Encryption Security

This document covers secure PostgreSQL backups, encrypted backup files, restore testing, and production encryption-at-rest responsibilities for SPECTRON.

## Local Encrypted Backups

The backup scripts read database and encryption settings from environment variables. They create a plain `pg_dump` file, encrypt it with OpenSSL AES-256, verify the encrypted file exists, and then delete the plain `.sql` file.

Required environment variables:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=spectron
DB_USER=spectron
DB_PASSWORD=change_me
BACKUP_DIR=./backups
BACKUP_RETENTION_DAYS=7
BACKUP_ENCRYPTION_KEY=change_this_long_random_backup_key
```

PowerShell:

```powershell
.\scripts\backup-db.ps1
```

Linux/macOS:

```bash
chmod +x ./scripts/backup-db.sh
./scripts/backup-db.sh
```

Backup file format:

```text
spectron_backup_YYYY-MM-DD_HH-mm-ss.sql.enc
```

Only `.sql.enc` files should remain after a successful backup. Plain `.sql` files are deleted after encryption.

## Restore Testing

Restore requires the same `BACKUP_ENCRYPTION_KEY` that encrypted the backup. The restore scripts decrypt to a temporary file, restore with `psql`, and delete the temporary decrypted SQL file.

PowerShell:

```powershell
.\scripts\restore-db.ps1 .\backups\spectron_backup_2026-04-25_10-30-00.sql.enc
```

Linux/macOS:

```bash
./scripts/restore-db.sh ./backups/spectron_backup_2026-04-25_10-30-00.sql.enc
```

The scripts ask for confirmation before restoring. Test restores regularly in a non-production database so you know backups are usable before an incident.

## Retention Policy

`BACKUP_RETENTION_DAYS` controls cleanup. The default is `7`, meaning encrypted backups older than 7 days are removed.

For production, keep at least:

- Daily backups for 7 days.
- Weekly backups for 4 weeks.
- Monthly backups according to compliance needs.

If longer retention is required, move encrypted backups to cloud storage before local cleanup.

## Scheduling

### Windows Task Scheduler

1. Open Task Scheduler.
2. Create a basic task named `Spectron Daily Database Backup`.
3. Trigger: daily at `2:00 AM`.
4. Action: start a program.
5. Program: `powershell.exe`.
6. Arguments:

```text
-ExecutionPolicy Bypass -File "D:\3Yp\e21-3yp-spectron-dashboard\scripts\backup-db.ps1"
```

Set the environment variables for the task user or load them from a secured machine-level configuration. Do not place real secrets in the task command.

### Linux Cron

Run daily at `2:00 AM`:

```cron
0 2 * * * DB_HOST=localhost DB_PORT=5432 DB_NAME=spectron DB_USER=spectron DB_PASSWORD=*** BACKUP_DIR=/secure/backups BACKUP_RETENTION_DAYS=7 BACKUP_ENCRYPTION_KEY=*** /path/to/e21-3yp-spectron-dashboard/scripts/backup-db.sh >> /var/log/spectron-backup.log 2>&1
```

Prefer loading secrets from a protected environment file or secret manager instead of writing them directly in crontab.

## Application-Level Secret Encryption

The backend includes AES-256-GCM helpers:

```go
security.EncryptSecret(plainText)
security.DecryptSecret(cipherText)
```

Environment variable:

```env
APP_ENCRYPTION_KEY=change_this_32_byte_key
```

Use this only for secrets that must be recovered later, such as future device secrets, API keys, refresh tokens, or MQTT credentials. Do not use this for:

- Passwords. Passwords must remain bcrypt hashed.
- Pairing tokens. Pairing tokens should remain hashed.
- Sensor readings. Normal telemetry should remain queryable.
- Values that must be searched or indexed unless a searchable design is added.

Use a 32-byte random key in production. Rotate keys with a planned migration because existing encrypted values require the original key to decrypt.

## Production Database Encryption At Rest

PostgreSQL encryption at rest is normally handled by infrastructure, not application SQL.

Recommended options:

- AWS RDS PostgreSQL with KMS encryption enabled.
- Encrypted EC2 EBS volumes if PostgreSQL runs on EC2.
- Encrypted S3 bucket for backup storage.
- KMS-managed keys with access limited to the backend/backup role.

Encryption at rest must be enabled when the database or storage volume is created. For managed databases, confirm snapshots and automated backups are also encrypted.

## Secure Backup Storage

Store only `.sql.enc` files outside the server. Never upload plain `.sql` files.

Recommended AWS S3 setup:

- Private bucket.
- Server-side encryption with KMS.
- Bucket versioning enabled if needed.
- IAM user or role with minimum permissions, ideally only `PutObject`, `GetObject`, and `ListBucket` for the backup prefix.
- Lifecycle policy for long-term retention and cleanup.

Optional upload can be added later once AWS credentials and bucket policy are finalized.

## Access Control Recommendations

- Restrict the backup folder to the backend service account or backup operator.
- Do not commit `.env`, `.key`, `.sql`, or `.sql.enc` files.
- Store `BACKUP_ENCRYPTION_KEY` and `APP_ENCRYPTION_KEY` in a secret manager.
- Use a database user with only the permissions needed for backup and restore.
- Require MFA for cloud console access.
- Audit restore and backup access.

## Production Checklist

- Set a strong `JWT_SECRET`.
- Set a strong random `BACKUP_ENCRYPTION_KEY`.
- Set a 32-byte random `APP_ENCRYPTION_KEY` before encrypting recoverable secrets.
- Enable RDS/KMS or disk encryption at rest.
- Store encrypted backups in a private encrypted bucket.
- Test restore in staging at least monthly.
- Monitor scheduled backup failures.
- Confirm no `.sql`, `.sql.enc`, `.key`, or `.env` files are committed.
