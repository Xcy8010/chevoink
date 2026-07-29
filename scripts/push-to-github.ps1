<#
  一键把「启创墨域」项目推送到 GitHub，支持打 Tag 与发布 Release（可附安卓 APK）。

  用法：
    powershell -ExecutionPolicy Bypass -File scripts\push-to-github.ps1
    powershell -ExecutionPolicy Bypass -File scripts\push-to-github.ps1 -Message "feat: 作者页优化"
    powershell -ExecutionPolicy Bypass -File scripts\push-to-github.ps1 -Tag v1.01 -ReleaseAsset "C:\path\app-release.apk" -ReleaseNotes "更新说明"

  前置条件：
    - 本机已配置可访问 GitHub 的 SSH 私钥（git@github.com 免密）
    - .gitignore 已排除 .env / cookies.txt / plan / cert / *.pem / *.keystore 等敏感文件
    - 发布 Release 需要凭证（二选一，缺失则只推代码和 Tag、跳过 Release）：
        1) 已安装并登录 gh CLI
        2) 环境变量 GITHUB_TOKEN（具备 repo 权限的 PAT）
#>
[CmdletBinding()]
param(
  [string]$Message = "",
  [string]$Branch = "main",
  [string]$Remote = "git@github.com:Xcy8010/chevoink.git",
  [string]$Tag = "",
  [string]$ReleaseAsset = "",
  [string]$ReleaseNotes = ""
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Write-Warn($text) { Write-Host "!!  $text" -ForegroundColor Yellow }

# 切到脚本所在仓库根（scripts 的上一级目录），确保任意位置调用都正确
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
Write-Step "仓库根目录：$repoRoot"

# 1. 校验是否在 Git 仓库内
if ((git rev-parse --is-inside-work-tree 2>$null) -ne "true") {
  throw "当前目录不是 Git 仓库，已中止。"
}

# 2. 确保 origin 指向目标仓库（不存在则新增，不一致则更新）
$existing = (git remote get-url origin 2>$null)
if (-not $existing) {
  Write-Step "未找到 origin，新增远程 → $Remote"
  git remote add origin $Remote
} elseif ($existing.Trim() -ne $Remote) {
  Write-Step "更新 origin：$($existing.Trim()) → $Remote"
  git remote set-url origin $Remote
} else {
  Write-Step "origin 已是目标仓库：$Remote"
}

# 3. 安全防线：内部资料目录若曾被跟踪，从索引移除（本地文件保留）
foreach ($dir in @("plan", "cert")) {
  if (git ls-files -- $dir) {
    Write-Step "从 Git 索引移除内部资料目录：$dir（本地文件保留）"
    git rm -r -q --cached -- $dir | Out-Null
  }
}

# 4. 暂存全部改动
Write-Step "暂存改动 (git add -A)"
git add -A
if ($LASTEXITCODE -ne 0) { throw "git add 失败。" }

# 5. 有改动才提交；工作区干净则跳过
$pending = git status --porcelain
if ([string]::IsNullOrWhiteSpace(($pending | Out-String))) {
  Write-Step "工作区没有新的改动，跳过 commit。"
} else {
  if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "chore: sync " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
  }
  Write-Step "提交：$Message"
  git commit -m "$Message"
  if ($LASTEXITCODE -ne 0) { throw "git commit 失败。" }
}

# 6. 推送到远程（-u 建立跟踪，便于后续直接 git push）
Write-Step "推送到 origin/$Branch"
git push -u origin $Branch
if ($LASTEXITCODE -ne 0) { throw "git push 失败，请检查 SSH 凭证或网络后重试。" }

# 7. 打 Tag 并推送（已存在则复用，不重复创建）
if ($Tag) {
  if (git tag -l $Tag) {
    Write-Step "Tag $Tag 已存在，跳过创建"
  } else {
    Write-Step "创建 Tag：$Tag"
    git tag -a $Tag -m "Release $Tag"
    if ($LASTEXITCODE -ne 0) { throw "git tag 失败。" }
  }
  Write-Step "推送 Tag 到远程"
  git push origin $Tag
  if ($LASTEXITCODE -ne 0) { throw "git push tag 失败。" }
}

