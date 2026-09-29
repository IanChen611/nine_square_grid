#!/bin/sh
# =============================================================
#  一鍵更新（在 NAS 上執行，不要加 sudo）：git pull → 重啟背景服務
# =============================================================
set -e
APP_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$APP_DIR"
INIT=/usr/local/etc/init.d/S99nine-grid

echo "==> 取得最新版 (git pull)"
if [ "$(id -u)" = 0 ] && [ -n "$SUDO_USER" ]; then
  su "$SUDO_USER" -c "cd '$APP_DIR' && git pull"
else
  git pull
fi

echo "==> 重啟服務"
if [ "$(id -u)" = 0 ]; then
  "$INIT" stop 2>/dev/null || true; sleep 1; "$INIT" start
else
  sudo "$INIT" stop 2>/dev/null || true; sleep 1; sudo "$INIT" start
fi

echo "✅ 完成！用  tail -f $APP_DIR/app.log  看記錄。"
