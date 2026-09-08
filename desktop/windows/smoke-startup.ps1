# Runs only on the disposable Windows CI runner; never uses a real user's profile.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Startup smoke is restricted to the disposable CI runner.' }
$binary = Join-Path $PSScriptRoot 'src-tauri/target/release/chevoink-desktop.exe'
$logs = Join-Path $PSScriptRoot 'test-results'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$stderr = Join-Path $logs 'startup-stderr.txt'
$child = Start-Process -FilePath $binary -WindowStyle Hidden -PassThru -RedirectStandardError $stderr
try {
    $deadline = (Get-Date).AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        $child.Refresh()
        if ($child.HasExited) { throw "Desktop exited before startup completed: $($child.ExitCode)" }
        $errorText = Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue
        if ($errorText -match 'startup failed|panicked|PluginInitialization') { throw "Desktop startup failed: $errorText" }
    } while ((Get-Date) -lt $deadline)
    if ($child.MainWindowHandle -eq 0) { throw 'Desktop remained alive but did not create a main window.' }
    Write-Output 'Packaged desktop stayed alive for 30 seconds and created a native window.'
} finally {
    # This PID belongs to the process created above in an isolated runner.
    if (!$child.HasExited) { Stop-Process -Id $child.Id -Force }
}
