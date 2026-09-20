import React, { useState } from 'react';
import { Lock, Delete, KeyRound } from 'lucide-react';
import { AppTheme } from '../types';

interface PinLockModalProps {
  correctPin: string;
  onUnlock: () => void;
  theme?: AppTheme;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({ correctPin, onUnlock, theme = 'dark' }) => {
  const [pin, setPin] = useState<string>('');
  const [hasError, setHasError] = useState<boolean>(false);

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setHasError(false);

      if (nextPin.length === 4) {
        if (nextPin === correctPin) {
          // Play short unlock chime
          playTone(880, 0.1);
          setTimeout(() => {
            onUnlock();
            setPin('');
          }, 150);
        } else {
          // Error feedback
          playTone(220, 0.25);
          setHasError(true);
          setTimeout(() => {
            setPin('');
            setHasError(false);
          }, 800);
        }
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setHasError(false);
  };

  const handleClear = () => {
    setPin('');
    setHasError(false);
  };

  // Simple web audio beep for tactile feedback
  const playTone = (freq: number, duration: number) => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio not permitted or supported in background
    }
  };

  return (
    <div className={`fixed inset-0 z-50 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none transition-colors ${
      theme === 'dark' ? 'bg-slate-950/95 text-slate-100' : 'bg-slate-900/90 text-slate-100'
    }`}>
      <div className={`w-full max-w-xs flex flex-col items-center p-6 rounded-3xl border shadow-2xl ${
        theme === 'dark' ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header Icon */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-4 shadow-lg shadow-amber-500/10">
          <Lock className="w-8 h-8" />
        </div>

        <h1 className="text-xl font-bold tracking-wide">小蜜蜂結帳系統</h1>
        <p className="text-xs opacity-60 mt-1 mb-6">請輸入 4 位數解鎖 PIN 碼（預設：{correctPin}）</p>

        {/* PIN Indicators */}
        <div className={`flex items-center gap-4 mb-8 ${hasError ? 'animate-bounce' : ''}`}>
          {[0, 1, 2, 3].map(index => {
            const isFilled = index < pin.length;
            return (
              <div
                key={index}
                className={`w-5 h-5 rounded-full transition-all duration-200 border-2 ${
                  hasError
                    ? 'border-rose-500 bg-rose-500/30'
                    : isFilled
                    ? 'border-amber-500 bg-amber-500 scale-110 shadow-md shadow-amber-500/40'
                    : theme === 'dark'
                    ? 'border-slate-700 bg-slate-800'
                    : 'border-slate-300 bg-slate-100'
                }`}
              />
            );
          })}
        </div>

        {hasError && (
          <p className="text-xs font-semibold text-rose-500 -mt-4 mb-4">PIN 碼錯誤，請重新輸入</p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              onClick={() => handleDigit(num)}
              className={`h-14 rounded-xl border text-2xl font-bold flex items-center justify-center transition-all active:scale-95 shadow-sm active:bg-amber-500 active:text-slate-950 ${
                theme === 'dark'
                  ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-700 text-slate-100'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
              }`}
            >
              {num}
            </button>
          ))}
          
          <button
            onClick={handleClear}
            className={`h-14 rounded-xl border text-sm font-medium flex items-center justify-center active:scale-95 ${
              theme === 'dark'
                ? 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 text-slate-400'
                : 'bg-slate-100/70 border-slate-200 hover:bg-slate-200 text-slate-500'
            }`}
          >
            重填
          </button>

          <button
            onClick={() => handleDigit('0')}
            className={`h-14 rounded-xl border text-2xl font-bold flex items-center justify-center transition-all active:scale-95 shadow-sm active:bg-amber-500 active:text-slate-950 ${
              theme === 'dark'
                ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-700 text-slate-100'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
            }`}
          >
            0
          </button>

          <button
            onClick={handleDelete}
            className={`h-14 rounded-xl border flex items-center justify-center active:scale-95 ${
              theme === 'dark'
                ? 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 text-slate-300'
                : 'bg-slate-100/70 border-slate-200 hover:bg-slate-200 text-slate-600'
            }`}
            aria-label="刪除"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Quick hint for Owner */}
        <div className="mt-6 flex items-center gap-1.5 opacity-60 text-xs">
          <KeyRound className="w-3.5 h-3.5 text-amber-500" />
          <span>車載端長效登入，關閉螢幕自動待機</span>
        </div>
      </div>
    </div>
  );
};
