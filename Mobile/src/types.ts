export interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  is_active: boolean;
  is_favorite: boolean;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id?: number;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: number;
  request_id?: string;
  order_no: string; // 臺灣時間 YYYYMMDD-HHmmss-ffffff
  created_at: string;
  updated_at?: string;
  total_amount: number;
  received_amount: number;
  change_amount: number;
  status: 'completed' | 'cancelled';
  sync_status: 'pending' | 'synced';
  synced_at?: string;
  note?: string;
  items: OrderItem[];
}

export interface CartItem {
  productId?: number;
  name: string;
  price: number;
  quantity: number;
}

export interface DailySettlement {
  id: number;
  request_id?: string;
  date: string;
  total_sales: number;
  order_count: number;
  cash_expected: number;
  cash_actual: number;
  discrepancy: number;
  notes?: string;
  created_at: string;
}

export interface SyncLog {
  id: number;
  timestamp: string;
  orders_synced: number;
  status: 'success' | 'failed';
  message: string;
}

export type AppTheme = 'dark' | 'light';

export interface SystemStatus {
  isArmHostOnline: boolean;
  is4GConnected: boolean;
  isVpnConnected: boolean;
  isHomeLabReachable: boolean;
  lastSyncTime: string | null;
  batteryLevel: number; // Simulated 12V car battery / backup
}
