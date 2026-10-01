/**
 * BeePOS 客顯主頁面（Customer Display）
 *
 * 優先部署：獨立 Android 平板
 *   URL: http://<主機IP>:8080/customer-display?mode=kiosk
 *
 * AI Agents：
 * - 本頁唯讀，禁止任何寫入 API
 * - 已售完對應 Product.is_active === false 或 snapshot.sold_out
 * - 規範見 Agent/CustomerDisplay_AI.md、Agent/Hardware_Tablet_Portable_AI.md
 */

import { useEffect, useState } from 'react';

/** 與 types.ts 對齊後可改為從 '../types' 匯入 */
interface CustomerDisplayItem {
  product_id?: string;
  name: string;
  unit_price: number;
  quantity: number;
  sold_out?: boolean;
}

interface CustomerDisplaySnapshot {
  items: CustomerDisplayItem[];
  total: number;
  status: 'idle' | 'ordering' | 'checkout' | 'thankyou';
  message?: string;
  updated_at: string;
}

const POLL_MS = 1000;

export default function CustomerDisplay() {
  const [snapshot, setSnapshot] = useState<CustomerDisplaySnapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const isKiosk =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('mode') === 'kiosk';

  useEffect(() => {
    if (isKiosk) {
      document.body.style.overflow = 'hidden';
      document.body.style.userSelect = 'none';
    }
  }, [isKiosk]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/customer-display/snapshot', {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error('snapshot not ok');
        const data = (await res.json()) as CustomerDisplaySnapshot;
        if (!cancelled) {
          setSnapshot(data);
          setOffline(false);
        }
      } catch {
        if (!cancelled) setOffline(true);
      }
    };

    void load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (offline && !snapshot) {
    return (
      <div className="customer-display offline">
        <h1>無法連線主機</h1>
        <p>請確認主機已啟動且平板與主機在同一區網</p>
      </div>
    );
  }

  if (!snapshot || snapshot.status === 'idle') {
    return (
      <div className={`customer-display welcome ${isKiosk ? 'kiosk' : ''}`}>
        <h1>{snapshot?.message ?? '歡迎光臨'}</h1>
        <p>小蜜蜂行動收銀</p>
      </div>
    );
  }

  if (snapshot.status === 'thankyou') {
    return (
      <div className={`customer-display thankyou ${isKiosk ? 'kiosk' : ''}`}>
        <h1>謝謝惠顧</h1>
        {snapshot.message && <p>{snapshot.message}</p>}
      </div>
    );
  }

  return (
    <div className={`customer-display ${isKiosk ? 'kiosk' : ''}`}>
      <header className="cd-header">
        <h1>Bee POS</h1>
      </header>

      <main className="cd-main">
        <ul className="cd-items">
          {snapshot.items.map((item, index) => (
            <li
              key={item.product_id ?? `${item.name}-${index}`}
              className={item.sold_out ? 'sold-out' : ''}
            >
              <span className="name">
                {item.name}
                {item.sold_out && <span className="badge">已售完</span>}
              </span>
              <span className="qty">×{item.quantity}</span>
              <span className="price">
                ${(item.unit_price * item.quantity).toFixed(0)}
              </span>
            </li>
          ))}
        </ul>
      </main>

      <footer className="cd-footer">
        <div className="total-label">合計</div>
        <div className="total-value">${snapshot.total.toFixed(0)}</div>
      </footer>

      {offline && (
        <div className="cd-offline-banner" role="status">
          連線不穩，顯示可能非最新
        </div>
      )}
    </div>
  );
}
