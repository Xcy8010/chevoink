param([string]$OutputDirectory = (Join-Path $PSScriptRoot 'test-results'))
$ErrorActionPreference = 'Stop'
$manifest = Join-Path $PSScriptRoot 'src-tauri/Cargo.toml'
$metadataText = & cargo metadata --locked --format-version 1 --filter-platform x86_64-pc-windows-msvc --manifest-path $manifest
if ($LASTEXITCODE -ne 0) { throw 'Unable to resolve the locked Windows dependency graph.' }
$metadata = $metadataText | ConvertFrom-Json
$resolved = @{}
foreach ($node in $metadata.resolve.nodes) { $resolved[$node.id] = $true }
$components = @($metadata.packages | Where-Object { $resolved.ContainsKey($_.id) } | Sort-Object name,version | ForEach-Object {
    if (-not $_.license) { throw "Missing license declaration: $($_.name)" }
    # Keep declared licenses verbatim; do not invent compatibility or copy private local source paths.
    [ordered]@{
        name = $_.name
        version = $_.version
        license = $_.license
        source = $(if ($_.source -like 'registry+*') { "https://crates.io/crates/$($_.name)/$($_.version)" } else { 'repository source' })
    }
})
$report = [ordered]@{
    format = 'chevoink-dependency-inventory-v1'
    target = 'x86_64-pc-windows-msvc'
    lockSha256 = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'src-tauri/Cargo.lock') -Algorithm SHA256).Hash.ToLowerInvariant()
    components = $components
    limitations = @('Declared-license inventory, not a legal compatibility opinion.', 'Does not inventory the separately installed WebView2 runtime, NSIS tools, or remotely served web dependencies.')
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'windows-dependencies.json') -Encoding utf8
$refs = @{}
$bomComponents = @($metadata.packages | Where-Object { $resolved.ContainsKey($_.id) } | Sort-Object name,version | ForEach-Object {
    $reference = "pkg:cargo/$($_.name)@$($_.version)"
    $refs[$_.id] = $reference
    [ordered]@{
        type = $(if ($_.id -eq $metadata.resolve.root) { 'application' } else { 'library' })
        'bom-ref' = $reference
        name = $_.name
        version = $_.version
        purl = $reference
        licenses = @(@{ license = @{ name = $_.license } })
    }
})
$bom = [ordered]@{
    bomFormat = 'CycloneDX'
    specVersion = '1.6'
    serialNumber = "urn:uuid:$([guid]::NewGuid())"
    version = 1
    metadata = @{
        timestamp = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
        properties = @(
            @{ name = 'chevoink:target'; value = 'x86_64-pc-windows-msvc' },
            @{ name = 'chevoink:scope'; value = 'Locked Rust target graph including build dependencies; excludes separately installed WebView2, NSIS toolchain and remote website. Declared licenses, not legal approval.' },
            @{ name = 'chevoink:cargo-lock-sha256'; value = $report.lockSha256 }
        )
    }
    components = $bomComponents
    dependencies = @($metadata.resolve.nodes | ForEach-Object {
        @{ ref = $refs[$_.id]; dependsOn = @($_.dependencies | ForEach-Object { $refs[$_] }) }
    })
}
$bom | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'windows-sbom.cdx.json') -Encoding utf8
Write-Output "Recorded $($components.Count) dependency license declarations."
