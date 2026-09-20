import React, { useState, useRef } from 'react';
import { 
  UtensilsCrossed, Plus, Edit2, Trash2, Check, X, Star, AlertCircle, ToggleLeft, ToggleRight
} from 'lucide-react';
import { Product, AppTheme } from '../types';

interface ProductsViewProps {
  products: Product[];
  onSaveProduct: (product: Product) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  onToggleActive: (productId: string) => Promise<void>;
  theme?: AppTheme;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  onSaveProduct,
  onDeleteProduct,
  onToggleActive,
  theme = 'dark'
}) => {
  const saving = useRef(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<{ id: string; name: string } | null>(null);
  const [formError, setFormError] = useState<string>('');

  // Form states
  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('便當主食');
  const [priceStr, setPriceStr] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);

  const categories = ['全部', ...Array.from(new Set(products.map(p => p.category)))];

  const filteredProducts = products.filter(p => {
    if (selectedCategory === '全部') return true;
    return p.category === selectedCategory;
  });

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setName('');
    setCategory('便當主食');
    setPriceStr('');
    setIsActive(true);
    setIsFavorite(false);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setCategory(p.category);
    setPriceStr(p.price.toString());
    setIsActive(p.is_active);
    setIsFavorite(p.is_favorite);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseInt(priceStr, 10);
    if (!name.trim()) {
      setFormError('請輸入商品名稱');
      return;
    }
    if (isNaN(price) || price < 0) {
      setFormError('請輸入正確的售價金額');
      return;
    }

    const newOrUpdated: Product = {
      id: editingProduct ? editingProduct.id : `p-${Date.now()}`,
      name: name.trim(),
      category: category.trim() || '其他',
      price,
      is_active: isActive,
      is_favorite: isFavorite
    };

    if (saving.current) return;
    saving.current = true;
    try { await onSaveProduct(newOrUpdated); }
    catch (e) { setFormError((e as Error).message); return; }
    finally { saving.current = false; }
    setIsModalOpen(false);
    setFormError('');
  };

  const handleDelete = (id: string, name: string) => {
    setDeletingProduct({ id, name });
  };

  const handleConfirmDelete = async () => {
    if (deletingProduct) {
      try { await onDeleteProduct(deletingProduct.id); }
      catch (e) { window.alert((e as Error).message); return; }
      setDeletingProduct(null);
    }
  };

  return (
    <div className={`flex flex-col h-full pb-24 overflow-y-auto select-none transition-colors ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
    }`}>
      {/* Top Header */}
      <div className={`p-3 md:px-6 sticky top-0 z-10 border-b ${
        theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="max-w-4xl lg:max-w-5xl mx-auto w-full flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-amber-500" />
              <span>菜單品項管理</span>
            </h1>
            <span className="text-xs opacity-60">共 {products.length} 個品項</span>
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-3.5 py-1.5 md:py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs md:text-sm flex items-center gap-1 shadow-md shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>新增品項</span>
          </button>
        </div>
      </div>

      <div className="p-3 md:p-6 max-w-4xl lg:max-w-5xl mx-auto w-full space-y-3">
        {/* Category Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-bold whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/10'
                  : theme === 'dark'
                  ? 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 shadow-sm'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Product Items List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {filteredProducts.map(product => (
            <div
              key={product.id}
              className={`border rounded-2xl p-3 flex items-center justify-between gap-3 transition-colors shadow-sm ${
                !product.is_active
                  ? 'opacity-60 bg-slate-500/5 border-slate-300 dark:border-slate-800/60'
                  : theme === 'dark'
                  ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {product.category}
                  </span>
                  <h3 className="font-bold text-base truncate">{product.name}</h3>
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <span className="font-mono text-base font-extrabold text-amber-500">
                    NT${product.price}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      product.is_active ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {product.is_active ? '● 供餐中' : '○ 已售完'}
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-1.5">
                {/* Active Toggle Switch Button */}
                <button
                  onClick={() => onToggleActive(product.id)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors ${
                    product.is_active
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                  }`}
                  title={product.is_active ? '設為售完' : '恢復供餐'}
                >
                  {product.is_active ? '切為售完' : '恢復供餐'}
                </button>

                {/* Edit Button */}
                <button
                  onClick={() => handleOpenEdit(product)}
                  className={`p-2 rounded-xl active:scale-95 transition-colors ${
                    theme === 'dark'
                      ? 'bg-slate-800 text-slate-300 hover:text-slate-100'
                      : 'bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200'
                  }`}
                  title="編輯"
                >
                  <Edit2 className="w-4 h-4" />
                </button>

                {/* Delete Button */}
                <button
                  onClick={() => handleDelete(product.id, product.name)}
                  className={`p-2 rounded-xl active:scale-95 transition-colors ${
                    theme === 'dark'
                      ? 'bg-slate-800 text-slate-500 hover:text-rose-400'
                      : 'bg-slate-100 text-slate-400 hover:text-rose-500 border border-slate-200'
                  }`}
                  title="刪除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <form
            onSubmit={handleSave}
            className={`border rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3 ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`flex items-center justify-between pb-2 border-b ${
              theme === 'dark' ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <h3 className="text-lg font-bold">
                {editingProduct ? '編輯菜單品項' : '新增菜單品項'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className={`p-1.5 rounded-full ${
                  theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs opacity-60 block mb-1">商品名稱 *</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="例如：招牌雞腿飯"
                className={`w-full border rounded-xl px-3 py-2 text-sm focus:border-amber-500 outline-none ${
                  theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs opacity-60 block mb-1">商品分類</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className={`w-full border rounded-xl px-3 py-2 text-sm focus:border-amber-500 outline-none ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="便當主食">便當主食</option>
                  <option value="經典小吃">經典小吃</option>
                  <option value="冷飲湯品">冷飲湯品</option>
                  <option value="其他">其他</option>
                </select>
              </div>

              <div>
                <label className="text-xs opacity-60 block mb-1">售價 (NT$) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={priceStr}
                  onChange={e => setPriceStr(e.target.value)}
                  placeholder="例如：100"
                  className={`w-full border rounded-xl px-3 py-2 text-sm font-mono font-bold text-amber-500 focus:border-amber-500 outline-none ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'
                  }`}
                />
              </div>
            </div>

            <div className={`flex items-center justify-between py-2 border-t ${
              theme === 'dark' ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <span className="text-xs font-medium opacity-75">供餐狀態</span>
              <button
                type="button"
                onClick={() => setIsActive(prev => !prev)}
                className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${
                  isActive
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                }`}
              >
                {isActive ? '供餐中 (在收銀頁顯示)' : '已售完停售'}
              </button>
            </div>

            {formError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center gap-1.5 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className={`flex-1 py-3 rounded-xl font-bold text-sm ${
                  theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                取消
              </button>
              <button
                type="submit"
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm shadow-md shadow-amber-500/20"
              >
                儲存
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Product Confirmation Modal */}
      {deletingProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <div className={`border rounded-3xl p-5 max-w-xs w-full shadow-2xl space-y-4 animate-scale-in ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center gap-2 text-rose-500 font-bold text-base">
              <Trash2 className="w-5 h-5" />
              <span>刪除菜單品項</span>
            </div>
            <p className="text-sm opacity-80 leading-relaxed">
              確定要刪除「<span className="font-bold text-amber-500">{deletingProduct.name}</span>」嗎？此動作將無法復原。
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingProduct(null)}
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
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-rose-500 hover:bg-rose-600 text-white shadow-md shadow-rose-500/20 transition-colors"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
