# Create Mock Controller + Sensor for Pairing Tests
# This script seeds one mock controller and one temperature/humidity sensor in backend DB.

Write-Host "Creating mock controller and sensor..." -ForegroundColor Green

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

if (-not $env:DATABASE_URL -and -not $env:DB_HOST) {
    $env:DATABASE_URL = "postgres://spectron:spectron@localhost:5432/spectron?sslmode=disable"
    Write-Host "DATABASE_URL not set. Using local default database." -ForegroundColor Yellow
} elseif ($env:DATABASE_URL) {
    Write-Host "Using DATABASE_URL from environment." -ForegroundColor Yellow
} else {
    Write-Host "Using DB_* environment variables from environment." -ForegroundColor Yellow
}

try {
    go run cmd\mock-controller\main.go
    if ($LASTEXITCODE -eq 0) {
        Write-Host "" 
        Write-Host "Done. Use QR ID CTRL-MOCK-001 in the web scanner." -ForegroundColor Cyan
    } else {
        Write-Host "Failed to create mock controller." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
