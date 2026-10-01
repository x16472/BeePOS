import React, { useState } from 'react';
import { Receipt, Clock, CheckCircle, Ban, X, Calculator, ChevronRight } from 'lucide-react';
import { Order, DailySettlement, AppTheme } from '../types';
import { StorageService } from '../services/storage';

interface OrdersViewProps {
  orders: Order[];
  onUpdateOrderStatus: (orderId: number, status: 'completed' | 'cancelled', note?: string) => Promise<void>;
  theme?: AppTheme;
}

export const OrdersView: React.FC<OrdersViewProps> = ({ orders, onUpdateOrderStatus, theme = 'dark' }) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isSettlementOpen, setIsSettlementOpen] = useState<boolean>(false);
  const [actualCashInput, setActualCashInput] = useState<string>('');
  const [settlementNote, setSettlementNote] = useState<string>('');
  const [savedSettlement, setSavedSettlement] = useState<DailySettlement | null>(null);

  // Today's stats calculation (only active completed orders)
  const completedOrders = orders.filter(o => o.status === 'completed' && new Date(o.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) === new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }));
  const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total_amount, 0);
  const totalOrdersCount = completedOrders.length;
  const avgOrderTicket = totalOrdersCount > 0 ? Math.round(totalRevenue / totalOrdersCount) : 0;
  const pendingCount = orders.filter(o => o.sync_status === 'pending').length;

  // Filtered orders list
  const filteredOrders = orders.filter(o => {
    if (filter === 'pending') return o.sync_status === 'pending';
    if (filter === 'completed') return o.status === 'completed';
    if (filter === 'cancelled') return o.status === 'cancelled';
    return true;
  });

  // Handle Void/Cancel Order
  const handleVoidOrder = async (orderId: number) => {
    const reason = window.prompt('請輸入作廢原因（例如：顧客取消、按錯金額）：', '顧客取消');
    if (reason !== null) {
      try { await onUpdateOrderStatus(orderId, 'cancelled', reason); }
      catch (e) { window.alert((e as Error).message); return; }
      setSelectedOrder(null);
    }
  };

  // Handle Daily Settlement Save
  const handleSaveSettlement = async () => {
    const cashActual = parseInt(actualCashInput, 10) || 0;
    const discrepancy = cashActual - totalRevenue;
    
    const settlement: DailySettlement = {
      id: 0,
      request_id: `set-${Date.now()}`,
      date: new Date().toLocaleDateString('zh-TW'),
      total_sales: totalRevenue,
      order_count: totalOrdersCount,
      cash_expected: totalRevenue,
      cash_actual: cashActual,
      discrepancy: discrepancy,
      notes: settlementNote,
      created_at: new Date().toISOString()
    };

    try { setSavedSettlement(await StorageService.saveSettlement(settlement)); }
    catch (e) { window.alert((e as Error).message); return; }
    setTimeout(() => {
      setIsSettlementOpen(false);
      setSavedSettlement(null);
      setActualCashInput('');
      setSettlementNote('');
    }, 2000);
  };

  return (
    <div className={`flex flex-col h-full pb-24 overflow-y-auto select-none transition-colors ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
    }`}>
      {/* Top Header & Daily Action */}
      <div className={`p-3 md:px-6 sticky top-0 z-10 border-b ${
        theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="max-w-4xl lg:max-w-5xl mx-auto w-full flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-500" />
              <span>今日訂單流水</span>
            </h1>
            <span className="text-xs opacity-60">
              {new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })}
            </span>
          </div>

          <button
            onClick={() => {
              setActualCashInput(totalRevenue.toString());
              setIsSettlementOpen(true);
            }}
            className="px-3.5 py-1.5 md:py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs md:text-sm flex items-center gap-1.5 shadow-md shadow-amber-500/10"
          >
            <Calculator className="w-4 h-4" />
            <span>今日打烊結算</span>
          </button>
        </div>
      </div>

      <div className="p-3 md:p-6 max-w-4xl lg:max-w-5xl mx-auto w-full space-y-3">
        {/* Today Summary Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Revenue */}
          <div className={`border rounded-2xl p-3 shadow-sm ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <span className="text-[11px] opacity-60 block mb-0.5">今日總營業額</span>
            <span className="font-mono text-xl font-black text-amber-500">
              NT${totalRevenue.toLocaleString()}
            </span>
          </div>

          {/* Orders Count */}
          <div className={`border rounded-2xl p-3 shadow-sm ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <span className="text-[11px] opacity-60 block mb-0.5">完成訂單筆數</span>
            <span className="font-mono text-xl font-black text-emerald-500">
              {totalOrdersCount} 筆
            </span>
          </div>

          {/* Average Ticket */}
          <div className={`border rounded-2xl p-3 shadow-sm ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <span className="text-[11px] opacity-60 block mb-0.5">平均客單價</span>
            <span className="font-mono text-xl font-bold">
              NT${avgOrderTicket}
            </span>
          </div>

          {/* Pending Sync */}
          <div className={`border rounded-2xl p-3 shadow-sm ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <span className="text-[11px] opacity-60 block mb-0.5">待同步回家中</span>
            <span className={`font-mono text-xl font-bold ${pendingCount > 0 ? 'text-amber-500' : 'opacity-50'}`}>
              {pendingCount} 筆
            </span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {[
            { key: 'all', label: `全部 (${orders.length})` },
            { key: 'pending', label: `待同步 (${pendingCount})` },
            { key: 'completed', label: `正常完成 (${completedOrders.length})` },
            { key: 'cancelled', label: `已作廢 (${orders.filter(o => o.status === 'cancelled').length})` }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as typeof filter)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                filter === tab.key
                  ? 'bg-amber-500 text-slate-950'
                  : theme === 'dark'
                  ? 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 shadow-sm'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Orders List */}
        {filteredOrders.length === 0 ? (
          <div className={`border rounded-2xl p-8 text-center opacity-60 ${
            theme === 'dark' ? 'bg-slate-900/60 border-slate-800/80' : 'bg-white border-slate-200'
          }`}>
            <Receipt className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">目前無相符的訂單紀錄</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map(order => {
              const isCancelled = order.status === 'cancelled';
              const isPendingSync = order.sync_status === 'pending';

              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className={`border rounded-2xl p-3.5 flex items-center justify-between gap-3 cursor-pointer active:scale-98 transition-all shadow-sm ${
                    isCancelled
                      ? 'border-rose-500/30 opacity-60 bg-rose-500/5'
                      : theme === 'dark'
                      ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono font-black text-amber-500 text-sm break-all">
                        {order.order_no}
                      </span>
                      <span className="text-xs opacity-60 block basis-full leading-relaxed">
                        <Clock className="w-3 h-3 inline mr-1" />
                        建立：{new Date(order.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}
                        <br />修改：{new Date(order.updated_at || order.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}
                      </span>

                      {/* Sync Badge */}
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          isPendingSync
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                            : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                        }`}
                      >
                        {isPendingSync ? '待同步' : '已同步'}
                      </span>

                      {isCancelled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-500 font-bold">
                          已作廢
                        </span>
                      )}
                    </div>

                    {/* Items brief */}
                    <p className="text-xs opacity-75 truncate">
                      {order.items.map(i => `${i.product_name} ×${i.quantity}`).join('、 ')}
                    </p>
                  </div>

                  {/* Order Total & Change */}
                  <div className="text-right shrink-0">
                    <div className={`font-mono text-lg font-black ${isCancelled ? 'line-through opacity-50' : ''}`}>
                      NT${order.total_amount}
                    </div>
                    <div className="text-[11px] opacity-60">
                      收 ${order.received_amount} / 找 ${order.change_amount}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 opacity-40 shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <div className={`border rounded-3xl p-5 max-w-sm w-full max-h-[90vh] flex flex-col shadow-2xl ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            {/* Modal Header */}
            <div className={`flex items-center justify-between pb-3 border-b ${
              theme === 'dark' ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <div>
                <span className="text-xs opacity-60 font-mono">
                  建立：{new Date(selectedOrder.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}
                  <br />
                  修改：{new Date(selectedOrder.updated_at || selectedOrder.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}
                </span>
                <h3 className="text-base sm:text-xl font-bold text-amber-500 break-all">
                  訂單明細 {selectedOrder.order_no}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className={`p-1.5 rounded-full ${
                  theme === 'dark' ? 'bg-slate-800 text-slate-400 hover:text-slate-200' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items detail list */}
            <div className={`flex-1 overflow-y-auto py-3 divide-y ${
              theme === 'dark' ? 'divide-slate-800/60' : 'divide-slate-100'
            }`}>
              {selectedOrder.items.map((item, idx) => (
                <div key={idx} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold">{item.product_name}</p>
                    <p className="text-xs opacity-60 font-mono">
                      NT${item.unit_price} × {item.quantity}
                    </p>
                  </div>
                  <span className="font-mono font-bold">
                    NT${item.subtotal}
                  </span>
                </div>
              ))}
            </div>

            {/* Money breakdown */}
            <div className={`rounded-2xl p-3 border space-y-1.5 text-sm my-2 ${
              theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex justify-between opacity-75">
                <span>應收總金額</span>
                <span className="font-mono font-bold">
                  NT${selectedOrder.total_amount}
                </span>
              </div>
              <div className="flex justify-between opacity-75">
                <span>實收現金</span>
                <span className="font-mono text-amber-500 font-bold">
                  NT${selectedOrder.received_amount}
                </span>
              </div>
              <div className="flex justify-between opacity-75">
                <span>找零金額</span>
                <span className="font-mono text-emerald-500 font-bold">
                  NT${selectedOrder.change_amount}
                </span>
              </div>
              <div className={`flex justify-between text-xs opacity-60 pt-1 border-t ${
                theme === 'dark' ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <span>同步狀態</span>
                <span>{selectedOrder.sync_status === 'synced' ? '已同步至 SQL Server' : '待批次同步 (本地儲存安全)'}</span>
              </div>
              {selectedOrder.note && (
                <div className="text-xs text-rose-500 pt-1">
                  備註：{selectedOrder.note}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-2 flex gap-2">
              {selectedOrder.status === 'completed' && (
                <button
                  onClick={() => handleVoidOrder(selectedOrder.id)}
                  className="flex-1 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 font-bold text-sm hover:bg-rose-500/20 active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Ban className="w-4 h-4" />
                  <span>作廢此筆訂單</span>
                </button>
              )}
              <button
                onClick={() => setSelectedOrder(null)}
                className={`flex-1 py-3 rounded-xl font-bold text-sm active:scale-95 ${
                  theme === 'dark' ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-300'
                }`}
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Daily Settlement Modal */}
      {isSettlementOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <div className={`border rounded-3xl p-5 max-w-sm w-full shadow-2xl ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${
              theme === 'dark' ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-bold">今日打烊點鈔結算</h3>
              </div>
              <button
                onClick={() => setIsSettlementOpen(false)}
                className={`p-1.5 rounded-full ${
                  theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {savedSettlement ? (
              <div className="py-6 text-center space-y-2">
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
                <h4 className="text-lg font-bold">結算完成並已歸檔！</h4>
                <p className="text-xs opacity-60">已記錄今日零錢包/現金袋總額，待收工同步至 Home Lab</p>
              </div>
            ) : (
              <div className="py-3 space-y-3">
                <div className={`p-3 rounded-2xl border ${
                  theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-xs opacity-60 block">系統應有現金總額</span>
                  <span className="font-mono text-2xl font-black text-amber-500">
                    NT${totalRevenue.toLocaleString()}
                  </span>
                </div>

                <div>
                  <label className="text-xs opacity-60 block mb-1 font-medium">
                    實點零錢袋/隨身現金金額 (NT$)
                  </label>
                  <input
                    type="number"
                    value={actualCashInput}
                    onChange={e => setActualCashInput(e.target.value)}
                    placeholder="請輸入點鈔實數"
                    className={`w-full border rounded-xl px-3 py-2.5 text-lg font-mono font-bold focus:border-amber-500 outline-none ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                {actualCashInput && (
                  <div className="text-xs flex justify-between px-1">
                    <span className="opacity-60">差額 (溢/缺)：</span>
                    <span
                      className={`font-mono font-bold ${
                        parseInt(actualCashInput, 10) - totalRevenue === 0
                          ? 'text-emerald-500'
                          : parseInt(actualCashInput, 10) - totalRevenue > 0
                          ? 'text-sky-500'
                          : 'text-rose-500'
                      }`}
                    >
                      {parseInt(actualCashInput, 10) - totalRevenue > 0 ? '+' : ''}
                      NT${parseInt(actualCashInput, 10) - totalRevenue}
                    </span>
                  </div>
                )}

                <div>
                  <label className="text-xs opacity-60 block mb-1 font-medium">備註說明</label>
                  <input
                    type="text"
                    value={settlementNote}
                    onChange={e => setSettlementNote(e.target.value)}
                    placeholder="例如：找零銅板備足、天候不佳早收工"
                    className={`w-full border rounded-xl px-3 py-2 text-sm focus:border-amber-500 outline-none ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <button
                  onClick={handleSaveSettlement}
                  className="w-full mt-2 py-3.5 bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-black rounded-xl text-base shadow-lg shadow-emerald-500/20"
                >
                  確認結算並存檔
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
