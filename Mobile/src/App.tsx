/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Product, Order, SystemStatus, AppTheme } from './types';
import { Api, request } from './services/api';
import { StorageService } from './services/storage';
import { TopStatusBar } from './components/TopStatusBar';
import { BottomNav, NavTab } from './components/BottomNav';
import { CashierView } from './components/CashierView';
import { OrdersView } from './components/OrdersView';
import { ProductsView } from './components/ProductsView';
import { SyncStatusView } from './components/SyncStatusView';
import { PinLockModal } from './components/PinLockModal';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('cashier');
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [pin, setPin] = useState<string>('8888');
  const [theme, setTheme] = useState<AppTheme>(StorageService.getTheme());

  // Core state
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>(StorageService.getSystemStatus());

  const [error, setError] = useState('');

  const refresh = async () => {
    const [nextProducts, nextOrders] = await Promise.all([Api.products(), Api.orders()]);
    setProducts(nextProducts);
    setOrders(nextOrders);
    StorageService.cacheOrders(nextOrders);
    setSystemStatus(previous => ({ ...previous, isArmHostOnline: true }));
    try {
      const status = await Api.status();
      StorageService.cacheSyncLogs(status.logs);
      setSystemStatus(previous => ({ ...previous, isHomeLabReachable: status.isHomeLabReachable, lastSyncTime: status.lastSyncTime }));
    } catch {
      setSystemStatus(previous => ({ ...previous, isHomeLabReachable: false }));
    }
  };

  useEffect(() => {
    setPin(StorageService.getPin());
    const load = () => refresh().catch(e => {
      setError(e.message);
      setSystemStatus(previous => ({ ...previous, isArmHostOnline: false, isHomeLabReachable: false }));
    });
    void load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  const pendingSyncCount = orders.filter(o => o.sync_status === 'pending').length;
  const handleToggleTheme = (newTheme: AppTheme) => {
    setTheme(newTheme);
    StorageService.setTheme(newTheme);
  };
  const handleCompleteOrder = async (order: Order): Promise<Order> => {
    const saved = await request<Order>('/orders', 'POST', {
      id: order.id, received_amount: order.received_amount,
      items: order.items.map(i => ({ product_id: i.product_id, product_name: i.product_name, unit_price: i.unit_price, quantity: i.quantity })),
    });
    setOrders(previous => {
      const updated = [saved, ...previous.filter(o => o.id !== saved.id)];
      StorageService.cacheOrders(updated);
      return updated;
    });
    return saved;
  };
  const handleUpdateOrderStatus = async (id: string, status: 'completed' | 'cancelled', note?: string) => {
    const updated = await request<Order[]>('/orders/' + encodeURIComponent(id), 'PATCH', { status, note });
    setOrders(updated);
    StorageService.cacheOrders(updated);
  };
  const handleSaveProduct = async (product: Product) => {
    const exists = products.some(p => p.id === product.id);
    setProducts(await request<Product[]>(exists ? '/products/' + encodeURIComponent(product.id) : '/products', exists ? 'PUT' : 'POST', product));
  };
  const handleDeleteProduct = async (id: string) => {
    setProducts(await request<Product[]>('/products/' + encodeURIComponent(id), 'DELETE'));
  };
  const handleToggleActive = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (product) {
      try { await handleSaveProduct({ ...product, is_active: !product.is_active }); }
      catch (e) { setError((e as Error).message); }
    }
  };
  const handleOrdersSynced = async () => { await refresh(); };
  const handleResetData = () => { void refresh().catch(e => setError(e.message)); };

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden font-sans antialiased selection:bg-amber-500 selection:text-slate-950 transition-colors ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {error && <div role="alert" className="p-3 bg-red-800 text-white" onClick={() => setError('')}>{error}（點此關閉）</div>}
      {/* Top Persistent Status Bar */}
      <TopStatusBar
        systemStatus={systemStatus}
        pendingSyncCount={pendingSyncCount}
        onLockScreen={() => setIsLocked(true)}
        onOpenSync={() => setCurrentTab('sync')}
        theme={theme}
      />

      {/* Main Viewport */}
      <main className="flex-1 relative overflow-hidden">
        {currentTab === 'cashier' && (
          <CashierView
            products={products}
            onCompleteOrder={handleCompleteOrder}
            theme={theme}
          />
        )}

        {currentTab === 'orders' && (
          <OrdersView
            orders={orders}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            theme={theme}
          />
        )}

        {currentTab === 'products' && (
          <ProductsView
            products={products}
            onSaveProduct={handleSaveProduct}
            onDeleteProduct={handleDeleteProduct}
            onToggleActive={handleToggleActive}
            theme={theme}
          />
        )}

        {currentTab === 'sync' && (
          <SyncStatusView
            orders={orders}
            systemStatus={systemStatus}
            onOrdersSynced={handleOrdersSynced}
            onResetData={handleResetData}
            theme={theme}
            onToggleTheme={handleToggleTheme}
            onBackToCashier={() => setCurrentTab('cashier')}
          />
        )}
      </main>

      {/* Bottom Sticky Navigation */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        pendingSyncCount={pendingSyncCount}
        theme={theme}
      />

      {/* PIN Lock Screen Modal */}
      {isLocked && (
        <PinLockModal
          correctPin={pin}
          onUnlock={() => setIsLocked(false)}
          theme={theme}
        />
      )}
    </div>
  );
}
