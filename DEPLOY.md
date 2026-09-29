# 🏠 部署到 NAS（ASUSTOR AS1002T，原生跑法）

跟 Stock_Recrod 一樣的做法：**不用 Docker、直接在 NAS 上跑 Node 16**。
這個遊戲**沒有任何 npm 套件、不用資料庫、不用打包前端**，所以部署非常簡單。

完成後，家裡 Wi-Fi 下的任何裝置開 **http://192.168.1.200:8081** 就能玩。
（8080 已經給 Stock_Recrod 用了，所以這裡用 **8081**。）

---

## 第一步：把程式放到 NAS

SSH 進 NAS，clone 到 Stock_Recrod 的**旁邊**：

```bash
cd /volume1/home/ian
git clone https://github.com/IanChen611/nine_square_grid.git
```

目錄會長這樣：

```
/volume1/home/ian/
├─ Stock_Recrod/
│  └─ .node/          ← 已經裝好的 Node 16
└─ nine_square_grid/  ← 這個遊戲
```

## 第二步：Node（通常什麼都不用做）

`start-native.sh` 會自動找 Node，順序是：

1. `nine_square_grid/.node/bin/node`
2. `../Stock_Recrod/.node/bin/node` ← **直接共用 Stock_Recrod 裝好的那份**

所以只要 Stock_Recrod 已經照它的 DEPLOY.md 裝好 Node 16，這步就跳過。
若想獨立一份，照 Stock_Recrod DEPLOY.md 第二步的指令，把 `.node` 裝進 `nine_square_grid/` 即可。

## 第三步：手動測試

```bash
cd /volume1/home/ian/nine_square_grid
PORT=8081 ../Stock_Recrod/.node/bin/node server.js
```

看到 **`🎮 九九宮格已啟動： http://localhost:8081`** 後，用手機開
**http://192.168.1.200:8081** 看看。確認 OK 按 **Ctrl+C** 停掉。

## 第四步：開機自動啟動 + 當掉自動重開

1. 建立開機腳本：

   ```bash
   sudo vi /usr/local/etc/init.d/S99nine-grid
   ```

   貼入：

   ```sh
   #!/bin/sh
   APP=/volume1/home/ian/nine_square_grid/start-native.sh
   case "$1" in
     ""|start) nohup sh "$APP" >/dev/null 2>&1 & ;;
     stop)     pkill -f nine_square_grid/start-native.sh; pkill -f nine_square_grid/server.js ;;
   esac
   ```

   > ⚠️ **不要**用 `pkill -f server.js` —— Stock_Recrod 的後端也叫 `server.js`，會被一起砍掉。
   > 上面用含資料夾名稱的完整路徑比對，只會停掉這個遊戲。

2. 給執行權限並啟動：

   ```bash
   sudo chmod +x /usr/local/etc/init.d/S99nine-grid
   sudo /usr/local/etc/init.d/S99nine-grid start
   ```

3. 確認：

   ```bash
   tail -f /volume1/home/ian/nine_square_grid/app.log
   ```

> 若重開機後沒自動起來，跟 Stock_Recrod 一樣改用 ADM **排程任務** 的「開機」觸發，
> 內容填 `/volume1/home/ian/nine_square_grid/start-native.sh`。

---

## 怎麼玩

1. A 開 **http://192.168.1.200:8081**，輸入暱稱 →「建立新房間」。
2. 按「複製邀請連結」傳給 B（或直接跟 B 說 4 碼房號）。
3. B 打開連結、輸入暱稱就加入。先進來的是 **X**，第二位是 **O**，之後進來的人是觀戰。
4. 每局結束按「再來一局」，先手會輪流。

- 同一台裝置重新整理或斷線重連，會自動回到原本的座位。
- 某位玩家離線超過 **1 分鐘**，其他人就可以按「入座」接手他的位置。
- 房間存在記憶體裡，**服務重啟後所有房間會清空**（這是小遊戲，不需要存檔）。

## 日常維護

```bash
sudo /usr/local/etc/init.d/S99nine-grid start   # 啟動
sudo /usr/local/etc/init.d/S99nine-grid stop    # 停止
tail -f /volume1/home/ian/nine_square_grid/app.log

# 改版：電腦 git push 後，在 NAS 上
cd /volume1/home/ian/nine_square_grid && sh update.sh
```

## 遇到問題

| 症狀 | 解法 |
|---|---|
| `找不到 Node` | Stock_Recrod 的 `.node` 不在旁邊，或路徑不同。照第二步處理。 |
| `EADDRINUSE` | 8081 被占用。在 init.d 腳本的 nohup 前加 `PORT=8082`，改連 8082。 |
| 對手下了但我這邊沒更新 | 重新整理頁面即可自動重連；持續發生看 `app.log`。 |
| 外面的網路連不到 | 正常，這只在家裡區網使用，不要對外開 port。 |
