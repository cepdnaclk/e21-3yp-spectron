param()

$ErrorActionPreference = "Stop"

function Get-RequiredEnv {
    param([string]$Name)
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "$Name environment variable is required"
    }
    return $value
}

function Get-EnvOrDefault {
    param(
        [string]$Name,
        [string]$Default
    )
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $Default
    }
    return $value
}

function Get-CommandPath {
    param([string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "$Name is required but was not found in PATH"
    }
    return $command.Source
}

$dbHost = Get-EnvOrDefault "DB_HOST" "localhost"
$dbPort = Get-EnvOrDefault "DB_PORT" "5432"
$dbName = Get-RequiredEnv "DB_NAME"
$dbUser = Get-RequiredEnv "DB_USER"
$dbPassword = Get-RequiredEnv "DB_PASSWORD"
$backupDir = Get-EnvOrDefault "BACKUP_DIR" "./backups"
$retentionDaysRaw = Get-EnvOrDefault "BACKUP_RETENTION_DAYS" "7"
$backupKey = Get-RequiredEnv "BACKUP_ENCRYPTION_KEY"

$retentionDays = 7
if (-not [int]::TryParse($retentionDaysRaw, [ref]$retentionDays) -or $retentionDays -lt 1) {
    throw "BACKUP_RETENTION_DAYS must be a positive integer"
}

$pgDump = Get-CommandPath "pg_dump"
$openssl = Get-CommandPath "openssl"

$resolvedBackupDir = Resolve-Path -Path $backupDir -ErrorAction SilentlyContinue
if (-not $resolvedBackupDir) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    $resolvedBackupDir = Resolve-Path -Path $backupDir
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$baseName = "spectron_backup_$timestamp.sql"
$backupFile = Join-Path $resolvedBackupDir $baseName
$encryptedFile = "$backupFile.enc"
$previousPGPassword = $env:PGPASSWORD

try {
    $env:PGPASSWORD = $dbPassword
    Write-Host "Creating PostgreSQL backup at $backupFile"

    & $pgDump `
        --host $dbHost `
        --port $dbPort `
        --username $dbUser `
        --dbname $dbName `
        --format plain `
        --clean `
        --if-exists `
        --no-owner `
        --no-privileges `
        --file $backupFile

    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed"
    }
    if (-not (Test-Path $backupFile)) {
        throw "backup file was not created"
    }

    Write-Host "Encrypting backup file"
    & $openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 `
        -pass env:BACKUP_ENCRYPTION_KEY `
        -in $backupFile `
        -out $encryptedFile

    if ($LASTEXITCODE -ne 0) {
        throw "backup encryption failed"
    }
    if (-not (Test-Path $encryptedFile)) {
        throw "encrypted backup file was not created"
    }
    if ((Get-Item $encryptedFile).Length -le 0) {
        throw "encrypted backup file is empty"
    }

    Remove-Item -LiteralPath $backupFile -Force

    $cutoff = (Get-Date).AddDays(-$retentionDays)
    Get-ChildItem -Path $resolvedBackupDir -Filter "spectron_backup_*.sql.enc" -File |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        Remove-Item -Force

    Write-Host "Encrypted backup created successfully: $encryptedFile"
} catch {
    if (Test-Path $backupFile) {
        Remove-Item -LiteralPath $backupFile -Force -ErrorAction SilentlyContinue
    }
    throw
} finally {
    $env:PGPASSWORD = $previousPGPassword
    [GC]::KeepAlive($backupKey)
}
