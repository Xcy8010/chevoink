<#
  一键把「启创墨域」项目推送到 GitHub 仓库。

  用法：
    powershell -ExecutionPolicy Bypass -File scripts\push-to-github.ps1
    powershell -ExecutionPolicy Bypass -File scripts\push-to-github.ps1 -Message "feat: 作者页优化"
    powershell -ExecutionPolicy Bypass -File scripts\push-to-github.ps1 -Branch main

  前置条件：
    - 本机已配置可访问 GitHub 的 SSH 私钥（git@github.com 免密）
    - .gitignore 已排除 .env / cookies.txt / *.pem / *.tar.gz 等敏感文件
#>
[CmdletBinding()]
param(
  [string]$Message = "",
  [string]$Branch = "main",
  [string]$Remote = "git@github.com:Xcy8010/chevoink.git"
)

$ErrorActionPreference = "Stop"

function Write-Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }

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

# 3. 暂存全部改动
Write-Step "暂存改动 (git add -A)"
git add -A
if ($LASTEXITCODE -ne 0) { throw "git add 失败。" }

# 4. 有改动才提交；工作区干净则跳过
$pending = git status --porcelain
if ([string]::IsNullOrWhiteSpace($pending)) {
  Write-Step "工作区没有新的改动，跳过 commit。"
} else {
  if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "chore: sync " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
  }
  Write-Step "提交：$Message"
  git commit -m "$Message"
  if ($LASTEXITCODE -ne 0) { throw "git commit 失败。" }
}

# 5. 推送到远程（-u 建立跟踪，便于后续直接 git push）
Write-Step "推送到 origin/$Branch"
git push -u origin $Branch
if ($LASTEXITCODE -ne 0) { throw "git push 失败，请检查 SSH 凭证或网络后重试。" }

Write-Step "完成 ✅  已推送到 $Remote（分支：$Branch）"
