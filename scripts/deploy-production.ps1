param(
  [string]$HostName = "124.223.188.123",
  [string]$UserName = "ubuntu",
  [string]$KeyPath = "$HOME\.ssh\chevoink_prod_sh_01.pem",
  [string]$RemoteArchivePath = "/tmp/chevoink-deploy.tar.gz",
  [string]$RemoteCurrentPath = "/opt/chevoink/app/current",
  [string]$PublicUrl = "https://chevoink.chevolink.com",
  [switch]$SkipLocalChecks
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList,
    [string]$WorkingDirectory
  )

  if ($WorkingDirectory) {
    Push-Location $WorkingDirectory
  }

  try {
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $FilePath $($ArgumentList -join ' ')"
    }
  }
  finally {
    if ($WorkingDirectory) {
      Pop-Location
    }
  }
}

function Invoke-RetryCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList,
    [int]$MaxAttempts = 6,
    [int]$DelaySeconds = 2
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      & $FilePath @ArgumentList
      if ($LASTEXITCODE -eq 0) {
        return
      }
    }
    catch {
      if ($attempt -eq $MaxAttempts) {
        throw
      }
    }

    if ($attempt -lt $MaxAttempts) {
      Start-Sleep -Seconds $DelaySeconds
    }
  }

  throw "Command failed after $MaxAttempts attempts: $FilePath $($ArgumentList -join ' ')"
}

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ArchivePath = Join-Path $ProjectRoot ".deploy-production.tar.gz"

if (-not (Test-Path $KeyPath)) {
  throw "SSH key not found: $KeyPath"
}

try {
  if (-not $SkipLocalChecks) {
    Write-Step "Running local checks"
    Invoke-CheckedCommand -FilePath "npm.cmd" -ArgumentList @("run", "check") -WorkingDirectory $ProjectRoot
    Invoke-CheckedCommand -FilePath "npm.cmd" -ArgumentList @("run", "build") -WorkingDirectory $ProjectRoot
  }

  Write-Step "Packing release archive"
  if (Test-Path $ArchivePath) {
    Remove-Item $ArchivePath -Force
  }

  $TarArgs = @(
    "-czf", $ArchivePath,
    "--exclude=node_modules",
    "--exclude=dist",
    "--exclude=.local-storage",
    "--exclude=.dbg",
    "--exclude=.git",
    "--exclude=.deploy-production.tar.gz",
    "api",
    "cert",
    "deploy",
    "plan",
    "prisma",
    "public",
    "scripts",
    "shared",
    "src",
    ".env.example",
    ".gitignore",
    "ecosystem.config.cjs",
    "eslint.config.js",
    "index.html",
    "nodemon.json",
    "package-lock.json",
    "package.json",
    "postcss.config.js",
    "start-local-server.bat",
    "tailwind.config.js",
    "tsconfig.json",
    "vercel.json",
    "vite.config.ts"
  )
  Invoke-CheckedCommand -FilePath "tar.exe" -ArgumentList $TarArgs -WorkingDirectory $ProjectRoot

  Write-Step "Uploading archive"
  Invoke-CheckedCommand -FilePath "scp.exe" -ArgumentList @(
    "-i", $KeyPath,
    $ArchivePath,
    "${UserName}@${HostName}:${RemoteArchivePath}"
  )

  Write-Step "Deploying on remote server"
  $RemoteCommand = @"
set -e
mkdir -p $RemoteCurrentPath
find $RemoteCurrentPath -mindepth 1 -maxdepth 1 -exec rm -rf {} +
tar -xzf $RemoteArchivePath -C $RemoteCurrentPath
cd $RemoteCurrentPath
bash deploy/deploy-production.sh
rm -f $RemoteArchivePath
"@
  Invoke-CheckedCommand -FilePath "ssh.exe" -ArgumentList @(
    "-i", $KeyPath,
    "${UserName}@${HostName}",
    $RemoteCommand
  )

  Write-Step "Checking API health"
  Invoke-RetryCommand -FilePath "ssh.exe" -ArgumentList @(
    "-i", $KeyPath,
    "${UserName}@${HostName}",
    "curl -fsS http://127.0.0.1:3001/api/health"
  ) -MaxAttempts 10 -DelaySeconds 2

  Write-Step "Checking public site"
  Invoke-RetryCommand -FilePath "curl.exe" -ArgumentList @(
    "-I",
    $PublicUrl
  ) -MaxAttempts 6 -DelaySeconds 2

  Write-Host ""
  Write-Host "Deployment finished successfully." -ForegroundColor Green
}
finally {
  if (Test-Path $ArchivePath) {
    Remove-Item $ArchivePath -Force
  }
}
