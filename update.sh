#!/bin/sh
# =============================================================
#  一鍵更新（在 NAS 上執行，不要加 sudo）：
#    git pull → 重新安裝開機腳本 → 重啟服務 → 確認網站有回應
# =============================================================
set -e
APP_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$APP_DIR"
INIT=/usr/local/etc/init.d/S99nine-grid
PORT="${PORT:-8081}"

echo "==> 取得最新版 (git pull)"
if [ "$(id -u)" = 0 ] && [ -n "$SUDO_USER" ]; then
  su "$SUDO_USER" -c "cd '$APP_DIR' && git pull"
else
  git pull
fi

SUDO=sudo
[ "$(id -u)" = 0 ] && SUDO=

echo "==> 更新開機腳本 $INIT"
$SUDO cp "$APP_DIR/nine-grid.init" "$INIT"
$SUDO chmod +x "$INIT"

echo "==> 重啟服務"
$SUDO "$INIT" restart

echo "==> 確認網站有回應（http://127.0.0.1:$PORT）"
sleep 2
if wget -q -O - "http://127.0.0.1:$PORT/api/health" 2>/dev/null || curl -fsS "http://127.0.0.1:$PORT/api/health" 2>/dev/null; then
  echo ""
  echo "✅ 完成！服務正常。"
else
  echo "❌ 網站沒有回應，最近的記錄："
  tail -n 15 "$APP_DIR/app.log"
  exit 1
fi
