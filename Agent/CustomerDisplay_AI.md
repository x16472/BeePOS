# BeePOS 客顯（Customer Display）— AI Agents 專用說明

> **優先方案：獨立 Android 平板（類型 B）**  
> 本文件專為 AI Agents 撰寫。修改客顯相關程式、硬體整合或 SDK 時，**必須先讀並遵守**本文件。  
> 對應倉庫：https://github.com/x16472/BeePOS

---

## 0. 決策摘要（給 Agents 的一句話）

| 項目 | 決定 |
|------|------|
| **優先硬體** | 獨立 Android 平板，透過區網開啟 `http://<主機IP>:8080/customer-display?mode=kiosk` |
| **次選** | 第二 HDMI + Chromium kiosk（主機有多餘 HDMI 時） |
| **暫不優先** | VFD / SPI 小螢幕（另開文件） |
| **前端位置** | `Mobile/` 內同一 Vite 專案的子路由，**不另開 repo** |
| **狀態來源** | 目前以輪詢為主；未來可升級 WebSocket。客顯**唯讀** |

---

## 1. 與現有系統的對接關係

```
操作員裝置（手機／平板／筆電）
  └─ React App（App.tsx：收銀／訂單／商品／同步）
        │
        │  同源 /api/*
        ▼
Go :8080  ──► Python app_backend.py ──► SQLite
        │
        │  同一 dist，不同路由
        ▼
客顯 Android 平板
  └─ /customer-display?mode=kiosk
        （只讀購物車／品項／總額／已售完）
```

- 客顯與操作員 UI **共用** `Mobile/dist`。
- 客顯**禁止**呼叫會寫入的 API（`POST/PUT/PATCH/DELETE`）。
- 商品「已售完」對應現有欄位：`Product.is_active === false`。
- 購物車狀態目前在 `CashierView` 記憶體；客顯需要後端或前端可讀的「目前購物車快照」。

### 1.1 現有型別對照（`Mobile/src/types.ts`）

| 現有型別 | 客顯用途 |
|----------|----------|
| `Product` | `is_active: false` → 顯示「已售完」 |
| `CartItem` | 客顯品項列（name / price / quantity） |
| `Order` | 結帳完成後可短暫顯示「謝謝惠顧」或清空 |

客顯專用快照建議新增（可放 `types.ts`）：

```ts
/** 客顯用唯讀快照，由後端或操作員端推送 */
export interface CustomerDisplaySnapshot {
  items: Array<{
    product_id?: string;
    name: string;
    unit_price: number;
    quantity: number;
    sold_out?: boolean;  // 對應 !is_active 或即時標記
  }>;
  total: number;
  status: 'idle' | 'ordering' | 'checkout' | 'thankyou';
  message?: string;      // 歡迎詞／找零提示等
  updated_at: string;    // ISO8601
}
```

---

## 2. 子前台檔案結構（必須遵守）

在現有 `Mobile/` 內擴充，**不要**另建獨立前端專案：

```
Mobile/
├─ src/
│  ├─ pages/
│  │  └─ CustomerDisplay.tsx         # 客顯主頁面
│  ├─ components/
│  │  └─ customer/                   # 客顯專用元件
│  ├─ services/
│  │  ├─ api.ts
│  │  └─ customerDisplayApi.ts
│  ├─ App.tsx                        # 需能依路徑切換主 UI / 客顯
│  └─ types.ts                       # 新增 CustomerDisplaySnapshot
├─ docs/
│  └─ CUSTOMER_DISPLAY.md
└─ ...
```

### 2.1 路由與進入方式

| 方式 | 說明 |
|------|------|
| 路徑 | `/customer-display` |
| Query | `?mode=kiosk` 強制全螢幕、隱藏互動 |
| 進入 | Android 平板瀏覽器書籤／Kiosk App 開機自動開啟此 URL |
| 同源 | 必須連到與操作員相同的 Go 主機（`http://主機IP:8080`） |

### 2.2 狀態同步（現階段實作順序）

1. **短期**：操作員端將購物車快照寫入後端（`POST/PUT /api/customer-display/snapshot`）；客顯每 800–1200 ms `GET` 同一路徑。
2. **中期**：WebSocket 推送 `cart_update`，輪詢降為 fallback。
3. **禁止**：客顯直接讀寫 SQLite 或呼叫結帳 API。