# 8. 发布 GitHub Release（附带 APK 等资产）
if ($Tag) {
  # 从远程地址解析 owner/repo
  $repoPath = ""
  if ($Remote -match "github\.com[:/](.+?)(\.git)?$") { $repoPath = $Matches[1] }
  if (-not $repoPath) { throw "无法从远程地址解析 owner/repo：$Remote" }

  if ($ReleaseAsset -and -not (Test-Path $ReleaseAsset)) {
    throw "Release 资产文件不存在：$ReleaseAsset"
  }
  if (-not $ReleaseNotes) { $ReleaseNotes = "Release $Tag" }

  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if ($gh) {
    # 优先走 gh CLI
    $null = gh release view $Tag --repo $repoPath 2>$null
    if ($LASTEXITCODE -eq 0) {
      Write-Step "Release $Tag 已存在"
      if ($ReleaseAsset) {
        Write-Step "上传资产（覆盖同名）：$ReleaseAsset"
        gh release upload $Tag $ReleaseAsset --repo $repoPath --clobber
        if ($LASTEXITCODE -ne 0) { throw "gh release upload 失败。" }
      }
    } else {
      Write-Step "创建 Release：$Tag"
      $ghArgs = @("release", "create", $Tag, "--repo", $repoPath, "--title", $Tag, "--notes", $ReleaseNotes)
      if ($ReleaseAsset) { $ghArgs += $ReleaseAsset }
      gh @ghArgs
      if ($LASTEXITCODE -ne 0) { throw "gh release create 失败。" }
    }
  } elseif ($env:GITHUB_TOKEN) {
    # 无 gh CLI 时用 REST API
    $headers = @{
      Authorization = "Bearer $($env:GITHUB_TOKEN)"
      Accept        = "application/vnd.github+json"
      "User-Agent"  = "chevoink-push-script"
    }
    $apiBase = "https://api.github.com/repos/$repoPath"

    $release = $null
    try {
      $release = Invoke-RestMethod -Method Get -Uri "$apiBase/releases/tags/$Tag" -Headers $headers
      Write-Step "Release $Tag 已存在"
    } catch {
      Write-Step "创建 Release：$Tag"
      $body = @{ tag_name = $Tag; name = $Tag; body = $ReleaseNotes } | ConvertTo-Json
      $release = Invoke-RestMethod -Method Post -Uri "$apiBase/releases" -Headers $headers `
        -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))
    }

    if ($ReleaseAsset) {
      $assetName = Split-Path -Leaf $ReleaseAsset
      # 已有同名资产先删除，避免上传 422
      foreach ($asset in @($release.assets)) {
        if ($asset.name -eq $assetName) {
          Write-Step "删除已存在的同名资产：$assetName"
          Invoke-RestMethod -Method Delete -Uri "$apiBase/releases/assets/$($asset.id)" -Headers $headers | Out-Null
        }
      }
      Write-Step "上传资产：$assetName"
      $uploadUri = "https://uploads.github.com/repos/$repoPath/releases/$($release.id)/assets?name=$([uri]::EscapeDataString($assetName))"
      Invoke-RestMethod -Method Post -Uri $uploadUri -Headers $headers `
        -ContentType "application/vnd.android.package-archive" -InFile $ReleaseAsset | Out-Null
    }
  } else {
    Write-Warn "未检测到 gh CLI 或 GITHUB_TOKEN，已跳过 Release 发布。"
    Write-Warn "补发方式：设置环境变量 GITHUB_TOKEN 后重跑本脚本（相同参数），代码与 Tag 不会重复提交。"
  }
}

Write-Step "完成 ✅  已推送到 $Remote（分支：$Branch$(if ($Tag) { "，Tag：$Tag" }))"
