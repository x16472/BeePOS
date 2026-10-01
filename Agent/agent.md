# Agent
目前網站採用TypeScript前端框架，請幫我規劃一套用來驅動此的Go/Python後端程式碼，主體為main.go，先做兩個驅動程式碼，一個是驅動前端介面、一個是驅動SQLite的資料庫，與連入MSSQL的交互。

>   目前先不實作日常情景用於偵測`Wifi SSID`的功能，也不需考慮Home Lab的VPN連線及通訊埠轉發等，默認是連入`MSSQL`資料庫的狀態，但針對錯誤處理，還是要以`離線優先`為基礎功能，手動同步為輔。

不論是SQLite、MSSQL資料庫遵循`3NF`資料庫正規化，不使用具有資安疑慮的`View檢視表`預設關閉，全靠Python函式去撰寫查詢。

無論是本地資料庫和外部資料庫，其中的鍵值用UUID會有影響查詢的可能信，必須遵循`3NF`資料庫正規化之外，資料表結構需要得簡化，因為會造成：
1. 儲存空間與記憶體浪費
   *  整數（Integer）：通常只需要 4 或 8 個位元組（Bytes）。
   *  字串（Text / UUID）：一個字串 UUID 或自訂字串往往需要 36 個位元組以上。
   *  連帶影響：主鍵（Primary Key）會被資料庫拿來建立「聚集索引（Clustered Index）」。更糟的是，其他資料表（如訂單明細）只要引用它作為外鍵（Foreign Key），就必須重複儲存這個長字串。這會導致資料庫佔用的硬碟與記憶體空間暴增數倍。
2. 嚴重影響查詢與寫入效能
   *  資料庫比較兩個數字（1 比較 2）只需要一個 CPU 指令。
   *  資料庫比較兩個字串（"abc" 比較 "abd"），必須逐個字元比對編碼，效能落差極大。
   *  如果您使用的是隨機字串（如原本的 UUID），每次新增資料時，資料庫為了維持 B-Tree 索引的順序，必須在硬碟中「隨機插頁」，這會導致嚴重的磁碟隨機 I/O 瓶頸。
3. 與 schema 其他欄位矛盾

在原本的語法中，`category_id`也是`TEXT`。這意味著可能所有的關聯表都在用字串互相連接，長期下來整個資料庫的關聯查詢（JOIN）效能會急劇下滑。所以得改成：
```sql
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY, -- 自動遞增、具備唯一識別性
 category_id INTEGER NOT NULL REFERENCES categories(id),
 name TEXT NOT NULL, 
 price INTEGER NOT NULL CHECK(price >= 0),
 is_active INTEGER NOT NULL, 
 is_favorite INTEGER NOT NULL, 
 deleted INTEGER NOT NULL DEFAULT 0
);
```

核心功能的Arm主機利用`main.go`驅動所有服務，但目前沒有Arm樹梅派主機，用本地`Windows11`透過`start.bat`執行Go微服務主程式，來模擬出主機驅動網頁後端的狀態，原先透過`AI Studio`做好的前端網站，可以利用連接同一個網域的任何設備，使用運行微服務主程式的`內部IP`，進而看見全功能的前端網頁。

對於行動支付的API功能，在後端程式碼留空來保留，vpn連線同步的部分也予以保留。目前先做到給前台網頁有一個能用的後端，且具備`CRUD`，資料庫同步功能，本身還有個SQLite可用。

## 資料夾架構
-   [/Backend](/Backend/):後端程式碼區塊
-   [/Database](/Database/):連入資料庫的後端程式碼（用`Python`效仿`MVC`的`Controller`）以及離線資料庫`*.db`，以及基於`*.log`、`*.txt`格式的操作紀錄檔和系統紀錄檔存放的位置（系統紀錄一律用`*.log`，操作紀錄用`*.txt`。
-   [/Mobile](/Mobile/):這邊是已經用`AI Studio`製作好的前台網站。
-   主要流程圖在[PRD.md](/Agent/PRD.md)會寫的比較詳細。
-   菜單部分請參考第二張圖，用 [menu.yaml](Database/Menu/menu.yaml) 的建立資料。菜單資料依照此檔案的結構畫內容初始化，後續再寫入本地離線資料庫當中。'

## 7.客顯方案（先不做）
1. **優先**：獨立 Android 平板，區網開  
   `http://<主機IP>:8080/customer-display?mode=kiosk`
2. **次選**：第二 HDMI + Chromium kiosk  
3. **暫緩**：VFD / SPI  
4. **已售完**：對應現有 `Product.is_active === false`  
5. **客顯唯讀**；預設 Web Kiosk，廠商 SDK 必須包在 `CustomerDisplayDriver` 並可降級  

### 尚待實作（文件已寫清，程式先不做）

- 後端 `GET/PUT /api/customer-display/snapshot`（記憶體快照即可）  
- `App.tsx` 依路徑分流主 UI / 客顯  
- `CashierView` 在購物車變更時寫入快照  
- 將 `CustomerDisplaySnapshot` 正式加入 `types.ts`  
