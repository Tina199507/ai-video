import React from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { DraggableFactItem } from './DraggableFactItem';
import { ResearchData } from '../../types';
import { CalibrationPanel } from './CalibrationPanel';

interface ResearchPanelProps {
  researchData: ResearchData | null;
  highlightedFactId: string | null;
  activeBeatIndex: number | null;
  usedFactIDs: string[];
  editingFactIndex: number | null;
  tempEditValue: string;
  expandedSections: string[];
  isImmersiveMode: boolean;
  t: (key: string) => string;
  onFactClick: (factId: string, index: number, content: string) => void;
  onEditStart: (index: number, content: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (e: React.MouseEvent, index: number) => void;
  onAddFact: () => void;
  onClearFilter: () => void;
  onToggleSection: (section: string) => void;
  setTempEditValue: (value: string) => void;
  checkIfFactInActiveBeat: (factIndex: number) => boolean;
  calibration?: {
    reference_total_words: number;
    reference_duration_sec: number;
    actual_speech_rate: string;
    new_video_target_duration_sec: number;
    target_word_count: number;
    target_word_count_min: string;
    target_word_count_max: string;
  };
  currentWordCount: number;
}

export const ResearchPanel: React.FC<ResearchPanelProps> = ({
  researchData,
  highlightedFactId,
  activeBeatIndex,
  usedFactIDs,
  editingFactIndex,
  tempEditValue,
  expandedSections,
  isImmersiveMode,
  t,
  onFactClick,
  onEditStart,
  onEditSave,
  onEditCancel,
  onDelete,
  onAddFact,
  onClearFilter,
  onToggleSection,
  setTempEditValue,
  checkIfFactInActiveBeat,
  calibration,
  currentWordCount,
}) => {
  return (
    <section className={`w-1/4 min-w-[280px] max-w-[350px] shrink-0 flex flex-col h-full transition-all duration-700 z-20 bg-white/[0.02] backdrop-blur-md hover:border-r hover:border-white/10 border-r border-transparent ${isImmersiveMode ? 'opacity-5 grayscale pointer-events-none scale-95' : 'opacity-40 hover:opacity-100'}`}>
      <div className="p-4 flex items-center justify-end flex-none h-12">
        <div className="flex gap-2">
          {highlightedFactId && (
            <button
              onClick={onClearFilter}
              className="text-[10px] text-blue-400 hover:underline"
            >
              {t("script.clear_filter")}
            </button>
          )}
          {/* Plus icon removed as per user request */}
        </div>
      </div>

      {calibration && (
        <CalibrationPanel calibration={calibration} currentWordCount={currentWordCount} />
      )}

      <div className="flex-grow overflow-y-auto px-4 pb-4 space-y-4 custom-scrollbar">
        {!researchData ? (
          <div className="text-center p-8 text-gray-600 text-xs">
            {t("script.empty_facts")}
          </div>
        ) : (
          <>
            {/* Facts Section */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 sticky top-0 bg-[#050505]/95 backdrop-blur py-2 z-10 border-b border-white/5">
                {t("script.tab_facts")}
              </h3>
              {researchData.facts?.map((fact, i) => {
                const isLinked = checkIfFactInActiveBeat(i);
                const isSelected = highlightedFactId === `Fact-${i + 1}`;
                const isUsed = usedFactIDs.includes(`Fact-${i + 1}`);
                const isDimmed =
                  (activeBeatIndex !== null && !isLinked) ||
                  (highlightedFactId !== null && !isSelected);
                const isEditing = editingFactIndex === i;

                return (
                  <DraggableFactItem
                    key={`fact-${i}`}
                    index={i}
                    fact={fact}
                    isLinked={isLinked}
                    isSelected={isSelected}
                    isDimmed={isDimmed}
                    isEditing={isEditing}
                    isUsed={isUsed}
                    tempEditValue={tempEditValue}
                    setTempEditValue={setTempEditValue}
                    onFactClick={onFactClick}
                    onEditStart={onEditStart}
                    onEditSave={onEditSave}
                    onEditCancel={onEditCancel}
                    onDelete={onDelete}
                  />
                );
              })}
            </div>

            {/* Myths Section */}
            {researchData.myths && researchData.myths.length > 0 && (
              <div className="space-y-3 mt-6 pt-6 border-t border-white/5">
                <button 
                  onClick={() => onToggleSection('myths')}
                  className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500 py-2 group"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-icons text-[10px]">warning</span>
                    <span>{t("script.tab_myths")}</span>
                  </div>
                  <ChevronDown size={12} className={`transition-transform duration-300 ${expandedSections.includes('myths') ? 'rotate-180' : ''}`} />
                </button>
                {expandedSections.includes('myths') && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                    {researchData.myths.map((myth, i) => (
                      <div key={i} className="p-3 rounded-lg bg-red-900/10 border border-red-500/20 text-xs text-zinc-400 italic">
                        {myth}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Glossary Section */}
            {researchData.glossary && researchData.glossary.length > 0 && (
              <div className="space-y-3 mt-6 pt-6 border-t border-white/5">
                <button 
                  onClick={() => onToggleSection('glossary')}
                  className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500 py-2 group"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-icons text-[10px]">book</span>
                    <span>{t("script.tab_glossary")}</span>
                  </div>
                  <ChevronDown size={12} className={`transition-transform duration-300 ${expandedSections.includes('glossary') ? 'rotate-180' : ''}`} />
                </button>
                {expandedSections.includes('glossary') && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                    {researchData.glossary.map((item, i) => (
                      <div key={i} className="p-3 rounded-lg bg-emerald-900/10 border border-emerald-500/20">
                        <div className="text-[10px] font-bold text-emerald-400 mb-1 font-mono">{item.term}</div>
                        <div className="text-[10px] text-zinc-500 leading-relaxed">{item.definition}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
