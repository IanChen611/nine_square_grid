# =============================================================
#  用 npm start 在背景啟動九九宮格伺服器（Windows）
#
#  用法：
#    .\start.ps1               # 預設 port 8081
#    .\start.ps1 -Port 3000
#  記錄檔：server.log / server.err.log（即時看：Get-Content server.log -Wait）
#  結束：.\stop.ps1
# =============================================================
param(
  [int]$Port = 8081
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$PidFile = Join-Path $PSScriptRoot '.server.pid'
$OutLog = Join-Path $PSScriptRoot 'server.log'
$ErrLog = Join-Path $PSScriptRoot 'server.err.log'

# 已經在跑就不重複啟動
if (Test-Path $PidFile) {
  $oldPid = [int](Get-Content $PidFile -Raw)
  if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
    Write-Host "伺服器已經在執行中（PID $oldPid）。要重啟請先執行 .\stop.ps1" -ForegroundColor Yellow
    exit 0
  }
  Remove-Item $PidFile -Force
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Host '找不到 npm，請先安裝 Node.js（https://nodejs.org）' -ForegroundColor Red
  exit 1
}

$inUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($inUse) {
  Write-Host "Port $Port 已被其他程式（PID $($inUse[0].OwningProcess)）佔用，請換一個：.\start.ps1 -Port 3000" -ForegroundColor Red
  exit 1
}

# PowerShell 5.1 的 Start-Process 加上輸出導向時不會帶入 $env:PORT，所以交給 cmd 設定
$proc = Start-Process -FilePath 'cmd.exe' -ArgumentList "/c set PORT=$Port&& npm start" -WorkingDirectory $PSScriptRoot `
  -WindowStyle Hidden -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog -PassThru
Set-Content -Path $PidFile -Value $proc.Id

# 等伺服器開始監聽再回報（直接連 TCP；Invoke-RestMethod 會先做 proxy 偵測，很慢）
$url = "http://localhost:$Port"
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  if ($proc.HasExited) { break }
  $tcp = New-Object System.Net.Sockets.TcpClient
  try {
    $tcp.Connect('127.0.0.1', $Port)
    Write-Host "九九宮格已啟動：$url（PID $($proc.Id)）" -ForegroundColor Green
    Write-Host '結束伺服器：.\stop.ps1'
    exit 0
  } catch { } finally { $tcp.Close() }
}

Write-Host '啟動失敗，請看錯誤記錄：' -ForegroundColor Red
if (Test-Path $ErrLog) { Get-Content $ErrLog -Tail 20 -Encoding UTF8 }
if (-not $proc.HasExited) { taskkill /PID $proc.Id /T /F | Out-Null }
Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
exit 1
