# Downloads only the pinned official Android SDK (~49 MB), never the ASR model.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sdkDir = Join-Path $projectRoot 'android/app/libs'
$destination = Join-Path $sdkDir 'sherpa-onnx-1.13.7.aar'
$expected = 'c4ef49e309f24fcee5c106b8a279481aaecaabb078cd37b2cd6e9a62cc8a73c8'
$url = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.7/sherpa-onnx-1.13.7.aar'
if (Test-Path -LiteralPath $destination) {
    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
        throw 'Existing SDK checksum mismatch; retained for inspection, not overwritten.'
    }
    Write-Output 'Official sherpa-onnx 1.13.7 AAR already verified.'
    return
}
New-Item -ItemType Directory -Path $sdkDir -Force | Out-Null
$partial = "$destination.part"
if (Test-Path -LiteralPath $partial) { throw 'An SDK partial download already exists; inspect it before retrying.' }
try {
    Invoke-WebRequest -Uri $url -OutFile $partial -UseBasicParsing -TimeoutSec 240
    if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
        throw 'Downloaded SDK checksum mismatch.'
    }
    Move-Item -LiteralPath $partial -Destination $destination
    Write-Output 'Official sherpa-onnx 1.13.7 AAR downloaded and SHA-256 verified.'
} catch {
    # Only the exact temporary file created by this invocation is removed.
    if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial }
    throw
}
