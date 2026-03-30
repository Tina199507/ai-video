import React from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface ScriptToastProps {
    showToast: { message: string, type: 'success' | 'info' } | null;
    pendingDiff: any;
    onDiscard: () => void;
}

export const ScriptToast: React.FC<ScriptToastProps> = ({ showToast, pendingDiff, onDiscard }) => {
    const { t } = useLanguage();

    if (!showToast) return null;

    return (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4">
            <div className={`border px-4 py-3 rounded-lg shadow-2xl backdrop-blur-md flex items-center gap-4 ${showToast.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-100' : 'bg-zinc-900/90 border-white/10 text-zinc-100'}`}>
                <div className={`p-1 rounded-full text-black ${showToast.type === 'success' ? 'bg-emerald-500' : 'bg-zinc-400'}`}>
                    <Check size={12} strokeWidth={3} />
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-wider">
                        {showToast.message}
                    </span>
                </div>
                {pendingDiff && (
                    <div className="h-6 w-px bg-white/10 mx-2"></div>
                )}
                {pendingDiff && (
                    <button
                        onClick={onDiscard}
                        className="flex items-center gap-1.5 text-[10px] font-bold bg-white/5 hover:bg-white/10 px-2 py-1 rounded border border-white/10 transition-colors"
                    >
                        <RotateCcw size={10} /> {t("script.undo")}
                    </button>
                )}
            </div>
        </div>
    );
};
