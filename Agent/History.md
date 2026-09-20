# AI 紀錄

## 2026-09-21：Go / Python / SQLite 後端與前端串接

### 依據與範圍

- 已閱讀 `Agent/agent.md`、`Agent/PRD.md` 與既有前端。原 Go 僅輸出連接埠；前端商品、訂單、同步皆使用 localStorage／模擬流程。
- 依開發計畫先完成 Windows 本機主機、SQLite CRUD 與 MSSQL 同步程式。Wi-Fi SSID、VPN、支付與實體硬體控制不在本次實作內。
- Phoenix 補充要求 Python 使用專案 Venv，已建立根目錄 `.venv`，並將 Go 與 `start.bat` 固定改為使用此環境。
- 本工作目錄不是 Git 儲存庫（`git status` 回報 not a git repository），因此沒有 Git 提交或可用的 Git diff。

### 實際變更

- `Backend/main.go`、`go.mod`：Go 提供靜態網站與 HTTP 代理，啟動兩個 loopback Python 服務、行程退出後重啟、連接埠檢查、Ctrl+C 停止與 Windows 子行程樹清理；錯誤回應使用繁體中文。
- `Backend/app_backend.py`、`http_worker.py`：以 Python 標準函式庫實作 JSON API，含商品 CRUD、訂單讀取、現金結帳、作廢／狀態更新、日結盤點、健康檢查及預留路由。
- `Database/store.py`、`schema.sql`：SQLite WAL、外鍵、交易與正規化分表。後端計價、現金驗證、成交快照、商品軟刪除、交易 UUID 冪等處理與操作紀錄。
- `Database/app_db_sync.py`：背景與手動同步，參數化 MSSQL 查詢、上傳／下載、遠端提交後比對本機版本再確認同步。遠端失敗保留本機資料，同步鎖避免重疊。
- `Database/mssql_schema.sql`、`requirements.txt`：遠端結構初始化腳本與選用 pyodbc 依賴；尚未對任何實際 MSSQL 執行腳本或寫入資料。
- `Mobile/src/services/api.ts`、`storage.ts`、`App.tsx` 與相關元件：以 API 取代模擬商品、訂單與同步；結帳成功後才清空購物車，待確認交易保留於 sessionStorage；匯出使用讀回的訂單，CSV 加入跳脫；日結盤點寫入 SQLite；移除清空範例資料按鈕，改為重新讀取主機資料。
- 前端不再把 VPN、4G、電源或硬體模擬值顯示為已驗證狀態；輪詢取得本機及最近 MSSQL 同步狀態。商品與訂單範例檔仍保留，但執行時不再載入。
- `start.bat`、`.gitignore`、根目錄 `README.md`：加入 Venv 檢查、前端建置、Go 編譯與啟動說明。啟動腳本不自動安裝套件。
- `Backend/test_backend.py`、`smoke_test.py`：業務、同步替身測試與 Go/Python HTTP 整合測試。

### 驗證與遇到的問題

- 原系統僅找到 `py.exe` 啟動器，`py -3 --version` 顯示沒有已安裝 Python。使用 Codex 隨附 Python 3.12.14 建立專案 `.venv`，`include-system-site-packages = false`；後續測試改由 `.venv/Scripts/python.exe` 執行。
- 10 項 Python 測試全部通過：計價與重新初始化後資料保留、錯誤金額／數量回復、並行重送防重複、商品價格異動與軟刪除保存歷史、MSSQL 未設定時仍可收銀、WAL／外鍵／無 View、日結與保留路由、模擬遠端 ACK／下載、遠端提交失敗、同步期間修改保留待同步。
- 同步替身測試初次遇到 Windows SQLite 連線未關閉造成暫存檔鎖定；已修正測試連線清理，重跑全數通過。
- Go 1.24.2 的 `go build -o beepos.exe .` 與 `go vet ./...` 通過。首次沙箱內建置無法存取標準函式庫，取得執行授權後建置成功。
- HTTP 整合測試通過：靜態測試頁、Go 代理、兩個 Venv Python 服務、商品新增／讀取／刪除、結帳與重送、訂單作廢、同步失敗時保留 pending、跨來源拒絕及行程清理。測試使用暫存 SQLite，沒有建立範例正式交易資料。
- 首次 HTTP 測試的功能斷言通過，但沙箱阻止 taskkill，清理階段逾時；取得授權後清除該測試行程樹。修正 Windows Venv 子行程清理處理後，重新執行整合測試成功並正常清理。
- 前端依賴安裝初次在根目錄執行時因缺少 package.json 失敗，誤產生的根目錄空 package-lock.json 已移除。改到 Mobile 後，npm 下載遭沙箱 EACCES 阻擋；提權下載請求遭使用者拒絕，未再下載套件。

