# Bee POS 本機後端

Go 提供前端靜態檔案與 API 代理，並啟動專案 `.venv` 中的兩個 Python 服務。SQLite 是本機營運資料來源；遠端 MSSQL 失敗時，現金結帳仍可使用。

## Windows 啟動

需要 Go 1.22 以上、Node.js 與 Python 3.10 以上。Python 一律使用專案根目錄 `.venv`，不使用全域套件環境。

```powershell
# 尚未建立虛擬環境時執行
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r Backend/requirements.txt

# 首次安裝前端依賴；start.bat 不會自行下載套件
cd Mobile
npm install
cd ..

.\start.bat
```

本次已建立 `.venv`，基底是本機 Codex 隨附的 Python 3.12.14。若此基底被移除、搬移專案或更換電腦，請以新電腦安裝的 Python 重新建立 `.venv`；虛擬環境不應複製到其他電腦。

啟動後本機使用 `http://localhost:8080`；同一區域網路的裝置使用 `http://主機內部IP:8080`。Windows 防火牆須允許該私人網路連入 TCP 8080，本專案不會自動修改防火牆。Ctrl+C 停止 Go 與 Python 服務。

首次啟動依 `Database/Menu/menu.yaml` 的分類與商品清單初始化 SQLite。菜單含圖片中的 14 項商品，啟用／常用設定沿用原範例預設。初始化使用單一交易並記錄完成標記，之後以 SQLite 為準，重啟不覆蓋改價、停售或刪除。既有相同 ID 或相同分類／名稱商品保留原值；其他既有商品也保留。修改 YAML 不會自動覆蓋已初始化資料庫。原先瀏覽器範例訂單與 localStorage 資料不會自動匯入正式資料庫。

## MSSQL 設定

本機菜單初始化使用 PyYAML（`Backend/requirements.txt`）。要連 MSSQL 時，使用同一個專案虛擬環境安裝驅動套件，並在 Windows 安裝 Microsoft ODBC Driver 18 for SQL Server。

```powershell
.\.venv\Scripts\python.exe -m pip install -r Database/requirements.txt
```

請在專供 Bee POS 使用的 MSSQL 資料庫中手動執行 `Database/mssql_schema.sql`，再設定環境變數。服務不會自行建立遠端資料庫或修改現有資料庫結構。

舊版 MSSQL 也須重新執行此腳本，以補上訂單 `request_id` 與 `updated_at` 欄位；SQLite 則於啟動時自動補欄位，保留舊訂單主鍵與明細關聯。舊紀錄沒有修改時間可追溯時，初始值使用建立時間。

```powershell
$env:BEE_MSSQL_CONNECTION_STRING = 'DRIVER={ODBC Driver 18 for SQL Server};SERVER=伺服器位址;DATABASE=BeePOS;Trusted_Connection=yes;Encrypt=yes;TrustServerCertificate=no;'
.\start.bat
```

也可使用 SQL Server 帳號連線字串，請透過環境變數提供，不要提交密碼。此程式不會自動讀取 `.env`。

沒有設定連線字串、未安裝驅動或遠端失敗時，同步會回報失敗，訂單保留待同步；不會假設 SQL Server 已連線。背景每 30 秒嘗試同步，也可從前端手動觸發，即使沒有待上傳訂單仍可取得遠端商品。

## 資料與同步規則

