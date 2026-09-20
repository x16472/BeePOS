import React, { useState, useEffect } from 'react';
import { Radio, HardDrive, RefreshCw, Download, CheckCircle2, AlertCircle, Server, Clock, Moon, Sun, Palette, ArrowLeft } from 'lucide-react';
import { Order, SystemStatus, SyncLog, AppTheme } from '../types';
import { Api } from '../services/api';
import { StorageService } from '../services/storage';

interface SyncStatusViewProps {
  orders: Order[];
  systemStatus: SystemStatus;
  onOrdersSynced: () => Promise<void>;
  onResetData: () => void;
  theme?: AppTheme;
  onToggleTheme?: (theme: AppTheme) => void;
  onBackToCashier?: () => void;
}

export const SyncStatusView: React.FC<SyncStatusViewProps> = ({
  orders,
  systemStatus,
  onOrdersSynced,
  onResetData,
  theme = 'dark',
  onToggleTheme,
  onBackToCashier
}) => {
  const [syncFailed, setSyncFailed] = useState(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string>('');
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>(StorageService.getSyncLogs());

  // Allow Escape key to return to cashier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onBackToCashier?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBackToCashier]);

  // Click on blank background area to return to cashier
  const handleBlankAreaClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-card]') || target.closest('button') || target.closest('input') || target.closest('a')) {
      return;
    }
    onBackToCashier?.();
  };

  const pendingOrders = orders.filter(o => o.sync_status === 'pending');

  const handleTriggerSync = async () => {
    if (isSyncing) return;
    setSyncFailed(false);
    setIsSyncing(true);
    setSyncProgress(15);
    setSyncSuccessMsg('');
    try {
      const result = await Api.sync();
      setSyncProgress(100);
      setSyncSuccessMsg(result.message);
    } catch (e) {
      setSyncFailed(true);
      setSyncSuccessMsg((e as Error).message);
    } finally {
      try {
        await onOrdersSynced();
        setSyncLogs(StorageService.getSyncLogs());
      } catch (e) { setSyncFailed(true); setSyncSuccessMsg((e as Error).message); }
      setIsSyncing(false);
    }
  };
  useEffect(() => { setSyncLogs(StorageService.getSyncLogs()); }, [systemStatus]);

  // Export CSV download
  const handleExportCSV = () => {
    const csvContent = StorageService.exportOrdersCSV();
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bee_pos_orders_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export JSON download
  const handleExportJSON = () => {
    const jsonContent = StorageService.exportOrdersJSON();
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bee_pos_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div 
      onClick={handleBlankAreaClick}
      className={`flex flex-col h-full pb-24 overflow-y-auto select-none transition-colors ${
        theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Top Header */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className={`p-3 md:px-6 sticky top-0 z-10 border-b ${
          theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="max-w-4xl lg:max-w-5xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {onBackToCashier && (
              <button
                type="button"
                onClick={onBackToCashier}
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95 shadow-sm ${
                  theme === 'dark'
                    ? 'bg-slate-800 hover:bg-slate-750 text-amber-400 border-slate-700'
                    : 'bg-slate-100 hover:bg-slate-200 text-amber-700 border-slate-300'
                }`}
                title="返回點餐畫面"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>回點餐</span>
              </button>
            )}

            <div>
              <h1 className="text-base sm:text-lg md:text-xl font-bold flex items-center gap-2">
                <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
                <span>系統設定與 Home Lab 同步</span>
              </h1>
              <span className="text-xs opacity-60">點選空白處亦可快速返回點餐</span>
            </div>
          </div>
        </div>
      </div>

      <div 
        onClick={handleBlankAreaClick}
        className="p-3 md:p-6 max-w-4xl lg:max-w-5xl mx-auto w-full space-y-4 flex-1"
      >
        {/* Global Theme Settings Card */}
        <div 
          data-card="true"
          onClick={(e) => e.stopPropagation()}
          className={`border rounded-3xl p-4 space-y-3 shadow-sm ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-amber-500" />
              <div>
                <h2 className="font-bold text-sm">介面色彩風格 (Theme)</h2>
                <p className="text-xs opacity-60">全域支援深色抗眩與日間淺色介面切換</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              {theme === 'dark' ? '深色模式' : '淺色模式'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              onClick={() => onToggleTheme && onToggleTheme('dark')}
              className={`p-3 rounded-2xl border flex items-center justify-center gap-2 font-bold text-sm transition-all active:scale-95 ${
                theme === 'dark'
                  ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md shadow-amber-500/20'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <Moon className="w-4 h-4" />
              <span>深色模式</span>
            </button>

            <button
              onClick={() => onToggleTheme && onToggleTheme('light')}
              className={`p-3 rounded-2xl border flex items-center justify-center gap-2 font-bold text-sm transition-all active:scale-95 ${
                theme === 'light'
                  ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700'
              }`}
            >
              <Sun className="w-4 h-4" />
              <span>淺色模式</span>
            </button>
          </div>
        </div>

        {/* Hardware Status Bento Grid */}
        <div 
          data-card="true"
          onClick={(e) => e.stopPropagation()}
          className={`border rounded-3xl p-4 space-y-3 shadow-sm ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <h2 className="text-xs font-bold opacity-60 uppercase tracking-wider flex items-center gap-1.5">
            <HardDrive className="w-4 h-4 text-emerald-500" />
            <span>車載端硬體與網路環境</span>
          </h2>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            {/* Host Spec */}
            <div className={`p-3 rounded-2xl border ${
              theme === 'dark' ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="opacity-50 block mb-1">主機與儲存</span>
              <p className="font-semibold">Windows / Go 本地主機</p>
              <p className="text-[11px] font-mono text-emerald-500">本地 SQLite (離線優先)</p>
            </div>

            {/* Power Spec */}
            <div className={`p-3 rounded-2xl border ${
              theme === 'dark' ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="opacity-50 block mb-1">電源架構</span>
              <p className="font-semibold">硬體感測尚未接入</p>
              <p className="text-[11px] text-amber-500 font-mono">目前支援現金結帳</p>
            </div>

            {/* 4G Wi-Fi */}
            <div className={`p-3 rounded-2xl border ${
              theme === 'dark' ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="opacity-50 block mb-1">網路連線</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <p className="font-semibold">本機服務連線</p>
              </div>
              <p className="text-[11px] opacity-60">{systemStatus.isArmHostOnline ? '主機可連線' : '主機無法連線'}</p>
            </div>

            {/* Home Lab VPN */}
            <div className={`p-3 rounded-2xl border ${
              theme === 'dark' ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="opacity-50 block mb-1">Home Lab MSSQL</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                <p className="font-semibold">SQL Server 同步</p>
              </div>
              <p className="text-[11px] text-sky-500 font-mono">{systemStatus.isHomeLabReachable ? '最近同步成功' : '尚未連線或同步失敗'}</p>
            </div>
          </div>
        </div>

        {/* Sync Queue Card */}
        <div 
          data-card="true"
          onClick={(e) => e.stopPropagation()}
          className={`border rounded-3xl p-4 space-y-3 shadow-sm ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-amber-500" />
              <div>
                <h2 className="font-bold text-sm">Home Lab SQL Server 批次同步隊列</h2>
                <p className="text-xs opacity-60">訊號穩定或收工打烊時一鍵同步</p>
              </div>
            </div>

            <span
              className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold ${
                pendingOrders.length > 0
                  ? 'bg-amber-500/20 text-amber-500 border border-amber-500/40'
                  : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
              }`}
            >
              {pendingOrders.length} 筆待同步
            </span>
          </div>

          {/* Sync Progress Bar */}
          {isSyncing && (
            <div className="space-y-1 py-1">
              <div className="flex justify-between text-xs opacity-60 font-mono">
                <span>正在與 SQL Server 同步資料...</span>
                <span>{syncProgress}%</span>
              </div>
              <div className={`w-full h-2.5 rounded-full overflow-hidden border ${
                theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-200 border-slate-300'
              }`}>
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Sync Success Feedback */}
          {syncSuccessMsg && (
            <div role="status" className={`p-3 border text-xs font-semibold rounded-2xl flex items-center gap-2 ${syncFailed ? 'border-rose-500 text-rose-500' : 'border-emerald-500 text-emerald-500'}`}>
              {syncFailed ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span>{syncSuccessMsg}</span>
            </div>
          )}

          {/* Sync Action Button */}
          <button
            onClick={handleTriggerSync}
            disabled={isSyncing}
            className={`w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-md ${
              !isSyncing
                ? 'bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 shadow-amber-500/20'
                : theme === 'dark' ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60' : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
            }`}
          >
            <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>
              {isSyncing
                ? '正在同步至 SQL Server...'
                : pendingOrders.length > 0
                ? `立即同步 ${pendingOrders.length} 筆訂單至 Home Lab`
                : '立即同步商品與訂單'}
            </span>
          </button>
        </div>

        {/* Offline Backup & File Exports */}
        <div 
          data-card="true"
          onClick={(e) => e.stopPropagation()}
          className={`border rounded-3xl p-4 space-y-2.5 shadow-sm ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-emerald-500" />
            <h2 className="font-bold text-sm">離線應急匯出與備份</h2>
          </div>
          <p className="text-xs opacity-60">
            若 MSSQL 暫時無法連線，可將已載入的全部訂單匯出為 CSV 或 JSON 備份。
          </p>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleExportCSV}
              className={`py-3 rounded-xl active:scale-95 text-xs font-bold flex items-center justify-center gap-1.5 border ${
                theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
              }`}
            >
              <Download className="w-3.5 h-3.5 text-emerald-500" />
              <span>匯出全部 CSV 報表</span>
            </button>

            <button
              onClick={handleExportJSON}
              className={`py-3 rounded-xl active:scale-95 text-xs font-bold flex items-center justify-center gap-1.5 border ${
                theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
              }`}
            >
              <Download className="w-3.5 h-3.5 text-sky-500" />
              <span>備份完整 JSON 檔</span>
            </button>
          </div>
        </div>

        {/* Sync History Logs */}
        <div 
          data-card="true"
          onClick={(e) => e.stopPropagation()}
          className={`border rounded-3xl p-4 space-y-2 shadow-sm ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 opacity-60" />
            <span>最近同步歷史紀錄</span>
          </h2>

          {syncLogs.length === 0 ? (
            <p className="text-xs opacity-50 py-2">尚無遠端同步歷史</p>
          ) : (
            <div className={`divide-y max-h-40 overflow-y-auto ${
              theme === 'dark' ? 'divide-slate-800/80' : 'divide-slate-200'
            }`}>
              {syncLogs.map(log => (
                <div key={log.id} className="py-2 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-medium">{log.message}</span>
                    <span className="block text-[10px] opacity-50 font-mono">
                      {new Date(log.timestamp).toLocaleString('zh-TW')}
                    </span>
                  </div>
                  <span className="font-bold">{log.status === 'success' ? '成功' : '失敗'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2 text-center">
          <button onClick={onResetData} className="text-xs underline">重新載入主機資料</button>
        </div>
      </div>
    </div>
  );
};
