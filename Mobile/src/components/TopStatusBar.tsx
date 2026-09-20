import React, { useState, useEffect } from 'react';
import { Wifi, ShieldCheck, Lock, HardDrive, RefreshCw } from 'lucide-react';
import { SystemStatus, AppTheme } from '../types';

interface TopStatusBarProps {
  systemStatus: SystemStatus;
  pendingSyncCount: number;
  onLockScreen: () => void;
  onOpenSync: () => void;
  theme?: AppTheme;
}

export const TopStatusBar: React.FC<TopStatusBarProps> = ({
  systemStatus,
  pendingSyncCount,
  onLockScreen,
  onOpenSync,
  theme = 'dark'
}) => {
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('zh-TW', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className={`px-3 py-2 sticky top-0 z-40 select-none border-b transition-colors ${
      theme === 'dark'
        ? 'bg-slate-900 border-slate-800 text-slate-100 shadow-md'
        : 'bg-white border-slate-200 text-slate-900 shadow-sm'
    }`}>
      <div className="flex items-center justify-between gap-2 max-w-4xl lg:max-w-5xl mx-auto">
        {/* Arm Host Status */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${
            theme === 'dark'
              ? 'text-emerald-400 bg-slate-800/80 border-emerald-500/30'
              : 'text-emerald-700 bg-emerald-50 border-emerald-300'
          }`}>
            <HardDrive className="w-3 h-3" />
            <span>{systemStatus.isArmHostOnline ? '本地主機已連線' : '本地主機未連線'}</span>
          </div>
        </div>

        {/* Current Time */}
        <div className={`font-mono text-sm tracking-wider font-bold ${
          theme === 'dark' ? 'text-slate-200' : 'text-slate-700'
        }`}>
          {timeStr || '--:--:--'}
        </div>

        {/* Status Indicators & Lock */}
        <div className="flex items-center gap-2">
          {/* Pending Sync Badge */}
          <button
            onClick={onOpenSync}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all ${
              pendingSyncCount > 0
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm shadow-amber-500/20 active:scale-95'
                : theme === 'dark'
                ? 'bg-slate-800 text-slate-400 hover:text-slate-200'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
            title="點擊查看同步隊列"
          >
            <RefreshCw className={`w-3 h-3 ${pendingSyncCount > 0 ? 'animate-spin-slow' : ''}`} />
            <span>{pendingSyncCount > 0 ? `${pendingSyncCount} 待同步` : '無待同步訂單'}</span>
          </button>

          {/* Network & VPN badges */}
          <div className={`flex items-center gap-1 px-1.5 py-1 rounded ${
            theme === 'dark' ? 'bg-slate-800/90 text-slate-300' : 'bg-slate-100 text-slate-700'
          }`}>
            <span title="本機服務狀態">
              <Wifi className={`w-3.5 h-3.5 ${systemStatus.isArmHostOnline ? 'text-emerald-500' : 'text-rose-500'}`} />
            </span>
            <span title="MSSQL 最近同步狀態">
              <ShieldCheck className={`w-3.5 h-3.5 ${systemStatus.isHomeLabReachable ? 'text-sky-500' : 'text-slate-400'}`} />
            </span>
          </div>

          {/* Quick Lock Button */}
          <button
            onClick={onLockScreen}
            className={`p-1.5 rounded-lg border transition-colors ${
              theme === 'dark'
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
            title="鎖定收銀機"
            aria-label="鎖定收銀機"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
