import { Order, Product, SyncLog } from '../types';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function request<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      method,
      headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    throw new Error('無法連線到本機主機，請保留目前資料並重試；結帳重試不會重複建單');
  }
  const result = await response.json().catch(() => {
    throw new Error('無法確認服務回應，請保留交易並重試');
  });
  if (!response.ok) throw new ApiError(result.error || '操作失敗', response.status);
  return result as T;
}

export interface SyncStatus {
  isHomeLabReachable: boolean;
  lastSyncTime: string | null;
  message: string;
  pending_sync_count: number;
  logs: SyncLog[];
}

export const Api = {
  products: () => request<Product[]>('/products'),
  orders: () => request<Order[]>('/orders'),
  status: () => request<SyncStatus>('/sync/status'),
  sync: () => request<{ message: string }>('/sync', 'POST'),
};

// 區網 HTTP 不保證提供 randomUUID，但仍可使用安全亂數產生交易識別碼。
export function transactionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