- SQLite 使用 WAL、外鍵與交易，金額以整數新臺幣計算。
- 分類、商品、訂單、明細、日結盤點與同步狀態分表。訂單總額、明細小計、找零由 Python 計算，不另存可推導欄位；不建立 View。
- 訂單明細中的名稱與單價是成交當時的快照，不跟隨商品修改。商品採軟刪除，訂單以作廢取代實體刪除。
- 訂單編號由主機依臺灣建立時間產生，格式為 `YYYYMMDD-HHmmss-ffffff`，例如 `20260921-023420-123456`。同一微秒撞號時在交易鎖內遞增微秒。修改不改編號，另更新 `updated_at`；畫面顯示建立與修改時間，不產生獨立訂單檔案。資料庫時間欄位仍保存 UTC ISO8601。
- UUID 僅作為內部請求的冪等識別碼，不作為新訂單主鍵或畫面編號。同一請求與相同內容重送會回傳原訂單；不同內容會拒絕。舊訂單主鍵保留，但顯示為其建立時間。商品價格以資料庫為準，前端價格過期會要求重新點餐。
- 前端先保留待確認交易於同一分頁的 sessionStorage，成功回應後才清空購物車。此機制不涵蓋關閉分頁後的恢復；交易結果不確定時應保留原分頁。
- 同步先依外鍵順序上傳本機異動，再取回遠端資料。遠端交易提交成功後才以版本比對標示本機已同步；同步期間新增的異動仍保留待同步。
- 衝突採單車營運的本機待同步資料優先；本機沒有待同步修改時接受遠端資料。MSSQL 請使用相同資料模型，商品刪除使用 `deleted=1`，不要直接刪除資料列。
- 日結保存盤點日期、實際現金及備註；應收與差額依臺灣當日有效訂單計算，不是不可變的會計封帳快照。
- 主題與畫面 PIN 保留於瀏覽器。PIN 僅是畫面鎖定，不是後端認證；本版適用受信任區網。

「離線優先」是主機失去 MSSQL／外網時仍能以 SQLite 收銀。手機仍須連到本機主機；手機與主機斷線時不會宣稱交易已成功。

## API

| 方法 | 路徑 | 用途 |
| --- | --- | --- |
| GET | `/api/health` | 本機資料服務健康檢查 |
| GET / POST | `/api/products` | 讀取／新增商品 |
| PUT / DELETE | `/api/products/{id}` | 修改／軟刪除商品 |
| GET / POST | `/api/orders` | 讀取訂單／現金結帳 |
| PATCH | `/api/orders/{id}` | 更新訂單狀態與備註 |
| POST | `/api/settlements` | 儲存日結盤點 |
| GET | `/api/sync/status` | 最近同步結果、待同步筆數、同步紀錄 |
| POST | `/api/sync` | 手動同步 |
| 任意支援的方法 | `/api/payments`、`/api/hardware`、`/api/vpn` | 保留介面，回傳 501 |

結帳內容使用 `{id, received_amount, items: [{product_id, unit_price, quantity}]}`；自訂無碼商品省略 `product_id` 並提供 `product_name`。前端不得指定訂單總額作為後端計價依據。

## 設定與檔案

| 環境變數 | 預設值／用途 |
| --- | --- |
| `BEE_ROOT` | `start.bat` 設為專案目錄；直接執行 Go 時預設為工作目錄的上一層 |
| `BEE_HOST` / `BEE_PORT` | `0.0.0.0` / `8080` |
| `BEE_APP_PORT` / `BEE_SYNC_PORT` | `8765` / `8766`，Python 僅監聽 loopback |
| `BEE_DB_PATH` | `Database/bee_pos.db` |
| `BEE_STATIC_DIR` | `Mobile/dist`，整合測試可覆寫靜態檔案路徑 |
| `BEE_SYNC_INTERVAL` | `30` 秒，最少 5 秒 |
| `BEE_MSSQL_CONNECTION_STRING` | 無預設，使用者提供 |

系統紀錄位於 `Database/main.log`、`app_backend.log`、`app_db_sync.log`；操作紀錄位於 `Database/operations.txt`。SQLite、虛擬環境、建置產物與紀錄檔已列入 `.gitignore`。

## 驗證

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s Backend -p 'test_*.py' -v
cd Backend
go build -o beepos.exe .
go vet ./...
cd ..
.\.venv\Scripts\python.exe Backend/smoke_test.py
cd Mobile
npm run lint
npm run build
```

`smoke_test.py` 使用暫存資料庫與測試用 HTML 驗證 Go/Python HTTP 整合，不代表 React 頁面已通過驗證。同步單元測試使用 SQLite 模擬 ODBC 呼叫行為，不能取代真實 MSSQL 測試。

目前未實作：Wi-Fi SSID、VPN 通道、第三方支付、ESC/POS 印表機與錢箱、Linux systemd、WebSocket 推播、Go 記憶體請求重試佇列。硬體保留介面會回報未實作，結帳回傳 `HARDWARE_OFFLINE` 警告但仍儲存交易。主機服務採行程停止後重啟，尚無針對行程卡死的強制重啟監控。實際完成與未驗證項目見 `Agent/History.md`。
