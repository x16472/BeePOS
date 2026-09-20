import React, { useState, useRef } from 'react';
import { 
  ShoppingBag, Plus, Minus, Trash2, X, ChevronUp, ChevronDown, 
  CheckCircle2, DollarSign, Calculator, AlertCircle, RefreshCw, Menu, Check
} from 'lucide-react';
import { Product, CartItem, Order, OrderItem, AppTheme } from '../types';

import { transactionId, ApiError } from '../services/api';

interface CashierViewProps {
  products: Product[];
  onCompleteOrder: (order: Order) => Promise<Order>;
  theme?: AppTheme;
}

interface ChangeConfirmData {
  orderNo: string;
  totalAmount: number;
  receivedAmount: number;
  changeAmount: number;
  itemCount: number;
}

export const CashierView: React.FC<CashierViewProps> = ({ products, onCompleteOrder, theme = 'dark' }) => {
  const sending = useRef(false);
  const [isSending, setIsSending] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<Order | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('bee_pending_checkout') || 'null'); }
    catch { return null; }
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState<boolean>(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartExpanded, setIsCartExpanded] = useState<boolean>(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState<boolean>(false);
  const [changeConfirmModal, setChangeConfirmModal] = useState<ChangeConfirmData | null>(null);

  // Custom quick cash mode state
  const [customName, setCustomName] = useState<string>('自訂品項');
  const [customPriceStr, setCustomPriceStr] = useState<string>('');

  // Cash payment state
  const [receivedAmount, setReceivedAmount] = useState<number>(0);
  const [receivedInputStr, setReceivedInputStr] = useState<string>('');
  const [isInitialExact, setIsInitialExact] = useState<boolean>(true);

  // Extract available categories
  const categories = ['全部', ...Array.from(new Set(products.map(p => p.category))), '自訂無碼'];

  // Filter products
  const filteredProducts = products.filter(p => {
    if (selectedCategory === '全部') return true;
    return p.category === selectedCategory;
  });

  // Cart calculations
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Sound generator
  const playSound = (type: 'beep' | 'success') => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (type === 'beep') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } else if (type === 'success') {
        // Register chime
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
          gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.08);
          osc.stop(ctx.currentTime + idx * 0.08 + 0.25);
        });
      }
    } catch {
      // Audio context restricted
    }
  };

  // Add product to cart
  const addToCart = (product: Product) => {
    if (!product.is_active) return;
    playSound('beep');
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  };

  // Update item quantity
  const updateQuantity = (index: number, delta: number) => {
    playSound('beep');
    setCart(prev => {
      const target = prev[index];
      const newQty = target.quantity + delta;
      if (newQty <= 0) {
        return prev.filter((_, i) => i !== index);
      }
      return prev.map((item, i) => (i === index ? { ...item, quantity: newQty } : item));
    });
  };

  // Remove single item
  const removeItem = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  // Clear entire cart with in-app confirmation
  const clearCart = () => {
    if (cart.length === 0) return;
    setIsClearConfirmOpen(true);
  };

  const handleConfirmClearCart = () => {
    playSound('beep');
    setCart([]);
    setIsCartExpanded(false);
    setIsClearConfirmOpen(false);
  };

  // Add custom unlisted item
  const handleAddCustomItem = () => {
    const price = parseInt(customPriceStr, 10);
    if (isNaN(price) || price <= 0) return;
    playSound('beep');
    setCart(prev => [
      ...prev,
      {
        productId: undefined,
        name: customName.trim() || '自訂品項',
        price: price,
        quantity: 1
      }
    ]);
    setCustomPriceStr('');
    setCustomName('');
  };

  // Cumulative quick add for custom unlisted item
  const handleCustomQuickAdd = (amt: number) => {
    playSound('beep');
    const currentVal = parseInt(customPriceStr || '0', 10);
    const nextVal = Math.min(99999, currentVal + amt);
    setCustomPriceStr(nextVal.toString());
  };

  // Open checkout drawer
  const openCheckout = () => {
    if (cart.length === 0) return;
    // Default received amount to exact total
    setReceivedAmount(totalAmount);
    setReceivedInputStr(totalAmount.toString());
    setIsInitialExact(true);
    setIsCheckoutOpen(true);
    setIsCartExpanded(false);
  };

  // Exact cash button (剛好不找)
  const handleExactCash = () => {
    playSound('beep');
    setReceivedAmount(totalAmount);
    setReceivedInputStr(totalAmount.toString());
    setIsInitialExact(true);
  };

  // Cumulative quick add for all amount keys (+10, +100, +500, +1000)
  const handleQuickAdd = (add: number) => {
    playSound('beep');
    // If user opened checkout with default exact total, first amount key starts accumulating from 0
    const baseAmt = isInitialExact ? 0 : (receivedAmount || 0);
    setIsInitialExact(false);
    const newAmt = Math.min(999999, baseAmt + add);
    setReceivedAmount(newAmt);
    setReceivedInputStr(newAmt.toString());
  };

  // Number pad input for received amount
  const handleReceivedNumpad = (char: string) => {
    playSound('beep');
    if (char === 'CLEAR') {
      setReceivedInputStr('');
      setReceivedAmount(0);
      setIsInitialExact(false);
      return;
    }
    if (char === 'EXACT') {
      handleExactCash();
      return;
    }

    let nextStr = isInitialExact ? char : (receivedInputStr + char);
    setIsInitialExact(false);

    // Prevent multiple leading zeroes
    if (nextStr.length > 6) return;
    const val = parseInt(nextStr, 10);
    setReceivedInputStr(isNaN(val) ? '' : val.toString());
    setReceivedAmount(isNaN(val) ? 0 : val);
  };

  // Change amount
  const changeAmount = Math.max(0, receivedAmount - totalAmount);
  const isSufficient = receivedAmount >= totalAmount;

  // Cash change denomination breakdown helper
  const getChangeBreakdown = (change: number): string | null => {
    if (change <= 0) return null;
    let rem = change;
    const b1000 = Math.floor(rem / 1000);
    rem %= 1000;
    const b500 = Math.floor(rem / 500);
    rem %= 500;
    const b100 = Math.floor(rem / 100);
    rem %= 100;
    const c50 = Math.floor(rem / 50);
    rem %= 50;
    const c10 = Math.floor(rem / 10);
    rem %= 10;
    const c5 = Math.floor(rem / 5);
    const c1 = rem % 5;

    const parts = [];
    if (b1000 > 0) parts.push(`1000元×${b1000}`);
    if (b500 > 0) parts.push(`500元×${b500}`);
    if (b100 > 0) parts.push(`100元×${b100}`);
    if (c50 > 0) parts.push(`50元×${c50}`);
    if (c10 > 0) parts.push(`10元×${c10}`);
    if (c5 > 0) parts.push(`5元×${c5}`);
    if (c1 > 0) parts.push(`1元×${c1}`);
    return parts.join(' · ');
  };

  // Complete checkout
  const handleFinalizeCheckout = async () => {
    if (sending.current) return;
    if (!pendingOrder && (!isSufficient || cart.length === 0)) return;

    // 正式訂單編號由主機依建立時間分配。
    const orderNo = '待主機編號';
    const newOrderItems: OrderItem[] = cart.map((item, idx) => ({
      id: `it-${Date.now()}-${idx}`,
      order_id: '',
      product_id: item.productId,
      product_name: item.name,
      unit_price: item.price,
      quantity: item.quantity,
      subtotal: item.price * item.quantity
    }));

    const newOrder: Order = {
      id: transactionId(),
      order_no: orderNo,
      created_at: new Date().toISOString(),
      total_amount: totalAmount,
      received_amount: receivedAmount,
      change_amount: changeAmount,
      status: 'completed',
      sync_status: 'pending', // Pending sync to Home Lab SQL Server
      items: newOrderItems
    };

    sending.current = true;
    // 回應中斷時保留相同內容與識別碼，讓再次確認安全重試。
    const submitted = pendingOrder || newOrder;
    setIsSending(true);
    let saved: Order;
    try {
      sessionStorage.setItem('bee_pending_checkout', JSON.stringify(submitted));
      setPendingOrder(submitted);
      saved = await onCompleteOrder(submitted);
      sessionStorage.removeItem('bee_pending_checkout');
      setPendingOrder(null);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        sessionStorage.removeItem('bee_pending_checkout');
        setPendingOrder(null);
      }
      window.alert((e as Error).message);
      return;
    } finally {
      sending.current = false;
      setIsSending(false);
    }
    playSound('success');

    // Open persistent change verification modal
    setChangeConfirmModal({
      orderNo: saved.order_no,
      totalAmount: saved.total_amount,
      receivedAmount: saved.received_amount,
      changeAmount: saved.change_amount,
      itemCount: saved.items.reduce((sum, item) => sum + item.quantity, 0)
    });

    // Close checkout sheet and reset input
    setIsCheckoutOpen(false);
    setCart([]);
    setReceivedAmount(0);
    setReceivedInputStr('');
  };

  return (
    <div className={`flex flex-col h-full relative overflow-hidden select-none ${
      totalQuantity > 0 ? 'pb-44' : 'pb-24'
    } ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
    }`}>
      {pendingOrder && <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6">
        <div className="bg-slate-900 text-white p-6 rounded-2xl max-w-sm space-y-4">
          <h2>確認交易結果</h2>
          <p>此筆交易實收 {pendingOrder.received_amount} 元。請確認結果後再開始下一筆交易；重試會使用相同識別碼。</p>
          <button disabled={isSending} onClick={handleFinalizeCheckout} className="bg-amber-500 text-black p-3 rounded-xl">
            {isSending ? '正在確認…' : '重試並確認交易'}
          </button>
        </div>
      </div>}
      {/* Category & Subtotal Bar: Three-line menu button on left, Subtotal on right */}
      <div className={`p-2.5 px-3 md:px-6 border-b transition-colors ${
        theme === 'dark'
          ? 'bg-slate-900 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900 shadow-sm'
      }`}>
        <div className="max-w-4xl lg:max-w-5xl mx-auto w-full flex items-center justify-between gap-3">
          {/* Left: Three-line menu button (☰) & active category name */}
          <button
            onClick={() => setIsCategoryMenuOpen(true)}
            className={`flex items-center gap-2 px-3.5 py-2 md:py-2.5 rounded-xl text-sm md:text-base font-bold border transition-all active:scale-95 ${
              theme === 'dark'
                ? 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-100'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-900'
            }`}
            aria-label="選擇菜單分類"
          >
            <Menu className="w-5 h-5 text-amber-500" />
            <span className="truncate max-w-[130px] md:max-w-[200px]">{selectedCategory}</span>
            <ChevronDown className="w-4 h-4 opacity-60" />
          </button>

          {/* Right: Subtotal (小計) */}
          <button
            onClick={() => totalQuantity > 0 && setIsCartExpanded(prev => !prev)}
            className={`flex items-center gap-2 px-3.5 py-1.5 md:py-2 rounded-xl border transition-all active:scale-95 ${
              totalQuantity > 0
                ? theme === 'dark'
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                  : 'bg-amber-50 border-amber-300 text-amber-800'
                : theme === 'dark'
                  ? 'bg-slate-800/60 border-slate-700/60 text-slate-400'
                  : 'bg-slate-100 border-slate-200 text-slate-400'
            }`}
            title="查看小計明細"
          >
            <span className="text-xs md:text-sm font-medium">小計</span>
            <span className="font-mono font-black text-base md:text-lg">NT${totalAmount}</span>
            {totalQuantity > 0 && (
              <span className={`text-[11px] md:text-xs px-1.5 py-0.5 rounded-full font-bold ${
                theme === 'dark' ? 'bg-amber-500 text-slate-950' : 'bg-amber-500 text-white'
              }`}>
                {totalQuantity}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Category Selection Sheet Modal */}
      {isCategoryMenuOpen && (
        <div 
          onClick={() => setIsCategoryMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm flex flex-col justify-end pb-20 md:pb-22"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`border-t rounded-t-3xl md:rounded-3xl p-4 md:p-6 max-w-2xl md:max-w-3xl mx-auto w-full shadow-2xl max-h-[75vh] flex flex-col ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${
              theme === 'dark' ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <div className="flex items-center gap-2 font-bold text-base md:text-lg">
                <Menu className="w-5 h-5 text-amber-500" />
                <span>切換菜單類別</span>
              </div>
              <button
                onClick={() => setIsCategoryMenuOpen(false)}
                className={`p-1.5 rounded-full ${
                  theme === 'dark' ? 'bg-slate-800 text-slate-400 hover:text-slate-100' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 py-3 overflow-y-auto">
              {categories.map(cat => {
                const isSelected = selectedCategory === cat;
                const count = cat === '全部'
                  ? products.length
                  : cat === '自訂無碼'
                  ? 0
                  : products.filter(p => p.category === cat).length;

                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setIsCategoryMenuOpen(false);
                    }}
                    className={`p-4 rounded-2xl border flex items-center justify-between transition-all active:scale-98 ${
                      isSelected
                        ? theme === 'dark'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-bold'
                          : 'bg-amber-50 border-amber-500 text-amber-900 font-bold'
                        : theme === 'dark'
                          ? 'bg-slate-800/70 border-slate-700/60 text-slate-200 hover:bg-slate-800'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {cat === '自訂無碼' ? (
                        <Calculator className="w-5 h-5 text-amber-500" />
                      ) : (
                        <ShoppingBag className="w-5 h-5 opacity-70" />
                      )}
                      <span className="text-base">{cat}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {cat !== '自訂無碼' && (
                        <span className="text-xs opacity-60">({count})</span>
                      )}
                      {isSelected && <Check className="w-5 h-5 text-amber-500" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 md:p-6 max-w-4xl lg:max-w-5xl mx-auto w-full">
        {selectedCategory === '自訂無碼' ? (
          /* Custom Quick Amount Numpad View */
          <div className={`border rounded-2xl p-4 flex flex-col gap-3 shadow-md ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-2 text-amber-500 font-bold text-base">
              <Calculator className="w-5 h-5" />
              <span>快速自訂金額收銀（無條碼/臨時品項）</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs opacity-60 block mb-1">品項簡稱</label>
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="例如：特製便當"
                  className={`w-full border rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>
              <div>
                <label className="text-xs opacity-60 block mb-1">金額 (NT$)</label>
                <div className={`w-full border rounded-xl px-3 py-2 text-lg font-mono font-bold text-amber-500 flex items-center justify-between ${
                  theme === 'dark' ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-300'
                }`}>
                  <span>NT$</span>
                  <span>{customPriceStr || '0'}</span>
                </div>
              </div>
            </div>

            {/* Custom Numpad */}
            <div className="grid grid-cols-3 gap-2 mt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  onClick={() => {
                    playSound('beep');
                    if (customPriceStr.length < 5) setCustomPriceStr(prev => prev + num);
                  }}
                  className={`h-13 rounded-xl text-xl font-bold flex items-center justify-center transition-all ${
                    theme === 'dark'
                      ? 'bg-slate-800 active:bg-amber-500 active:text-slate-950 text-slate-100'
                      : 'bg-slate-100 active:bg-amber-500 active:text-white text-slate-900 border border-slate-200'
                  }`}
                >
                  {num}
                </button>
              ))}
              <button
                onClick={() => setCustomPriceStr('')}
                className={`h-13 rounded-xl text-sm font-semibold flex items-center justify-center ${
                  theme === 'dark' ? 'bg-slate-800/60 text-slate-400 active:bg-slate-700' : 'bg-slate-100 text-slate-500 active:bg-slate-200 border border-slate-200'
                }`}
              >
                清除
              </button>
              <button
                onClick={() => {
                  playSound('beep');
                  if (customPriceStr.length < 5 && customPriceStr !== '') setCustomPriceStr(prev => prev + '0');
                }}
                className={`h-13 rounded-xl text-xl font-bold flex items-center justify-center transition-all ${
                  theme === 'dark'
                    ? 'bg-slate-800 active:bg-amber-500 active:text-slate-950 text-slate-100'
                    : 'bg-slate-100 active:bg-amber-500 active:text-white text-slate-900 border border-slate-200'
                }`}
              >
                0
              </button>
              <button
                onClick={() => {
                  playSound('beep');
                  setCustomPriceStr(prev => prev.slice(0, -1));
                }}
                className={`h-13 rounded-xl text-sm font-semibold flex items-center justify-center ${
                  theme === 'dark' ? 'bg-slate-800/60 text-slate-300 active:bg-slate-700' : 'bg-slate-100 text-slate-600 active:bg-slate-200 border border-slate-200'
                }`}
              >
                ←
              </button>
            </div>

            {/* Quick preset amount chips (Cumulative addition) */}
            <div className="flex items-center justify-between mt-1 text-xs">
              <span className="opacity-60 text-[11px] font-medium">快捷金額累加鍵：</span>
              {customPriceStr && (
                <button
                  type="button"
                  onClick={() => {
                    playSound('beep');
                    setCustomPriceStr('');
                  }}
                  className="text-[11px] text-amber-500 hover:underline cursor-pointer"
                >
                  清除金額
                </button>
              )}
            </div>
            <div className="grid grid-cols-6 gap-1.5 md:gap-2">
              {[10, 20, 35, 50, 100, 150].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleCustomQuickAdd(amt)}
                  className={`py-2 md:py-2.5 rounded-xl border text-xs md:text-sm font-mono font-bold active:scale-95 transition-all flex items-center justify-center ${
                    theme === 'dark'
                      ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-750'
                      : 'bg-amber-50/90 border-amber-200 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  +{amt}
                </button>
              ))}
            </div>

            <button
              onClick={handleAddCustomItem}
              disabled={!customPriceStr || parseInt(customPriceStr, 10) <= 0}
              className="mt-2 w-full h-12 bg-amber-500 hover:bg-amber-400 active:scale-98 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 text-base shadow-md shadow-amber-500/20"
            >
              <Plus className="w-5 h-5" />
              <span>加入當前訂單 (NT$ {customPriceStr || '0'})</span>
            </button>
          </div>
        ) : (
          /* Product Grid */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 md:gap-3.5">
            {filteredProducts.map(product => {
              const inCartCount = cart
                .filter(item => item.productId === product.id)
                .reduce((sum, item) => sum + item.quantity, 0);

              return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={!product.is_active}
                  className={`relative p-3.5 md:p-4 rounded-2xl flex flex-col justify-between text-left transition-all active:scale-95 min-h-[105px] md:min-h-[120px] border ${
                    !product.is_active
                      ? theme === 'dark' ? 'bg-slate-900/40 border-slate-800/50 opacity-40 cursor-not-allowed' : 'bg-slate-100 border-slate-200 opacity-40 cursor-not-allowed'
                      : inCartCount > 0
                      ? theme === 'dark' ? 'bg-slate-900 border-amber-500/60 shadow-md shadow-amber-500/10' : 'bg-white border-amber-500 shadow-md ring-1 ring-amber-400/40'
                      : theme === 'dark' ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  {/* Item In-cart Count Badge */}
                  {inCartCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center shadow-md animate-scale-in">
                      {inCartCount}
                    </span>
                  )}

                  <div>
                    <span className="text-[11px] md:text-xs font-medium opacity-60 block mb-0.5">
                      {product.category}
                    </span>
                    <h2 className="font-bold text-base md:text-lg leading-snug line-clamp-2">
                      {product.name}
                    </h2>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-mono text-lg md:text-xl font-extrabold text-amber-500">
                      NT${product.price}
                    </span>
                    {!product.is_active && (
                      <span className="text-[10px] text-rose-500 font-medium px-1.5 py-0.5 bg-rose-500/10 rounded">
                        已售完
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart Expanded Backdrop & Drawer */}
      {isCartExpanded && (
        <div 
          onClick={() => setIsCartExpanded(false)}
          className="fixed inset-0 z-30 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end pb-20 md:pb-22"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`border-t rounded-t-3xl md:rounded-3xl max-h-[75vh] md:max-h-[80vh] flex flex-col p-4 md:p-6 shadow-2xl max-w-2xl md:max-w-3xl mx-auto w-full ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            {/* Drawer Header */}
            <div className={`flex items-center justify-between pb-3 border-b ${
              theme === 'dark' ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-amber-500" />
                <span className="font-bold text-base md:text-lg">點餐明細 ({totalQuantity} 份)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearCart}
                  disabled={cart.length === 0}
                  className={`text-xs md:text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all active:scale-95 ${
                    cart.length === 0
                      ? 'opacity-40 cursor-not-allowed bg-slate-500/10 text-slate-400'
                      : 'text-rose-500 hover:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30'
                  }`}
                  title="清空購物車"
                  aria-label="清空購物車"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>清空</span>
                </button>
                <button
                  onClick={() => setIsCartExpanded(false)}
                  className={`p-1.5 rounded-full ${
                    theme === 'dark' ? 'bg-slate-800 text-slate-400 hover:text-slate-200' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Cart Items List */}
            <div className={`flex-1 overflow-y-auto py-2 divide-y ${
              theme === 'dark' ? 'divide-slate-800/80' : 'divide-slate-200'
            }`}>
              {cart.map((item, idx) => (
                <div key={idx} className="py-2.5 md:py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm md:text-base truncate">{item.name}</p>
                    <p className="text-xs md:text-sm font-mono opacity-60">
                      NT${item.price} × {item.quantity} = NT${item.price * item.quantity}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 md:gap-3">
                    <button
                      onClick={() => updateQuantity(idx, -1)}
                      className={`w-8 h-8 md:w-9 md:h-9 rounded-lg border flex items-center justify-center active:bg-amber-500 active:text-slate-950 font-bold ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-700'
                      }`}
                    >
                      <Minus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </button>
                    <span className="font-mono font-bold text-base md:text-lg w-6 md:w-8 text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(idx, 1)}
                      className={`w-8 h-8 md:w-9 md:h-9 rounded-lg border flex items-center justify-center active:bg-amber-500 active:text-slate-950 font-bold ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-700'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </button>
                    <button
                      onClick={() => removeItem(idx)}
                      className="p-1.5 opacity-50 hover:opacity-100 hover:text-rose-500"
                    >
                      <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Go to Checkout button */}
            <button
              onClick={openCheckout}
              className="mt-3 w-full h-14 md:h-16 font-extrabold rounded-2xl flex items-center justify-between px-5 md:px-7 text-lg md:text-xl shadow-md bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 transition-all"
            >
              <span>前往現金收銀</span>
              <span className="font-mono">NT${totalAmount}</span>
            </button>
          </div>
        </div>
      )}

      {/* Sticky Bottom Bar (Thumb Zone) - Only shows when items are added */}
      {totalQuantity > 0 && (
        <div className={`fixed bottom-20 left-0 right-0 z-20 px-3 md:px-6 py-2 md:py-2.5 border-t backdrop-blur-md transition-all shadow-xl ${
          theme === 'dark'
            ? 'bg-slate-950/95 border-slate-800/80'
            : 'bg-white/95 border-slate-200 shadow-lg'
        }`}>
          <div className="max-w-4xl lg:max-w-5xl mx-auto grid grid-cols-2 gap-3 md:gap-4 w-full">
            {/* Button 1: 查看明細 (佔 50%) */}
            <button
              id="view-cart-details-btn"
              onClick={() => setIsCartExpanded(prev => !prev)}
              className={`w-full h-13 md:h-15 rounded-2xl border flex items-center justify-between px-3 md:px-5 transition-all shadow-sm active:scale-98 cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-900 border-slate-700/70 text-slate-100 hover:border-amber-500/50'
                  : 'bg-white border-slate-300 text-slate-900 hover:border-amber-500 shadow-slate-200/60'
              }`}
            >
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <div className="relative shrink-0">
                  <ShoppingBag className="w-5 h-5 md:w-6 md:h-6 text-amber-500" />
                  <span className="absolute -top-2 -right-2 w-4 h-4 md:w-5 md:h-5 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] md:text-xs flex items-center justify-center shadow">
                    {totalQuantity}
                  </span>
                </div>
                <div className="text-left truncate">
                  <span className="text-xs md:text-sm font-bold block leading-tight">查看明細</span>
                  <span className="text-[10px] md:text-xs opacity-60 block leading-tight font-mono">{totalQuantity} 份</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-mono font-extrabold text-amber-500 text-sm md:text-base">
                  NT${totalAmount}
                </span>
                {isCartExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 md:w-4 md:h-4 opacity-50" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5 md:w-4 md:h-4 opacity-50" />
                )}
              </div>
            </button>

            {/* Button 2: 結帳 (佔 50%) */}
            <button
              id="direct-checkout-btn"
              onClick={openCheckout}
              className="w-full h-13 md:h-15 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-base md:text-lg flex items-center justify-center gap-2 md:gap-3 shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
            >
              <DollarSign className="w-5 h-5 md:w-6 md:h-6 stroke-[2.5]" />
              <span>結帳</span>
            </button>
          </div>
        </div>
      )}

      {/* Cash Checkout Sheet / Full Screen Modal */}
      {isCheckoutOpen && (
        <div 
          onClick={() => setIsCheckoutOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end md:justify-center p-0 md:p-6 pb-20 md:pb-22 select-none"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-lg md:max-w-xl mx-auto rounded-t-3xl md:rounded-3xl p-4 md:p-6 pb-5 shadow-2xl flex flex-col justify-between max-h-[90vh] md:max-h-[85vh] overflow-y-auto ${
              theme === 'dark' ? 'bg-slate-950 text-slate-100 border md:border border-slate-800' : 'bg-white text-slate-900 border md:border border-slate-200'
            }`}
          >
            {/* Checkout Header */}
            <div className={`flex items-center justify-between border-b pb-3 ${
              theme === 'dark' ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <div>
                <span className="text-xs opacity-60">小蜜蜂餐車 · 現金收銀</span>
                <h2 className="text-xl font-bold">結帳找零計算</h2>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className={`p-2 rounded-full ${
                  theme === 'dark' ? 'bg-slate-800 text-slate-400 hover:text-slate-100' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

          {/* Amount Summary Displays */}
          <div className="grid grid-cols-2 gap-3 my-2">
            {/* Total Due */}
            <div className={`rounded-2xl p-3 text-center border ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-xs font-semibold opacity-60 block mb-1">應收總額</span>
              <span className="font-mono text-2xl font-black">
                NT${totalAmount}
              </span>
            </div>

            {/* Received Cash Display */}
            <div className={`rounded-2xl p-3 text-center border ${
              theme === 'dark' ? 'bg-slate-900 border-amber-500/40' : 'bg-amber-50/70 border-amber-400'
            }`}>
              <span className="text-xs font-semibold text-amber-500 block mb-1">實收現金</span>
              <span className="font-mono text-2xl font-black text-amber-500">
                NT${receivedAmount}
              </span>
            </div>
          </div>

          {/* High-Contrast Change Display Box */}
          <div
            className={`rounded-2xl p-4 border text-center transition-colors shadow-lg ${
              isSufficient
                ? theme === 'dark'
                  ? 'bg-emerald-950/50 border-emerald-500/60 shadow-emerald-500/10'
                  : 'bg-emerald-50 border-emerald-400 shadow-emerald-500/10'
                : theme === 'dark'
                  ? 'bg-amber-950/40 border-amber-500/60 shadow-amber-500/10'
                  : 'bg-amber-50 border-amber-400 shadow-amber-500/10'
            }`}
          >
            <span className={`text-xs font-bold uppercase tracking-wider block mb-0.5 ${
              isSufficient
                ? theme === 'dark' ? 'text-emerald-400' : 'text-emerald-800'
                : theme === 'dark' ? 'text-amber-400' : 'text-amber-800'
            }`}>
              {isSufficient ? '★ 應找零金額 ★' : '⚠ 現金不足 尚欠'}
            </span>
            <div className="font-mono text-4xl font-black tracking-tight">
              {isSufficient ? (
                <span className={theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}>
                  NT$ {changeAmount}
                </span>
              ) : (
                <span className="text-rose-500">-NT$ {totalAmount - receivedAmount}</span>
              )}
            </div>
            <p className="text-[11px] opacity-60 mt-1">
              {isSufficient ? '不連線硬體錢箱，請手動找零給顧客' : '請輸入顧客付給的足額現金面額'}
            </p>
          </div>

          {/* Quick Denomination Presets (All Accumulative + Exact) */}
          <div className="grid grid-cols-4 gap-2 my-1">
            <button
              onClick={handleExactCash}
              className={`py-2.5 rounded-xl border text-xs font-bold active:scale-95 transition-all flex items-center justify-center ${
                theme === 'dark'
                  ? 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-750'
                  : 'bg-slate-100 border-slate-300 text-amber-700 hover:bg-slate-200'
              }`}
            >
              剛好不找
            </button>
            <button
              onClick={() => handleQuickAdd(100)}
              className={`py-2.5 rounded-xl border text-xs font-mono font-bold active:scale-95 transition-all flex items-center justify-center ${
                theme === 'dark'
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:text-amber-400'
                  : 'bg-slate-100 border-slate-300 text-slate-800 hover:text-amber-600'
              }`}
            >
              +100
            </button>
            <button
              onClick={() => handleQuickAdd(500)}
              className={`py-2.5 rounded-xl border text-xs font-mono font-bold active:scale-95 transition-all flex items-center justify-center ${
                theme === 'dark'
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:text-amber-400'
                  : 'bg-slate-100 border-slate-300 text-slate-800 hover:text-amber-600'
              }`}
            >
              +500
            </button>
            <button
              onClick={() => handleQuickAdd(1000)}
              className={`py-2.5 rounded-xl border text-xs font-mono font-bold active:scale-95 transition-all flex items-center justify-center ${
                theme === 'dark'
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:text-amber-400'
                  : 'bg-slate-100 border-slate-300 text-slate-800 hover:text-amber-600'
              }`}
            >
              +1000
            </button>
          </div>

          {/* Numeric Keypad for Custom Received Cash */}
          <div className="grid grid-cols-3 gap-2 my-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <button
                key={num}
                onClick={() => handleReceivedNumpad(num)}
                className={`h-12 rounded-xl border text-xl font-bold flex items-center justify-center transition-all shadow-sm ${
                  theme === 'dark'
                    ? 'bg-slate-900 border-slate-800 active:bg-slate-800 text-slate-100'
                    : 'bg-slate-100 border-slate-200 active:bg-slate-200 text-slate-900'
                }`}
              >
                {num}
              </button>
            ))}
            <button
              onClick={() => handleReceivedNumpad('CLEAR')}
              className={`h-12 rounded-xl border text-xs font-semibold flex items-center justify-center ${
                theme === 'dark'
                  ? 'bg-slate-900/60 border-slate-800/80 text-slate-400 active:bg-slate-800'
                  : 'bg-slate-100 border-slate-200 text-slate-500 active:bg-slate-200'
              }`}
            >
              歸零
            </button>
            <button
              onClick={() => handleReceivedNumpad('0')}
              className={`h-12 rounded-xl border text-xl font-bold flex items-center justify-center shadow-sm ${
                theme === 'dark'
                  ? 'bg-slate-900 border-slate-800 active:bg-slate-800 text-slate-100'
                  : 'bg-slate-100 border-slate-200 active:bg-slate-200 text-slate-900'
              }`}
            >
              0
            </button>
            <button
              onClick={() => handleQuickAdd(10)}
              className={`h-12 rounded-xl border text-base font-mono font-bold active:scale-95 transition-all flex items-center justify-center ${
                theme === 'dark'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 active:bg-amber-500/30'
                  : 'bg-amber-50 border-amber-300 text-amber-700 active:bg-amber-100'
              }`}
            >
              +10
            </button>
          </div>

          {/* Giant Finish Checkout Button */}
          <button
            onClick={handleFinalizeCheckout}
            disabled={!isSufficient}
            className={`w-full h-15 rounded-2xl font-black text-lg flex items-center justify-center gap-2 shadow-xl transition-all ${
              isSufficient
                ? theme === 'dark'
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-98 shadow-emerald-500/25'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-98 shadow-emerald-600/25'
                : theme === 'dark'
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
            }`}
          >
            {isSufficient ? (
              changeAmount > 0 ? (
                <>
                  <CheckCircle2 className="w-6 h-6 shrink-0" />
                  <span>確認收款 · 應找零 NT${changeAmount}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-6 h-6 shrink-0" />
                  <span>確認收款 · 剛好付清 (免找零)</span>
                </>
              )
            ) : (
              <>
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>現金不足 · 還差 NT${totalAmount - receivedAmount}</span>
              </>
            )}
          </button>
          </div>
        </div>
      )}

      {/* Change Confirmation & Verification Modal */}
      {changeConfirmModal && (
        <div 
          onClick={() => {
            playSound('beep');
            setChangeConfirmModal(null);
          }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fade-in cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`border-2 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-scale-in text-center cursor-default ${
            theme === 'dark' 
              ? 'bg-slate-900 border-emerald-500/50 text-slate-100 shadow-emerald-500/10' 
              : 'bg-white border-emerald-500/50 text-slate-900 shadow-xl'
          }`}>
            {/* Header with order badge */}
            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center mb-0.5">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <span className="text-xs font-mono font-bold px-3 py-0.5 rounded-full bg-slate-500/15 opacity-80">
                訂單編號 {changeConfirmModal.orderNo}
              </span>
              <h2 className="text-xl font-black">
                {changeConfirmModal.changeAmount > 0 ? '收款完成 · 請核對找零' : '收款完成 · 剛好付清'}
              </h2>
            </div>

            {/* Giant Change Display Card */}
            <div className={`p-5 rounded-2xl border-2 transition-all ${
              changeConfirmModal.changeAmount > 0
                ? theme === 'dark'
                  ? 'bg-emerald-950/60 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/20'
                  : 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-lg shadow-emerald-500/10'
                : theme === 'dark'
                  ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                  : 'bg-slate-100 border-slate-300 text-slate-700'
            }`}>
              <span className="text-xs font-black uppercase tracking-wider block opacity-80 mb-1">
                {changeConfirmModal.changeAmount > 0 ? '★ 應找零金額 ★' : '無需找零'}
              </span>
              <div className="font-mono text-5xl font-black tracking-tight my-1">
                NT$ {changeConfirmModal.changeAmount}
              </div>
              {changeConfirmModal.changeAmount > 0 && getChangeBreakdown(changeConfirmModal.changeAmount) && (
                <div className={`mt-2.5 pt-2.5 border-t text-xs font-semibold ${
                  theme === 'dark' ? 'border-emerald-500/30 text-emerald-300' : 'border-emerald-200 text-emerald-800'
                }`}>
                  面額建議：{getChangeBreakdown(changeConfirmModal.changeAmount)}
                </div>
              )}
            </div>

            {/* Transaction Summary Info */}
            <div className={`grid grid-cols-2 gap-2 p-3 rounded-xl text-xs ${
              theme === 'dark' ? 'bg-slate-950/60 border border-slate-800' : 'bg-slate-50 border border-slate-200'
            }`}>
              <div className="text-left">
                <span className="opacity-60 block">應收金額 ({changeConfirmModal.itemCount} 份)</span>
                <span className="font-bold font-mono text-sm">NT${changeConfirmModal.totalAmount}</span>
              </div>
              <div className="text-right">
                <span className="opacity-60 block">實收現金</span>
                <span className="font-bold font-mono text-sm text-amber-500">NT${changeConfirmModal.receivedAmount}</span>
              </div>
            </div>

            <p className="text-[11px] opacity-60">
              ✓ 訂單已安全寫入本地 SQLite 快取 · 離線可用
            </p>

            {/* Explicit Confirmation & Close Button */}
            <button
              type="button"
              onClick={() => {
                playSound('beep');
                setChangeConfirmModal(null);
              }}
              className="w-full h-14 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all"
            >
              <Check className="w-5 h-5 stroke-[3]" />
              <span>
                {changeConfirmModal.changeAmount > 0 ? '確定找零 · 點此或空白處關閉' : '確定收款 · 點此或空白處關閉'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Clear Cart Confirmation Modal */}
      {isClearConfirmOpen && (
        <div 
          onClick={() => setIsClearConfirmOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`border rounded-3xl p-5 max-w-xs w-full shadow-2xl space-y-4 animate-scale-in cursor-default ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center gap-2 text-rose-500 font-bold text-base">
              <Trash2 className="w-5 h-5" />
              <span>清空購物車</span>
            </div>
            <p className="text-sm opacity-80 leading-relaxed">
              確定要清空購物車內的所有餐點嗎？共有 <span className="font-bold text-amber-500">{totalQuantity}</span> 份品項（NT${totalAmount}）。
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsClearConfirmOpen(false)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                  theme === 'dark'
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmClearCart}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-rose-500 hover:bg-rose-600 text-white shadow-md shadow-rose-500/20 transition-colors"
              >
                確定清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
