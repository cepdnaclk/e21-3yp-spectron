param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$EncryptedBackupPath
)

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

if (-not (Test-Path $EncryptedBackupPath)) {
    throw "encrypted backup file not found: $EncryptedBackupPath"
}

$dbHost = Get-EnvOrDefault "DB_HOST" "localhost"
$dbPort = Get-EnvOrDefault "DB_PORT" "5432"
$dbName = Get-RequiredEnv "DB_NAME"
$dbUser = Get-RequiredEnv "DB_USER"
$dbPassword = Get-RequiredEnv "DB_PASSWORD"
$backupKey = Get-RequiredEnv "BACKUP_ENCRYPTION_KEY"

$psql = Get-CommandPath "psql"
$openssl = Get-CommandPath "openssl"
$tempSql = Join-Path ([System.IO.Path]::GetTempPath()) ("spectron_restore_{0}.sql" -f ([guid]::NewGuid().ToString("N")))
$previousPGPassword = $env:PGPASSWORD

try {
    Write-Warning "This will restore into database '$dbName' on '${dbHost}:$dbPort'. Existing data may be overwritten."
    $confirmation = Read-Host "Type RESTORE to continue"
    if ($confirmation -ne "RESTORE") {
        Write-Host "Restore cancelled."
        return
    }

    Write-Host "Decrypting backup to a temporary file"
    & $openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 `
        -pass env:BACKUP_ENCRYPTION_KEY `
        -in $EncryptedBackupPath `
        -out $tempSql

    if ($LASTEXITCODE -ne 0) {
        throw "backup decryption failed"
    }
    if (-not (Test-Path $tempSql) -or (Get-Item $tempSql).Length -le 0) {
        throw "temporary decrypted backup is missing or empty"
    }

    $env:PGPASSWORD = $dbPassword
    Write-Host "Restoring PostgreSQL backup"
    & $psql `
        --host $dbHost `
        --port $dbPort `
        --username $dbUser `
        --dbname $dbName `
        --set ON_ERROR_STOP=1 `
        --file $tempSql

    if ($LASTEXITCODE -ne 0) {
        throw "psql restore failed"
    }

    Write-Host "Restore completed successfully."
} finally {
    if (Test-Path $tempSql) {
        Remove-Item -LiteralPath $tempSql -Force -ErrorAction SilentlyContinue
    }
    $env:PGPASSWORD = $previousPGPassword
    [GC]::KeepAlive($backupKey)
}
