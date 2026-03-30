import React from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { DroppableBeat } from './DroppableBeat';
import { NarrativeBeat } from './NarrativeBeat';
import { NarrativeMap, ResearchData, ConstraintCompliance } from '../../types';
import { ConstraintComplianceBar } from './ConstraintComplianceBar';

interface NarrativePanelProps {
  narrativeMap: NarrativeMap | null;
  activeBeatIndex: number | null;
  highlightedFactId: string | null;
  beatCount: number;
  editingBeatIndex: number | null;
  tempEditValue: string;
  researchData: ResearchData | null;
  isImmersiveMode: boolean;
  t: (key: string) => string;
  onAddBeat: () => void;
  onEditStart: (index: number, beat: any) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (e: React.MouseEvent, index: number) => void;
  onEditChange: (value: string) => void;
  onBeatClick: (index: number, beat: any) => void;
  checkIfBeatUsingHighlightedFact: (beat: any) => boolean;
  constraintCompliance?: ConstraintCompliance;
}

export const NarrativePanel: React.FC<NarrativePanelProps> = ({
  narrativeMap,
  activeBeatIndex,
  highlightedFactId,
  beatCount,
  editingBeatIndex,
  tempEditValue,
  researchData,
  isImmersiveMode,
  t,
  onAddBeat,
  onEditStart,
  onEditSave,
  onEditCancel,
  onDelete,
  onEditChange,
  onBeatClick,
  checkIfBeatUsingHighlightedFact,
  constraintCompliance,
}) => {
  return (
    <section className={`w-1/4 min-w-[280px] max-w-[350px] shrink-0 flex flex-col h-full transition-all duration-700 z-20 bg-white/[0.02] backdrop-blur-md hover:border-r hover:border-white/10 border-r border-transparent ${isImmersiveMode ? 'opacity-5 grayscale pointer-events-none scale-95' : 'opacity-40 hover:opacity-100'}`}>
      <div className="p-4 flex items-center justify-end flex-none h-12">
        <div className="flex gap-3 items-center">
          {/* Plus icon removed as per user request */}
        </div>
      </div>

      <div className="flex-grow overflow-y-auto px-4 pb-4 flex flex-col gap-6 relative custom-scrollbar">
        {/* Timeline Visual Metaphor */}
        <div className="absolute left-8 top-6 bottom-6 w-0.5 bg-gray-800 z-0">
          {activeBeatIndex !== null && (
            <div 
              className="absolute w-2 h-2 bg-blue-500 rounded-full -left-[3px] shadow-[0_0_10px_#3b82f6] transition-all duration-500 ease-in-out"
              style={{ top: `${(activeBeatIndex / (beatCount || 1)) * 100}%` }}
            ></div>
          )}
        </div>
        {!narrativeMap ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-600 text-xs text-center z-10 bg-[#050505]">
            <Loader2 className="w-6 h-6 animate-spin mb-2 opacity-50" />
            {t("script.generating_strategy")}
          </div>
        ) : (
          <>
            {narrativeMap?.map((beat, i) => {
              const isActive = activeBeatIndex === i;
              const isRelatedToFact = checkIfBeatUsingHighlightedFact(beat);
              const isDimmed =
                (activeBeatIndex !== null && !isActive) ||
                (highlightedFactId !== null && !isRelatedToFact);
              const isEditing = editingBeatIndex === i;

              return (
                <DroppableBeat
                  key={i}
                  beat={beat}
                  index={i}
                  isActive={isActive}
                  isRelatedToFact={isRelatedToFact}
                  isDimmed={isDimmed}
                  isEditing={isEditing}
                >
                  <NarrativeBeat
                    beat={beat}
                    index={i}
                    isActive={isActive}
                    isRelatedToFact={isRelatedToFact}
                    isDimmed={isDimmed}
                    isEditing={isEditing}
                    tempEditValue={tempEditValue}
                    onEditStart={onEditStart}
                    onEditSave={onEditSave}
                    onEditCancel={onEditCancel}
                    onDelete={onDelete}
                    onEditChange={onEditChange}
                    onClick={() => !isEditing && onBeatClick(i, beat)}
                    researchData={researchData}
                  />
                </DroppableBeat>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
};
