import React from 'react';
import { ShoppingBag, Receipt, UtensilsCrossed, Settings } from 'lucide-react';
import { AppTheme } from '../types';

export type NavTab = 'cashier' | 'orders' | 'products' | 'sync';

interface BottomNavProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  pendingSyncCount: number;
  theme?: AppTheme;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  pendingSyncCount,
  theme = 'dark'
}) => {
  const tabs = [
    { id: 'cashier', label: '收銀', icon: ShoppingBag },
    { id: 'orders', label: '流水', icon: Receipt },
    { id: 'products', label: '菜單', icon: UtensilsCrossed },
    { id: 'sync', label: '設定', icon: Settings, badge: pendingSyncCount }
  ];

  return (
    <nav className={`fixed bottom-0 left-0 right-0 z-30 border-t select-none pb-safe transition-colors ${
      theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-lg'
    }`}>
      <div className="max-w-4xl lg:max-w-5xl mx-auto flex items-center justify-around h-16 px-2 md:px-6">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id as NavTab)}
              className={`flex-1 flex flex-col items-center justify-center h-full relative transition-colors ${
                isActive
                  ? 'text-amber-500 font-bold'
                  : theme === 'dark'
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2.5 px-1 min-w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center justify-center shadow">
                    {tab.badge}
                  </span>
                ) : null}
              </div>
              <span className={`text-[11px] mt-1 font-bold ${
                isActive
                  ? 'text-amber-500'
                  : theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}>
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute top-0 w-8 h-0.5 bg-amber-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
