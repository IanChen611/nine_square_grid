# ⭕ 九九宮格（雙人連線對戰）

9×9 的井字遊戲變體，兩個人用各自的手機／電腦連到同一個網址對戰。

## 規則

- 棋盤是 3×3 個大格，每個大格裡是一個小九宮格（共 81 格）。
- 你下在小九宮格的**哪個位置**，對手下一步就只能下在**同位置的大格**。
  例：你下在某小格的「左上」→ 對手只能下在「左上」那個大格。
- 被指定的大格若已下滿，可任選大格。
- **先在任何一個小九宮格裡連成一線（橫、直、斜）就獲勝。** 81 格下滿則平手。
- 房間內有**即時聊天室**，玩家和觀戰者都可以發言。

## 技術

- **後端**：`server.js`，只用 Node 內建模組（**零 npm 套件**），相容 Node 16 / 32 位元 ARM。
- **即時同步**：Server-Sent Events（`GET /api/events`），下棋等動作用 `POST /api/*`；所有規則都在伺服器端驗證。
- **前端**：`public/index.html` 單一檔案，不需打包，支援手機與深色模式。
- 房間與聊天紀錄存在記憶體中，不需要資料庫。

各版本新增的功能見 **[CHANGELOG.md](CHANGELOG.md)**。

## 本機執行

```bash
node server.js          # http://localhost:8081
PORT=3000 node server.js
```

Windows 可以用 PowerShell 腳本在背景啟動／結束（內部執行 `npm start`）：

```powershell
.\start.ps1              # http://localhost:8081
.\start.ps1 -Port 3000
.\stop.ps1               # 只結束這個伺服器，不影響其他 Node 程式
```

輸出記錄在 `server.log`／`server.err.log`。若出現「無法載入，因為這個系統上已停用指令碼執行」，先執行一次
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`。

## 部署到 NAS

見 **[DEPLOY.md](DEPLOY.md)**（與 Stock_Recrod 相同的原生跑法，可直接共用它裝好的 Node 16）。
