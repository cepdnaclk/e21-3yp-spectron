param(
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-RelativeArchivePath {
    param(
        [string]$BasePath,
        [string]$FullPath
    )

    $baseUri = New-Object System.Uri(($BasePath.TrimEnd('\') + '\'))
    $fileUri = New-Object System.Uri($FullPath)
    return $baseUri.MakeRelativeUri($fileUri).ToString()
}

$backendRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $backendRoot "dist"
$stagingDir = Join-Path $distDir "eb-staging"

if (-not $OutputPath) {
    $OutputPath = Join-Path $distDir "spectron-backend-eb.zip"
}

if (Test-Path $stagingDir) {
    Remove-Item -LiteralPath $stagingDir -Recurse -Force
}

if (Test-Path $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
}

New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

$itemsToCopy = @(
    "cmd",
    "internal",
    "datasets",
    ".ebextensions",
    ".platform",
    "go.mod",
    "go.sum",
    "Buildfile",
    "Procfile"
)

foreach ($item in $itemsToCopy) {
    $source = Join-Path $backendRoot $item
    if (-not (Test-Path $source)) {
        throw "Required deployment item not found: $item"
    }

    Copy-Item -LiteralPath $source -Destination $stagingDir -Recurse -Force
}

New-Item -ItemType Directory -Path $distDir -Force | Out-Null

$fileStream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::Create)
try {
    $zip = New-Object System.IO.Compression.ZipArchive($fileStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        $files = Get-ChildItem -LiteralPath $stagingDir -Recurse -File -Force
        foreach ($file in $files) {
            $relativePath = Get-RelativeArchivePath -BasePath $stagingDir -FullPath $file.FullName
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip,
                $file.FullName,
                $relativePath,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    }
    finally {
        $zip.Dispose()
    }
}
finally {
    $fileStream.Dispose()
}

Write-Host "Elastic Beanstalk bundle created:" -ForegroundColor Green
Write-Host "  $OutputPath" -ForegroundColor White
