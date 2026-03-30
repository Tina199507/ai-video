import React from 'react';
import { Eye, Sparkles, Loader2, Edit3, Command, RefreshCw, ArrowRight } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface RefineBarProps {
    visualAnchor: string | null;
    isProcessing: boolean;
    isRefining: boolean;
    pendingDiff: any;
    refineInstruction: string;
    activeBeatIndex: number | null;
    onInstructionChange: (value: string) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onSubmit: () => void;
}

export const RefineBar: React.FC<RefineBarProps> = ({
    visualAnchor,
    isProcessing,
    isRefining,
    pendingDiff,
    refineInstruction,
    activeBeatIndex,
    onInstructionChange,
    onKeyDown,
    onSubmit
}) => {
    const { t } = useLanguage();

    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-30">
            <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-full shadow-2xl p-1.5 pl-4 flex items-center gap-3 ring-1 ring-black/50">
                {visualAnchor ? (
                    <div className="w-8 h-8 rounded-full bg-black border border-white/10 overflow-hidden shrink-0 relative group/thumb">
                        <img
                            src={visualAnchor}
                            className="w-full h-full object-cover opacity-80 group-hover/thumb:opacity-100 transition-opacity"
                            alt="Style Anchor"
                        />
                        <div className="absolute inset-0 bg-blue-500/20 hidden group-hover/thumb:flex items-center justify-center">
                            <Eye size={12} className="text-white drop-shadow-md" />
                        </div>
                        <div
                            className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full border-2 border-[#12141a]"
                            title="Style DNA Active"
                        ></div>
                    </div>
                ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20">
                        {isProcessing || isRefining ? (
                            <Loader2 size={16} className="text-white animate-spin" />
                        ) : (
                            <Sparkles size={16} className="text-white" />
                        )}
                    </div>
                )}
                <div className="flex-grow relative">
                    {activeBeatIndex !== null && !pendingDiff && (
                        <span className="absolute -top-4 left-0 text-[9px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 flex items-center gap-1 shadow-sm backdrop-blur-sm">
                            <Edit3 size={8} /> {t("script.refining_scene")}{" "}
                            {activeBeatIndex + 1}
                        </span>
                    )}
                    <input
                        value={refineInstruction}
                        onChange={(e) => onInstructionChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        disabled={isProcessing || isRefining || !!pendingDiff}
                        className="w-full bg-transparent border-none text-sm text-white placeholder-zinc-500 focus:ring-0 p-0 font-medium focus:outline-none h-9 disabled:opacity-50"
                        type="text"
                        placeholder={
                            pendingDiff
                                ? t("script.revision_complete")
                                : activeBeatIndex !== null
                                    ? `${t("script.rewrite_hint")} ${activeBeatIndex + 1}...`
                                    : t("script.refine_placeholder")
                        }
                    />
                </div>
                <div className="flex items-center gap-3 border-l border-white/5 pl-3">
                    {!pendingDiff && (
                        <div className="hidden sm:flex items-center gap-1 text-[9px] font-bold text-zinc-600 bg-black/20 px-2 py-1 rounded border border-white/5">
                            <Command size={10} />
                            <span>{t("script.enter_hint")}</span>
                        </div>
                    )}
                    <button
                        onClick={onSubmit}
                        disabled={
                            !refineInstruction.trim() ||
                            isProcessing ||
                            isRefining ||
                            !!pendingDiff
                        }
                        className="w-9 h-9 bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-105 active:scale-95"
                    >
                        {isProcessing || isRefining ? (
                            <RefreshCw size={16} className="animate-spin" />
                        ) : (
                            <ArrowRight size={16} />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
