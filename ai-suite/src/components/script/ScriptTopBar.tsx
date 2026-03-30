import React, { useState } from 'react';
import { ArrowRight, Lock, FileJson } from 'lucide-react';
import { TopBar } from '../TopBar';
import { useProject } from '../../context/ProjectContext';
import { StyleProfile } from '../../types';
import { StyleDNAModal } from './StyleDNAModal';

interface ScriptTopBarProps {
  t: (key: string) => string;
  beatCount: number;
  wordCount: number;
  targetWPM: number;
  scriptVersionsLength: number;
  isProcessing: boolean;
  localScript: string;
  pendingDiff: any;
  safetyMetadata: any;
  highRiskApproved: boolean;
  styleProfile: StyleProfile | null;
  onUpdateGenerationPlan: (plan: any) => void;
  onConfirm: () => void;
}

export const ScriptTopBar: React.FC<ScriptTopBarProps> = ({
  t,
  beatCount,
  wordCount,
  targetWPM,
  scriptVersionsLength,
  isProcessing,
  localScript,
  pendingDiff,
  safetyMetadata,
  highRiskApproved,
  styleProfile,
  onUpdateGenerationPlan,
  onConfirm,
}) => {
  const [showStyleDNA, setShowStyleDNA] = useState(false);

  const targetWordCount = styleProfile?.wordCount || 0;
  const wordCountRatio = targetWordCount > 0 ? Math.round(wordCount / targetWordCount * 100) : 0;

  return (
    <>
      <TopBar
        title={t("script.draft")}
        subtitle={t("script.subtitle")}
        centerContent={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/5">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                {scriptVersionsLength > 0 ? `V${scriptVersionsLength + 1}.0` : "V1.0"}
              </span>
            </div>
            
            {targetWordCount > 0 ? (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                wordCountRatio >= 90 && wordCountRatio <= 110
                  ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-400'
                  : 'bg-amber-900/30 border-amber-500/30 text-amber-400'
              }`}>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
                  {wordCount} / {targetWordCount} {t("script.words")} ({wordCountRatio}%)
                </span>
              </div>
            ) : (
               <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/5">
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                  {wordCount} {t("script.words")}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/5">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                {beatCount} {t("script.beats")}
              </span>
            </div>
          </div>
        }
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowStyleDNA(true)}
              className="flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/5 transition-colors hover:bg-white/10 shadow-sm text-zinc-300"
              title="View Style DNA"
            >
              <FileJson size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Style DNA</span>
            </button>
            <div
              className="flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/5 transition-colors hover:bg-black/60 shadow-sm"
              title="Words Per Minute"
            >
              <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider">{t("script.wpm")}</span>
              <input
                type="number"
                className="w-8 bg-transparent border-none text-xs text-zinc-300 font-mono p-0 focus:ring-0 text-right font-bold"
                value={targetWPM || 150}
                onChange={(e) =>
                  onUpdateGenerationPlan({
                    targetWPM: parseInt(e.target.value) || 150,
                  })
                }
                min={50}
                max={300}
                step={10}
              />
            </div>
            <button
              onClick={onConfirm}
              disabled={
                isProcessing ||
                !localScript ||
                !!pendingDiff ||
                (safetyMetadata?.isHighRisk && !highRiskApproved)
              }
              className={`h-8 px-4 rounded-full text-xs font-bold flex items-center gap-2 transition-all shadow-lg backdrop-blur-md ${
                isProcessing || !localScript || !!pendingDiff || (safetyMetadata?.isHighRisk && !highRiskApproved)
                  ? "bg-zinc-800/50 text-zinc-600 cursor-not-allowed border border-white/5"
                  : "bg-white text-black hover:bg-zinc-200 hover:scale-105 active:scale-95"
              }`}
            >
              {safetyMetadata?.isHighRisk && !highRiskApproved && <Lock size={12} className="text-zinc-500" />}
              <span>{t("script.confirm")}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        }
      />
      <StyleDNAModal
        isOpen={showStyleDNA}
        onClose={() => setShowStyleDNA(false)}
        styleProfile={styleProfile}
      />
    </>
  );
};
