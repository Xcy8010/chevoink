# Recreate ignored/generated Android inputs from the tracked source and lockfile.
# Does not edit web source, publish, push, or read signing passwords.
[CmdletBinding()]
param([switch]$InstallDependencies)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $projectRoot
try {
    if ($InstallDependencies) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Locked dependency installation failed.' }
    }
    if (!(Test-Path -LiteralPath 'node_modules/@capacitor/cli/bin/capacitor')) {
        throw 'Dependencies are missing. Run with -InstallDependencies for a clean checkout.'
    }
    & node scripts/stage-speech-licenses.mjs --check
    if ($LASTEXITCODE -ne 0) { throw 'License source verification failed.' }
    & (Join-Path $PSScriptRoot 'prepare-android-speech.ps1')
    # This is the unchanged web snapshot used by the shell; main's Web tests are separate.
    & npm.cmd run build:client
    if ($LASTEXITCODE -ne 0) { throw 'Shell web snapshot build failed.' }
    & node node_modules/@capacitor/cli/bin/capacitor sync android
    if ($LASTEXITCODE -ne 0) { throw 'Capacitor Android source sync failed.' }
    Write-Output 'Android generated inputs ready. No build, signing, deployment or push performed.'
} finally { Pop-Location }