### 2.3 UI 約束（車用／攤車可讀性）

- 主要金額字級 ≥ 48 px，品項名稱 ≥ 28 px
- 高對比（WCAG AA）
- 預設無按鈕、無 input（kiosk 模式）
- `is_active === false` 或 `sold_out` 必須明顯
- 以橫向（landscape）為主

---

## 3. Android 平板硬體需求（優先方案）

### 3.1 最低規格

| 項目 | 最低 | 建議 |
|------|------|------|
| OS | Android 10 | Android 12+ |
| 螢幕 | 7–8 吋，800×480 | 10 吋級，1024×600 以上 |
| 亮度 | 300 nits | 600+ nits（車窗／戶外攤） |
| RAM | 3 GB | 4 GB+ |
| 網路 | Wi-Fi，與主機同一區網 | 靜態 IP 或固定 DHCP |
| Kiosk | 必須可 Lock Task Mode 或第三方 Kiosk App | 關閉狀態列、手勢、通知 |
| 溫度 | 工作 -10～50 °C | 工業／商用級更佳 |

### 3.2 部署檢查清單

- [ ] 平板與主機同一區網，可開 `http://主機IP:8080`
- [ ] Kiosk／單一 App，開機自動進客顯 URL
- [ ] 關閉自動休眠或「充電時不休眠」
- [ ] 亮度足夠、字級可讀
- [ ] 斷線顯示「無法連線主機」，不崩潰

---

## 4. 硬體供應商 SDK 規範（Android 優先）

### 4.1 抽象強制

```ts
export interface CustomerDisplayDriver {
  init(): Promise<void>;
  destroy(): Promise<void>;
  clear(): Promise<void>;
  showWelcome(message?: string): Promise<void>;
  showCart(snapshot: CustomerDisplaySnapshot): Promise<void>;
  showSoldOut(names: string[]): Promise<void>;
  isAvailable(): boolean;
}
```

- 預設：`WebKioskDisplayDriver`（純網頁）
- 有廠商 SDK：`SunmiDspDisplayDriver` 等，同一介面
- 初始化失敗 → 降級 WebKiosk + warning，不可讓 POS 崩潰
- React 元件禁止直接 import 廠商套件

### 4.2 禁止事項

- 客顯引入支付或敏感資料處理
- 硬編碼特定解析度 pixel
- 假設平板一定允許觸控操作（kiosk 下應關閉互動）

---

## 5. 建議 API（目前倉庫尚未實作）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `PUT`/`POST` | `/api/customer-display/snapshot` | 操作員端寫入購物車快照 |
| `GET` | `/api/customer-display/snapshot` | 客顯讀取；無資料回傳 idle |

快照可僅存記憶體；結帳成功可短暫 `status: 'thankyou'` 再回 `idle`。

---

## 6. AI Agents 實作檢查清單

- [ ] 只動 `Mobile/src` 客顯相關與必要的 `App.tsx` 路由分流
- [ ] 客顯頁面無寫入 API
- [ ] 已售完對應 `Product.is_active` 或 `sold_out`
- [ ] 支援 `?mode=kiosk`
- [ ] 硬體／SDK 已抽象，預設 Web Kiosk
- [ ] 型別寫入 `types.ts`
- [ ] 同步更新 `Agent/History.md` 與本文件

---

## 7. 文件索引

| 文件 | 用途 |
|------|------|
| `Agent/PRD.md` | 整體系統需求 |
| `Agent/agent.md` | 開發計畫 |
| `Agent/History.md` | 歷次變更 |
| `Agent/CustomerDisplay_AI.md` | **本文件** |
| `Agent/Hardware_Tablet_Portable_AI.md` | 平板硬體與 SDK 細節 |
| `Mobile/docs/CUSTOMER_DISPLAY.md` | 人類快速參考 |

**最後提醒**：客顯優先路徑是「Android 平板 + 區網開啟同源 `/customer-display?mode=kiosk`」。第二 HDMI 與 VFD 為備援，不要未確認需求前優先實作。
