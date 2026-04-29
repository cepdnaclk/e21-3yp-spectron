$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path $root 'frontend'
$backend = Join-Path $root 'backend'
$dataDir = Join-Path $backend '.pgdata'
$logDir = Join-Path $backend 'dev-logs'
$envFile = Join-Path $backend '.env'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$psql = Get-Command psql -ErrorAction Stop
$pgBin = Split-Path -Parent $psql.Source
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$initDb = Join-Path $pgBin 'initdb.exe'
$createdb = Join-Path $pgBin 'createdb.exe'

function Test-PortListening($port) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

if (!(Test-Path $envFile)) {
  Copy-Item -LiteralPath (Join-Path $backend '.env.example') -Destination $envFile
  Write-Host "Created backend/.env from backend/.env.example. Update it if your database or SMTP settings differ."
}

if (!(Test-Path $dataDir)) {
  & $initDb -D $dataDir -U postgres -A trust --encoding=UTF8
}

if (!(Test-PortListening 5432)) {
  & $pgCtl -D $dataDir -o "-p 5432" -l (Join-Path $logDir 'postgres.log') start
  Start-Sleep -Seconds 3
}

$exists = & $psql.Source -U postgres -h localhost -p 5432 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='spectron'"
if ([string]::IsNullOrWhiteSpace($exists)) {
  & $createdb -U postgres -h localhost -p 5432 spectron
}

Push-Location $backend
npm run db:schema
Pop-Location

if (!(Test-PortListening 5000)) {
  Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $backend -RedirectStandardOutput (Join-Path $logDir 'backend.log') -RedirectStandardError (Join-Path $logDir 'backend.err.log') | Out-Null
}

if (!(Test-PortListening 5173)) {
  Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory $frontend -RedirectStandardOutput (Join-Path $logDir 'frontend.log') -RedirectStandardError (Join-Path $logDir 'frontend.err.log') | Out-Null
}

Start-Sleep -Seconds 4

Write-Host ''
Write-Host 'SPECTRON is running:'
Write-Host 'Database:  PostgreSQL on localhost:5432, database spectron'
Write-Host 'Backend:   http://localhost:5000'
Write-Host 'Frontend:  http://127.0.0.1:5173'
Write-Host ''
Write-Host 'Logs:'
Write-Host "Backend:   $logDir\backend.log"
Write-Host "Frontend:  $logDir\frontend.log"
Write-Host "Database:  $logDir\postgres.log"
