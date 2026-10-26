# 香港 iPhone Duo 庫存工具開發設計

版本 1.1｜2026 年 10 月 25 日

## 技術方案

Sites 私人網站、Vinext React 前端、Cloudflare Worker API、D1 持久化。AppleAdapter 負責將配置的料號與官方產品頁逐一核對，再向香港 retail/pickup-message 端點查詢。該端點屬網站內部介面，已取得真實四規格六店回應驗證；若失效，回報來源不可用並保留舊資料，不以靜態頁面代替庫存。

## 模組與資料

lib/catalog.mjs：四個 variantId、容量、色名、官方購買網址及六店。lib/apple.mjs：固定 Apple 網域請求、料號發現、嚴格回應解析。lib/monitor.mjs：資料庫鎖、冷卻、退避、快照、歷史。app/api：GET /api/status、POST /api/check、POST /api/config。app/page.tsx：繁體中文面板。scripts/monitor.mjs：獨立背景執行器（如需 5 分鐘頻率），讀取 SITE_URL 與 SITES_SERVICE_TOKEN 環境變數，不持有 Apple 帳號。

D1 monitor_state 單列儲存設定與快照 JSON、鎖租約、nextAllowedAt；monitor_runs 保存最近檢測與變更紀錄。快照格包含 variantId、storeId、status、checkedAt、lastSuccessAt、message、rawStatus。讀取端依目前時間計算過期；前端不得把 UNKNOWN/ERROR 轉成 UNAVAILABLE。

## 介面與權限

GET /api/status：設定、24 格快照、最近 30 次檢測及 nextAllowedAt。POST /api/check：要求 same-origin 或平台服務授權；資料庫 CAS 原子鎖，最多一輪執行；成功後原子寫入快照與紀錄。私人存取由 Sites 平台保障；服務端固定來源，禁止 SSRF。POST 跨站 Origin 不符合時拒絕。

## 可靠性

每輪四規格順序檢測、單請求 15 秒、總預算 120 秒。原子鎖租約 180 秒，逾期可接管；寫入時核對 token，避免舊執行覆蓋新輪。普通冷卻 60 秒，來源封鎖退避 15 分鐘；遵守更長 Retry-After。每個格子獨立驗證型別與門市回應。缺門市為未知，不推斷無貨。保留最後成功時間，錯誤不更新它。

## 擴展

新增機型只添加 catalog 項，新增商家另加 adapter，統一輸出 variantId/storeId/status/time/source。首版不做通用後台、多租戶、價格比較或自動購買。

## 測試與部署

node --test tests/*.test.mjs：來源解析、料號驗證、缺門市、非布林欄位、過期、有貨變化、請求失敗。npx tsc --noEmit：型別檢查。使用 Sites build helper 打包並發布私人站點；D1 遷移由平台執行。用實際官方查詢驗證後才能開背景監測；來源未通時可交付診斷面板但必須標示未完成真實資料驗收。

## 背景執行

頁面計時器僅保證頁面開啟時檢測。獨立 Node 執行器可在常開電腦或伺服器執行；不將 token 寫入檔案。雲端排程須經 Sites 支援的 unattended writer 路徑驗證，再建立原生排程。不能把 React setInterval 說成關頁持續監測。


## 正式部署結果

私人 Sites 站點已發布，D1 遷移、真實 Apple 查詢與持久化讀回均通過。Cloudflare Workers 不支援 fetch 的 redirect:error，現採 manual 模式並拒絕非成功回應，且已加入回歸測試。

平台雲端自動化最高每小時一次，已建立每小時背景檢測；開頁自動檢測仍為每 5 分鐘。站點原生排程介面回報 invalid_project，已以連線相同站點的通用自動化完成設定，避免重複排程。獨立 Node 執行器可供後續部署至常開設備，以提供關頁每 5 分鐘的頻率。

/api/config 的 retryNetworkError 僅供來源連線修復後恢復檢測，保留至少 60 秒間隔；不解除 HTTP 403/429/541 類型來源限制退避。

## 可取貨門店明細

由 catalog.pickupStores 按機型篩選、依官方門店配置分組，保留每個容量／顏色的檢測時間；僅收錄 available 且 isFresh 的項目。MonitorStatus 直接列出清單，主機型與測試機型分開，不更改 API 或資料庫。

## Dynamic official catalog
Each accepted check discovers Apple HK buy-iphone links, parses exact HK part numbers with model/capacity/color identities, upserts a durable product_catalog record and extends the six-store grid. Existing IDs and observations survive sync failures; sync warnings are visible in settings. Newly discovered models are normal monitoring targets. Source requests stay under apple.com/hk-zh/shop, concurrency is bounded to four pickup requests, and each round stops starting pickup batches after 105 seconds. Removed official entries are conservatively retained pending explicit retirement; their source verification may fail and is never mapped to sold out. Catalog-derived product links open the official model selection page for capacity/color confirmation.
