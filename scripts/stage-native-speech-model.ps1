# Copy already-downloaded model files to the release handoff, with exact checksum validation.
# No network request and no server deployment. Originals are never modified.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ModelDirectory)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$destinationRoot = Join-Path $projectRoot 'release/voice/native-sensevoice-1.13.7'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $destinationRoot 'manifest.json') | ConvertFrom-Json
& node (Join-Path $PSScriptRoot 'stage-speech-licenses.mjs')
if ($LASTEXITCODE -ne 0) { throw 'License verification/staging failed.' }
foreach ($entry in $manifest.files) {
    $sourcePath = Join-Path $ModelDirectory $entry.name
    $source = Get-Item -LiteralPath $sourcePath
    if ($source.Length -ne $entry.bytes -or
        (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) {
        throw "Source checksum/length mismatch: $($entry.name)"
    }
}
foreach ($entry in $manifest.files) {
    $destination = Join-Path $destinationRoot $entry.name
    if (Test-Path -LiteralPath $destination) {
        if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) {
            throw "Existing staged file differs; not overwritten: $($entry.name)"
        }
    } else {
        Copy-Item -LiteralPath (Join-Path $ModelDirectory $entry.name) -Destination $destination
    }
    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) {
        throw "Staged checksum mismatch: $($entry.name)"
    }
    Write-Output "Verified $($entry.name) ($($entry.bytes) bytes)"
}
Write-Output "Ready for main to deploy (not deployed): $destinationRoot"
