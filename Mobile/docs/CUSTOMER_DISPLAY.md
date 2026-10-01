# 客顯子前台（Customer Display）簡要說明

**優先方案：獨立 Android 平板**，區網開啟同源客顯頁。

完整約束與 AI Agents 規範：

- `Agent/CustomerDisplay_AI.md`
- `Agent/Hardware_Tablet_Portable_AI.md`

## 快速定位

| 項目 | 說明 |
|------|------|
| 路由 | `/customer-display` |
| 建議 URL | `http://<主機IP>:8080/customer-display?mode=kiosk` |
| 主要檔案 | `src/pages/CustomerDisplay.tsx`（待實作／骨架） |
| 已售完 | 對應 `Product.is_active === false` |
| 狀態 | 唯讀；輪詢或未來 WebSocket，禁止寫入 API |

## Android 平板最低要求（摘要）

- Android 10+（建議 12+）
- 可 Lock Task Mode／Kiosk
- 亮度建議 ≥ 600 nits（車用／半戶外）
- 與主機同一區網

## 啟動（平板）

1. 主機已執行 `start.bat`，區網可連 `http://主機IP:8080`
2. 平板設為 Kiosk，開機自動開啟上述客顯 URL
3. 關閉自動休眠

第二 HDMI、VFD 為次選／暫緩，細節見 Agent 文件。
