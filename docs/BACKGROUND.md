# 香港 iPhone Duo 背景監測執行說明

## 每輪操作

透過 Sites get_site 取得此私人網站的 current_live_url 與當輪服務存取憑證。只將憑證放入該網站請求的 OAI-Sites-Authorization 標頭，不輸出、不保存到檔案、不放入網址。

向 /api/check 發送 POST，並加上 x-duowatch-runner: background 標頭。預留 135 秒逾時，接著 GET /api/status，確認 lastAttemptAt、最新紀錄、background.lastRunAt 已持久化。若 accepted 為 false，代表共享冷卻或其他輪正在執行；不強行解除鎖或重複請求。

例行檢測由網站內 Apple 適配器執行，無須重新發布網站。不要將測試或搜尋結果寫成即時庫存。若 API 回報來源異常，保留錯誤與既有時間，依 nextAllowedAt 等待；不繞過限制。

## 排程與提醒

目前雲端排程每小時一次（平台上限），頁面內與獨立 Node 執行器可每 5 分鐘檢測。排程建立前，必須先驗證雲端來源連線、私人 writer 權限與寫入讀回；建立後透過 /api/config 將 backgroundEnabled 設為 true，再讀回確認。

目前桌面通知僅在頁面開啟且取得權限時運作；背景庫存偵測不自動代表手機推播或郵件已啟用。排程不得擅自傳送第三方訊息，不操作 Apple 下單。
