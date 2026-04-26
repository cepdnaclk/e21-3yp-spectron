#!/usr/bin/env bash
set -euo pipefail

required_env() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value// }" ]]; then
    echo "$name environment variable is required" >&2
    exit 1
  fi
  printf '%s' "$value"
}

command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is required but was not found in PATH" >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "openssl is required but was not found in PATH" >&2; exit 1; }

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="$(required_env DB_NAME)"
DB_USER="$(required_env DB_USER)"
DB_PASSWORD="$(required_env DB_PASSWORD)"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
required_env BACKUP_ENCRYPTION_KEY >/dev/null

if ! [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || [[ "$BACKUP_RETENTION_DAYS" -lt 1 ]]; then
  echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date +"%Y-%m-%d_%H-%M-%S")"
backup_file="$BACKUP_DIR/spectron_backup_$timestamp.sql"
encrypted_file="$backup_file.enc"

cleanup_plain() {
  rm -f "$backup_file"
}
trap cleanup_plain EXIT

echo "Creating PostgreSQL backup at $backup_file"
PGPASSWORD="$DB_PASSWORD" pg_dump \
  --host "$DB_HOST" \
  --port "$DB_PORT" \
  --username "$DB_USER" \
  --dbname "$DB_NAME" \
  --format plain \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --file "$backup_file"

if [[ ! -f "$backup_file" ]]; then
  echo "backup file was not created" >&2
  exit 1
fi

echo "Encrypting backup file"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
  -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$backup_file" \
  -out "$encrypted_file"

if [[ ! -s "$encrypted_file" ]]; then
  echo "encrypted backup file is missing or empty" >&2
  exit 1
fi

rm -f "$backup_file"
find "$BACKUP_DIR" -type f -name "spectron_backup_*.sql.enc" -mtime +"$BACKUP_RETENTION_DAYS" -delete

echo "Encrypted backup created successfully: $encrypted_file"
