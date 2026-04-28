function Import-DotEnvFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $parts = $line.Split('=', 2)
    if ($parts.Count -ne 2) { return }
    [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim().Trim('"').Trim("'"), 'Process')
  }
}
Import-DotEnvFile '.env'
Import-DotEnvFile '.env.local'
Import-DotEnvFile '..\database\.env'
$env:HTTP_PORT='8080'
if (-not $env:DATABASE_URL) { $env:DATABASE_URL='postgres://spectron:spectron@localhost:5432/spectron?sslmode=disable' }
go run cmd\api\main.go
