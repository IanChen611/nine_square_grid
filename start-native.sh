#!/bin/sh
# =============================================================
#  原生啟動九九宮格（不用 Docker）。
#  特色：node 若當掉會自動重開；所有輸出寫進 app.log。
#
#  Node 的位置（依序找）：
#    1) 本專案的 .node/bin/node
#    2) 旁邊 Stock_Recrod 專案已裝好的 .node/bin/node（共用，不用再裝一次）
#  埠號預設 8081（8080 已給 Stock_Recrod 用），要改可設環境變數 PORT。
# =============================================================
APP_DIR=$(cd "$(dirname "$0")" && pwd)
LOG="$APP_DIR/app.log"
export PORT="${PORT:-8081}"

NODE="$APP_DIR/.node/bin/node"
[ -x "$NODE" ] || NODE="$APP_DIR/../Stock_Recrod/.node/bin/node"
if [ ! -x "$NODE" ]; then
  echo "找不到 Node，請見 DEPLOY.md 第二步"
  exit 1
fi

cd "$APP_DIR" || exit 1

while true; do
  echo "$(date '+%F %T') ==> 啟動 app (port $PORT)" >> "$LOG"
  "$NODE" "$APP_DIR/server.js" >> "$LOG" 2>&1
  echo "$(date '+%F %T') <== app 結束（exit=$?），2 秒後重啟" >> "$LOG"
  sleep 2
done
