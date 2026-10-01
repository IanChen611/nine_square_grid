# =============================================================
#  結束由 start.ps1 啟動的九九宮格伺服器（Windows）
#
#  只會結束 .server.pid 記錄的那個 npm 及其子程序（node server.js），
#  不會影響電腦上其他 Node 程式。
# =============================================================
$ErrorActionPreference = 'Stop'

$PidFile = Join-Path $PSScriptRoot '.server.pid'

if (-not (Test-Path $PidFile)) {
  Write-Host '伺服器沒有在執行（找不到 .server.pid）。' -ForegroundColor Yellow
  exit 0
}

$serverPid = [int](Get-Content $PidFile -Raw)
if (Get-Process -Id $serverPid -ErrorAction SilentlyContinue) {
  # /T：連同 npm 底下的 node 子程序一起結束
  taskkill /PID $serverPid /T /F | Out-Null
  Write-Host "已結束九九宮格伺服器（PID $serverPid）。" -ForegroundColor Green
} else {
  Write-Host '伺服器已經停止了。' -ForegroundColor Yellow
}
Remove-Item $PidFile -Force
