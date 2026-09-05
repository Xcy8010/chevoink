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

function Get-SshArgumentList {
  param(
    [Parameter(Mandatory = $true)]
    [string]$KeyPath
  )

  return @(
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10",
    "-o", "ConnectionAttempts=1",
    "-i", $KeyPath
  )
}

function Wait-ForSshReady {
  param(
    [Parameter(Mandatory = $true)]
    [string]$KeyPath,
    [Parameter(Mandatory = $true)]
    [string]$UserName,
    [Parameter(Mandatory = $true)]
    [string]$HostName
  )

  $sshArgs = Get-SshArgumentList -KeyPath $KeyPath
  Invoke-RetryCommand -FilePath "ssh.exe" -ArgumentList @(
    $sshArgs +
    @(
      "${UserName}@${HostName}",
      "pwd"
    )
  ) -MaxAttempts 8 -DelaySeconds 3
}

function Upload-ArchiveToRemote {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath,
    [Parameter(Mandatory = $true)]
    [string]$RemoteArchivePath,
    [Parameter(Mandatory = $true)]
    [string]$KeyPath,
    [Parameter(Mandatory = $true)]
    [string]$UserName,
    [Parameter(Mandatory = $true)]
    [string]$HostName,
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
  )

  $sshArgs = Get-SshArgumentList -KeyPath $KeyPath

  try {
    Invoke-RetryCommand -FilePath "scp.exe" -ArgumentList @(
      $sshArgs +
      @(
        $ArchivePath,
        "${UserName}@${HostName}:${RemoteArchivePath}"
      )
    ) -MaxAttempts 3 -DelaySeconds 3
    return
  }
  catch {
    Write-Host "scp upload failed, falling back to sftp..." -ForegroundColor Yellow
  }

  $batchFilePath = Join-Path $ProjectRoot ".deploy-production.sftp-batch.txt"

  try {
    @(
      "put `"$ArchivePath`" $RemoteArchivePath",
      "bye"
    ) | Set-Content -Path $batchFilePath -Encoding ascii

    Invoke-RetryCommand -FilePath "sftp.exe" -ArgumentList @(
      $sshArgs +
      @(
        "-b", $batchFilePath,
        "${UserName}@${HostName}"
      )
    ) -MaxAttempts 3 -DelaySeconds 3
  }
  finally {
    if (Test-Path $batchFilePath) {
      Remove-Item $batchFilePath -Force
    }
  }
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
    Invoke-CheckedCommand -FilePath "npm.cmd" -ArgumentList @("test") -WorkingDirectory $ProjectRoot
    Invoke-CheckedCommand -FilePath "npm.cmd" -ArgumentList @("audit", "--omit=dev", "--audit-level=high") -WorkingDirectory $ProjectRoot
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
    "--exclude=public/voice",
    "--exclude=.local-storage",
    "--exclude=.dbg",
    "--exclude=.git",
    "--exclude=.deploy-production.tar.gz",
    "api",
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
    "vite.config.ts"
  )
  Invoke-CheckedCommand -FilePath "tar.exe" -ArgumentList $TarArgs -WorkingDirectory $ProjectRoot

  Write-Step "Waiting for SSH to become ready"
  Wait-ForSshReady -KeyPath $KeyPath -UserName $UserName -HostName $HostName

  Write-Step "Uploading archive"
  Upload-ArchiveToRemote `
    -ArchivePath $ArchivePath `
    -RemoteArchivePath $RemoteArchivePath `
    -KeyPath $KeyPath `
    -UserName $UserName `
    -HostName $HostName `
    -ProjectRoot $ProjectRoot

  Write-Step "Deploying on remote server"
  $RemoteCommand = @"
set -e
mkdir -p $RemoteCurrentPath
# Overlay the release without deleting the live application's dependencies or runtime files.
# Source-file removals must be handled explicitly, never by clearing the live directory.
tar -xzf $RemoteArchivePath -C $RemoteCurrentPath
cd $RemoteCurrentPath
bash deploy/deploy-production.sh
rm -f $RemoteArchivePath
"@
  $sshArgs = Get-SshArgumentList -KeyPath $KeyPath
  Invoke-RetryCommand -FilePath "ssh.exe" -ArgumentList @(
    $sshArgs +
    @(
      "${UserName}@${HostName}",
      $RemoteCommand
    )
  ) -MaxAttempts 3 -DelaySeconds 3

  Write-Step "Checking API health"
  Invoke-RetryCommand -FilePath "ssh.exe" -ArgumentList @(
    $sshArgs +
    @(
      "${UserName}@${HostName}",
      "curl -fsS http://127.0.0.1:3001/api/health"
    )
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