### 尚未驗證與限制

- 尚未執行成功 `npm run lint`、`npm run build` 或瀏覽器畫面測試；前端缺少依賴，不能宣稱全功能網站已完成驗收。整合測試使用測試 HTML，並非 React 建置產物。
- 未取得 MSSQL 連線資訊，也未安裝 pyodbc／驗證 ODBC 驅動。真正 SQL Server 語法、憑證、權限與遠端提交行為仍須實機驗證；替身測試不等於實機通過。
- 未驗證其他區網裝置、Windows 防火牆、實體 ARM、印表機、錢箱或斷電情境。
- 同步採單車本機待同步異動優先，下載目前為全表讀取；未完成大資料量分頁與多主機衝突合併。
- 離線範圍為 MSSQL／外網離線；瀏覽器仍需連到主機。待確認交易恢復限原瀏覽器分頁的 sessionStorage。
- 不提供正式後端帳號認證；原 PIN 僅為畫面鎖定。尚未加入日誌輪替。
- PRD 其餘尚未完成項目：WebSocket、Go 記憶體請求重試佇列、卡死行程健康監控、Linux systemd 與實體硬體驅動。未將非冪等操作加入自動重送。
- `.venv` 依賴目前的基底 Python 路徑，換機或基底變更時須重建。

## 2026-09-21：日期時間訂單編號與 YAML 菜單初始化

- Phoenix 確認訂單需求為「日期時間訂單編號，另顯示建立與修改時間」，不需要每筆訂單獨立檔案。
- 實際讀取 `Database/Menu/menu.yaml` 時為 0 位元組；經 Phoenix 確認後，依第二張圖片建立 3 個分類、14 項商品的 YAML。啟用與常用欄位沿用原前端範例預設，圖片本身沒有提供常用狀態。
- 新訂單主鍵／顯示編號由後端以臺灣時間 `YYYYMMDD-HHmmss-ffffff` 產生；相同微秒在 SQLite 寫入鎖內遞增微秒，防止不同交易撞號。內部請求 UUID 僅供重送去重，不作為新訂單編號。
- 新增 `request_id`、`updated_at` 與 SQLite 啟動遷移。保留舊訂單主鍵、明細關聯及建立時間；舊訂單顯示編號依建立時間呈現，缺少歷史修改時間的紀錄以建立時間作為初值。作廢／狀態或備註更新會更新修改時間，編號保持不變。
- 前端移除隨機三位數訂單號，訂單列表及明細顯示臺灣建立／修改時間；結帳成功訊息使用主機正式編號。
- `menu_loader.py` 使用 `yaml.safe_load`，驗證分類、商品 ID、名稱、價格與布林設定後，以單一交易寫入 SQLite 並標記待同步。初始化完成後不重新灌入，保留改價、停售與刪除結果。首次升級遇到既有 ID 或同分類／名稱商品時保留原資料。
- 新增 `Backend/requirements.txt`、更新 `Database/requirements.txt` 與 `start.bat` 依賴檢查。PyYAML 6.0.3 已安裝於專案 `.venv`；首次沙箱內安裝找不到套件，經授權於沙箱外安裝成功。
- 實際執行本機 SQLite 初始化完成，讀回共 15 項商品（14 項 YAML 初始商品及既有商品）；未清空既有營運資料。
- 更新 MSSQL 初始化／升級腳本，補上新訂單欄位；未連入或修改實際 MSSQL，舊版遠端需由使用者執行腳本後再同步。
- 驗證結果：14 項 Python 測試全部通過，涵蓋同微秒編號、修改時間、舊資料遷移、YAML 驗證失敗時回復、初始化後修改／刪除不被還原，以及原有交易與同步測試。
- 使用 `/Mobile` 已安裝依賴，`npm run lint` 與 `npm run build` 均通過。Go/Python HTTP 整合測試通過，含 YAML 初始化後新增商品、日期時間訂單、冪等重送、訂單狀態更新及行程清理。未進行瀏覽器視覺驗證或 MSSQL 實機驗證。
