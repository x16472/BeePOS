import { Order, SystemStatus, DailySettlement, SyncLog, AppTheme } from '../types';
import { request } from './api';

let orders: Order[] = [];
let logs: SyncLog[] = [];
export const StorageService = {
  getTheme(): AppTheme { return localStorage.getItem('bee_pos_theme_v1') === 'light' ? 'light' : 'dark'; },
  setTheme(theme: AppTheme) { localStorage.setItem('bee_pos_theme_v1', theme); },
  getPin(): string { return localStorage.getItem('bee_pos_pin_v1') || '8888'; },
  setPin(pin: string) { localStorage.setItem('bee_pos_pin_v1', pin); },
  getOrders(): Order[] { return orders; },
  cacheOrders(value: Order[]) { orders = value; },
  getSyncLogs(): SyncLog[] { return logs; },
  cacheSyncLogs(value: SyncLog[]) { logs = value; },
  saveSettlement(value: DailySettlement): Promise<DailySettlement> { return request('/settlements', 'POST', value); },
  getSystemStatus(): SystemStatus {
    return { isArmHostOnline: false, is4GConnected: false, isVpnConnected: false,
      isHomeLabReachable: false, lastSyncTime: null, batteryLevel: 0 };
  },
  exportOrdersJSON(): string { return JSON.stringify(orders, null, 2); },
  exportOrdersCSV(): string {
    const quote = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const rows: unknown[][] = [['訂單編號', '建立時間', '總金額', '實收現金', '找零金額', '訂單狀態', '同步狀態', '品項明細']];
    orders.forEach(o => rows.push([o.order_no, o.created_at, o.total_amount, o.received_amount,
      o.change_amount, o.status, o.sync_status, o.items.map(i => i.product_name + 'x' + i.quantity).join(';')]));
    return rows.map(row => row.map(quote).join(',')).join('\r\n');
  },
};
export default StorageService;
