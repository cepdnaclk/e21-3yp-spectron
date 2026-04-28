# Start Spectron Backend Server
# This script starts the Go backend server

Write-Host "Starting Spectron backend..." -ForegroundColor Green

# Navigate to project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

function Import-DotEnvFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) {
            return
        }

        $parts = $line.Split('=', 2)
        if ($parts.Count -ne 2) {
            return
        }

        $key = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")

        if ($key) {
            [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
}

$backendEnvPath = Join-Path $projectRoot ".env"
Import-DotEnvFile -Path $backendEnvPath

$backendLocalEnvPath = Join-Path $projectRoot ".env.local"
Import-DotEnvFile -Path $backendLocalEnvPath

$databaseEnvPath = Join-Path $projectRoot "..\database\.env"
Import-DotEnvFile -Path $databaseEnvPath

# Check if Go is installed
try {
    $goVersion = go version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Go is not installed or not in PATH" -ForegroundColor Red
        Write-Host "Please install Go from https://go.dev/dl/" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "Go version: $goVersion" -ForegroundColor Cyan
} catch {
    Write-Host "ERROR: Go is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Go from https://go.dev/dl/" -ForegroundColor Yellow
    exit 1
}

# Check if port 8080 is in use (common system service port)
$port8080InUse = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
if ($port8080InUse) {
    Write-Host "NOTE: Port 8080 is in use by another process" -ForegroundColor Yellow
    Write-Host "Using port 8081 instead. Set HTTP_PORT environment variable to use a different port." -ForegroundColor Cyan
    $env:HTTP_PORT = "8081"
} else {
    $env:HTTP_PORT = "8080"
}

# Check if the selected port is in use and stop existing backend processes
$selectedPort = $env:HTTP_PORT
$portInUse = Get-NetTCPConnection -LocalPort $selectedPort -ErrorAction SilentlyContinue
if ($portInUse) {
    $processes = $portInUse | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processes) {
        $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($proc) {
            if ($proc.ProcessName -eq "main" -or $proc.Path -like "*go-build*" -or $proc.Path -like "*spectron*") {
                Write-Host "Found existing backend process (PID: $processId) on port $selectedPort" -ForegroundColor Yellow
                Write-Host "Stopping existing backend process..." -ForegroundColor Cyan
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 3
                Write-Host "Existing process stopped." -ForegroundColor Green
            } else {
                Write-Host "WARNING: Port $selectedPort is in use by process $processId ($($proc.ProcessName))" -ForegroundColor Yellow
                Write-Host "This might not be a backend process. You may need to stop it manually." -ForegroundColor Yellow
            }
        }
    }
    # Double-check port is free
    Start-Sleep -Seconds 1
    $stillInUse = Get-NetTCPConnection -LocalPort $selectedPort -ErrorAction SilentlyContinue
    if ($stillInUse) {
        Write-Host "WARNING: Port $selectedPort is still in use. Trying to stop all processes on this port..." -ForegroundColor Red
        $allProcesses = $stillInUse | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($processId in $allProcesses) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
    }
}

# Set database URL if not already set
if (-not $env:DATABASE_URL) {
    if ($env:DB_HOST -and $env:DB_PORT -and $env:DB_USER -and $env:DB_NAME) {
        $dbPassword = $env:DB_PASSWORD
        if (-not $dbPassword) {
            $dbPassword = "spectron"
        }
        $env:DATABASE_URL = "postgres://$($env:DB_USER):$dbPassword@$($env:DB_HOST):$($env:DB_PORT)/$($env:DB_NAME)?sslmode=disable"
    } else {
        $env:DATABASE_URL = "postgres://spectron:spectron@localhost:5432/spectron?sslmode=disable"
    }
    Write-Host "Using default database URL: $env:DATABASE_URL" -ForegroundColor Cyan
}

# Download dependencies if needed
Write-Host "Checking dependencies..." -ForegroundColor Cyan
go mod download 2>&1 | Out-Null
go mod tidy 2>&1 | Out-Null

# Start the server
Write-Host ""
Write-Host "Starting backend server on port $env:HTTP_PORT..." -ForegroundColor Green
Write-Host "Health check: http://localhost:$env:HTTP_PORT/healthz" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

go run cmd\api\main.go
