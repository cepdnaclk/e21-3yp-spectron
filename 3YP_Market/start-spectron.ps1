$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path $root 'frontend'
$backend = Join-Path $root 'backend'
$dataDir = Join-Path $backend '.pgdata'
$logDir = Join-Path $backend 'dev-logs'
$envFile = Join-Path $backend '.env'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Resolve-PostgresBinDirectory {
  $candidateBins = @()

  $command = Get-Command psql -ErrorAction SilentlyContinue
  if ($command) {
    $candidateBins += Split-Path -Parent $command.Source
  }

  $command = Get-Command pg_ctl -ErrorAction SilentlyContinue
  if ($command) {
    $candidateBins += Split-Path -Parent $command.Source
  }

  $commonRoots = @(
    $env:ProgramFiles,
    ${env:ProgramFiles(x86)},
    'C:\PostgreSQL'
  ) | Where-Object { $_ -and (Test-Path $_) }

  foreach ($rootPath in $commonRoots) {
    $candidateBins += @(
      Get-ChildItem -Path (Join-Path $rootPath 'PostgreSQL*\bin') -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
      Get-ChildItem -Path (Join-Path $rootPath 'PostgreSQL*') -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName 'bin' }
      Get-ChildItem -Path $rootPath -Recurse -Filter 'psql.exe' -ErrorAction SilentlyContinue |
        ForEach-Object { Split-Path -Parent $_.FullName }
    )
  }

  foreach ($binPath in ($candidateBins | Select-Object -Unique)) {
    if (!(Test-Path $binPath)) {
      continue
    }

    $requiredExecutables = @('psql.exe', 'pg_ctl.exe', 'initdb.exe', 'createdb.exe')
    $hasAllTools = $requiredExecutables | ForEach-Object { Test-Path (Join-Path $binPath $_) } | Where-Object { -not $_ } | Measure-Object | Select-Object -ExpandProperty Count

    if ($hasAllTools -eq 0) {
      return $binPath
    }
  }

  throw 'Could not find PostgreSQL tools. Install PostgreSQL or add its bin directory to PATH.'
}

$pgBin = Resolve-PostgresBinDirectory
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$initDb = Join-Path $pgBin 'initdb.exe'
$createdb = Join-Path $pgBin 'createdb.exe'
$psql = Join-Path $pgBin 'psql.exe'
$env:PSQL_PATH = $psql

function Get-EnvValue($path, $name) {
  if (!(Test-Path $path)) {
    return $null
  }

  $match = Select-String -LiteralPath $path -Pattern "^$([regex]::Escape($name))\s*=\s*(.+)$" | Select-Object -First 1

  if (!$match) {
    return $null
  }

  $value = $match.Matches[0].Groups[2].Value
  return $value.Trim().Trim('"')
}

function Get-DatabaseNameFromUrl($connectionString, $fallback) {
  if ([string]::IsNullOrWhiteSpace($connectionString)) {
    return $fallback
  }

  try {
    $uri = [Uri]($connectionString -replace '^postgresql://', 'postgres://')
    $databaseName = $uri.AbsolutePath.Trim('/')
    if ([string]::IsNullOrWhiteSpace($databaseName)) {
      return $fallback
    }

    return $databaseName
  } catch {
    return $fallback
  }
}

function Test-PortListening($port) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

if (!(Test-Path $envFile)) {
  Copy-Item -LiteralPath (Join-Path $backend '.env.example') -Destination $envFile
  Write-Host "Created backend/.env from backend/.env.example. Update it if your database or SMTP settings differ."
}

$databaseUrl = Get-EnvValue $envFile 'DATABASE_URL'
$databaseName = Get-DatabaseNameFromUrl $databaseUrl 'spectron'

if (!(Test-Path $dataDir)) {
  & $initDb -D $dataDir -U postgres -A trust --encoding=UTF8
}

if (!(Test-PortListening 5432)) {
  & $pgCtl -D $dataDir -o "-p 5432" -l (Join-Path $logDir 'postgres.log') start
  Start-Sleep -Seconds 3
}

$escapedDatabaseName = $databaseName.Replace("'", "''")
$exists = & $psql -U postgres -h localhost -p 5432 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$escapedDatabaseName'"
if ([string]::IsNullOrWhiteSpace($exists)) {
  & $createdb -U postgres -h localhost -p 5432 $databaseName
}

Push-Location $backend
$schemaProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'db:schema') -WorkingDirectory $backend -Wait -PassThru -NoNewWindow
$schemaExitCode = $schemaProcess.ExitCode
Pop-Location

if ($schemaExitCode -ne 0) {
  throw "Schema application failed with exit code $schemaExitCode. Check backend\dev-logs and the database connection settings."
}

if (!(Test-PortListening 5000)) {
  Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $backend -RedirectStandardOutput (Join-Path $logDir 'backend.log') -RedirectStandardError (Join-Path $logDir 'backend.err.log') | Out-Null
}

if (!(Test-PortListening 5173)) {
  Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory $frontend -RedirectStandardOutput (Join-Path $logDir 'frontend.log') -RedirectStandardError (Join-Path $logDir 'frontend.err.log') | Out-Null
}

Start-Sleep -Seconds 4

Write-Host ''
Write-Host 'SPECTRON is running:'
Write-Host "Database:  PostgreSQL on localhost:5432, database $databaseName"
Write-Host 'Backend:   http://localhost:5000'
Write-Host 'Frontend:  http://127.0.0.1:5173'
Write-Host ''
Write-Host 'Logs:'
Write-Host "Backend:   $logDir\backend.log"
Write-Host "Frontend:  $logDir\frontend.log"
Write-Host "Database:  $logDir\postgres.log"
