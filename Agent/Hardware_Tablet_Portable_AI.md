# 平板與可攜式螢幕硬體 + 供應商 SDK 規範
## （AI Agents 專用｜Android 平板優先）

> 對應倉庫：https://github.com/x16472/BeePOS  
> 與 `CustomerDisplay_AI.md` 搭配使用。客顯**優先方案為獨立 Android 平板**。

---

## 1. 硬體決策（已定）

```
客顯硬體選擇
├─ 【優先】B：獨立 Android 平板（區網連 Go :8080）
├─ 【次選】A：第二 HDMI + Chromium kiosk（主機有多餘輸出時）
└─ 【暫緩】C：VFD / SPI 小螢幕（另開文件）
```

**理由（車載／攤車）**  
- 平板故障可整機替換，不影響 ARM／Windows 主機  
- 不占用主機 GPU／HDMI  
- 部署快：同一區網開瀏覽器即可  
- 可選商用平板（Kiosk、亮度、溫度較穩）

---

## 2. Android 平板詳細規格

### 2.1 必須滿足

| 參數 | 最低 | 建議 |
|------|------|------|
| Android | 10 | 12+ |
| 解析度 | 800×480 | 1024×600 或更高 |
| 亮度 | 300 nits | 600–1000 nits（半戶外／車窗） |
| 可視角 | 水平 ≥ 140° | ≥ 160°（IPS） |
| RAM | 3 GB | 4 GB+ |
| 儲存 | 32 GB | 64 GB |
| 網路 | Wi-Fi，與主機同區網 | 固定 IP 或 DHCP 保留 |
| Kiosk | Lock Task Mode 或等效 | 關閉狀態列／手勢／通知 |
| 觸控 | 可有，但客顯 kiosk 下應關閉互動 | — |
| 工作溫度 | -10～50 °C | 工業級更佳 |
| 電源 | 可穩定供電（含車用轉接） | 與主機 UPS／ACC 一併規劃 |

### 2.2 明確不建議

- 無法進入 Kiosk／單一 App 的消費級娛樂平板  
- 亮度明顯不足、強光下無法閱讀的螢幕  
- 僅能用手機熱點且不穩定的連線方式作為正式部署  

### 2.3 現場部署步驟（給實作者）

1. 主機 `start.bat` 已跑、區網可連 `http://主機IP:8080`  
2. 平板安裝 Chrome 或專用 Kiosk 瀏覽器  
3. 設定開機自動開啟：  
   `http://<主機IP>:8080/customer-display?mode=kiosk`  
4. 啟用 Lock Task Mode（或 Fully Kiosk 等）  
5. 關閉自動休眠／螢幕逾時（或「充電時保持喚醒」）  
6. 驗證：操作員加購 → 客顯約 1 秒內更新；斷網顯示離線提示  

---

## 3. 供應商 SDK 規範（Android 優先）

### 3.1 抽象層（強制）

```ts
interface CustomerDisplayDriver {
  init(): Promise<void>;
  destroy(): Promise<void>;
  clear(): Promise<void>;
  showWelcome(message?: string): Promise<void>;
  showCart(snapshot: CustomerDisplaySnapshot): Promise<void>;
  showSoldOut(names: string[]): Promise<void>;
  isAvailable(): boolean;
}
```

| 實作 | 使用時機 |
|------|----------|
| `WebKioskDisplayDriver` | **預設**。Android 平板用瀏覽器開同源頁面即可，無需 SDK |
| `SunmiDspDisplayDriver` 等 | 僅當選用內建客顯／官方 DSP SDK 的商用機時 |

- React 元件與業務 API **禁止**直接 `import` 廠商套件  
- 初始化失敗 → 降級 WebKiosk + warning log，不中斷 POS  

### 3.2 生命週期

1. App／客顯頁掛載 → `init()`  
2. 快照更新 → `showCart` / `showWelcome` / `clear`  
3. 卸載或收到關機訊號 → `destroy()` / `clear()`  
4. 任何 SDK 錯誤最多重試 2 次，之後降級並記錄  

### 3.3 版本與紀錄

- SDK 版本鎖定在依賴檔（若為 Android 原生則記錄於 History）  
- 每次整合在 `Agent/History.md` 寫明：廠商、版本、測試機型、日期、已知問題  

### 3.4 常見廠商備註

| 類型 | 注意 |
|------|------|
| 純 Web（預設） | 無 SDK；確保 Kiosk 與同源 CORS／連線穩定 |
| SUNMI DSP 等 | 需開發者帳號與權限；服務綁定時機；失敗必降級 |
| 其他商用平板 | 確認是否提供 Customer Display API，否則一律走 Web |

---

## 4. 次選：第二 HDMI（類型 A）

僅在「主機有穩定第二輸出、且不想多一台平板」時考慮。

- 啟動範例（Linux／未來 ARM）：  
  `chromium --kiosk --app=http://127.0.0.1:8080/customer-display?mode=kiosk`  
- Windows 模擬階段可先用第二螢幕手動開瀏覽器驗證  
- 仍使用同一套 `/customer-display` 前端，不另寫 UI  

---

## 5. 選型與驗證清單（Agents 執行用）

### 選型
- [ ] 符合第 2 節 Android 規格  
- [ ] 可 Kiosk／單一 App  
- [ ] 亮度與溫度符合車用／攤車場景  
- [ ] 電源方案與主機 ACC／UPS 不衝突  

### 整合
- [ ] 預設路徑為 Web Kiosk，無 SDK 也能跑  
- [ ] 有 `CustomerDisplayDriver` 抽象與降級  
- [ ] 錯誤不影響結帳  
- [ ] History.md 已記錄  

### 實車／實攤
- [ ] 強光下可讀  
- [ ] 斷線有明確提示  
- [ ] 主機重啟後平板重新整理或自動重連即可恢復  

---

## 6. 相關文件

| 文件 | 內容 |
|------|------|
| `CustomerDisplay_AI.md` | 客顯前端路由、快照、UI、API 建議 |
| `PRD.md` | 系統總需求 |
| `History.md` | 必須同步記錄硬體與 SDK 變更 |
| 本文件 | Android 優先硬體 + SDK 抽象強制規範 |

**Agents 原則**：先保證「任意 Android 平板 + 瀏覽器 Kiosk」能跑通客顯；有特定廠商 SDK 需求時再實作對應 Driver 並降級保護。
