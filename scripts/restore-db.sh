#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 ./backups/spectron_backup_YYYY-MM-DD_HH-mm-ss.sql.enc" >&2
  exit 1
fi

required_env() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value// }" ]]; then
    echo "$name environment variable is required" >&2
    exit 1
  fi
  printf '%s' "$value"
}

encrypted_backup="$1"
if [[ ! -f "$encrypted_backup" ]]; then
  echo "encrypted backup file not found: $encrypted_backup" >&2
  exit 1
fi

command -v psql >/dev/null 2>&1 || { echo "psql is required but was not found in PATH" >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "openssl is required but was not found in PATH" >&2; exit 1; }

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="$(required_env DB_NAME)"
DB_USER="$(required_env DB_USER)"
DB_PASSWORD="$(required_env DB_PASSWORD)"
required_env BACKUP_ENCRYPTION_KEY >/dev/null

temp_sql="$(mktemp "${TMPDIR:-/tmp}/spectron_restore_XXXXXX.sql")"
cleanup_temp() {
  rm -f "$temp_sql"
}
trap cleanup_temp EXIT

echo "This will restore into database '$DB_NAME' on '$DB_HOST:$DB_PORT'. Existing data may be overwritten."
read -r -p "Type RESTORE to continue: " confirmation
if [[ "$confirmation" != "RESTORE" ]]; then
  echo "Restore cancelled."
  exit 0
fi

echo "Decrypting backup to a temporary file"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$encrypted_backup" \
  -out "$temp_sql"

if [[ ! -s "$temp_sql" ]]; then
  echo "temporary decrypted backup is missing or empty" >&2
  exit 1
fi

echo "Restoring PostgreSQL backup"
PGPASSWORD="$DB_PASSWORD" psql \
  --host "$DB_HOST" \
  --port "$DB_PORT" \
  --username "$DB_USER" \
  --dbname "$DB_NAME" \
  --set ON_ERROR_STOP=1 \
  --file "$temp_sql"

echo "Restore completed successfully."
