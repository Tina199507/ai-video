import React from 'react';
import { Loader2 } from 'lucide-react';
import { SceneCard } from './SceneCard';
import { SafetyAlerts } from './SafetyAlerts';
import { AuditTabs } from './AuditTabs';
import { RefineBar } from './RefineBar';
import { ResearchData, ConstraintCompliance, AuditResult, StyleProfile } from '../../types';
import { ConstraintComplianceBar } from './ConstraintComplianceBar';
import { RevisionBanner } from './RevisionBanner';

interface PendingDiff {
  index: number;
  original: string;
  new: string;
}

interface ScriptEditorPanelProps {
  scriptScenes: string[];
  activeBeatIndex: number | null;
  pendingDiff: PendingDiff | null;
  requiresManualCorrection: boolean;
  safetyMetadata: any;
  highRiskApproved: boolean;
  safetyCheckboxRef: React.RefObject<HTMLDivElement>;
  isProcessing: boolean;
  progressMessage?: string;
  scriptVersionsLength: number;
  t: (key: string) => string;
  onApproveChange: (approved: boolean) => void;
  onFocus: (index: number) => void;
  onBlur: () => void;
  onChange: (index: number, content: string) => void;
  onDiscard: () => void;
  onAccept: () => void;
  onTTS: (text: string) => void;
  sceneRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  
  // RefineBar props
  visualAnchor: string | undefined;
  isRefining: boolean;
  refineInstruction: string;
  onInstructionChange: (value: string) => void;
  onRefineKeyDown: (e: React.KeyboardEvent) => void;
  onRefineSubmit: () => void;
  onVerifyClaim?: (index: number, newContent: string) => void;
  
  researchData: ResearchData | null;
  constraintCompliance?: ConstraintCompliance;
  auditResult?: AuditResult;
  styleProfile?: StyleProfile;
}

export const ScriptEditorPanel: React.FC<ScriptEditorPanelProps> = ({
  scriptScenes,
  activeBeatIndex,
  pendingDiff,
  requiresManualCorrection,
  safetyMetadata,
  highRiskApproved,
  safetyCheckboxRef,
  isProcessing,
  scriptVersionsLength,
  t,
  onApproveChange,
  onFocus,
  onBlur,
  onChange,
  onDiscard,
  onAccept,
  onTTS,
  sceneRefs,
  scrollContainerRef,
  visualAnchor,
  isRefining,
  refineInstruction,
  onInstructionChange,
  onRefineKeyDown,
  onRefineSubmit,
  progressMessage,
  onVerifyClaim,
  researchData,
  constraintCompliance,
  auditResult,
  styleProfile
}) => {
  return (
    <section
      className={`flex-1 min-w-[480px] flex flex-col relative h-full transition-colors duration-500 bg-[#050505]`}
    >
      <div className="absolute inset-0 bg-dot-grid opacity-5 pointer-events-none"></div>
      <div
        ref={scrollContainerRef}
        className="flex-grow overflow-y-auto relative p-8 pb-60 custom-scrollbar pt-40"
      >
        <div className="max-w-3xl mx-auto space-y-40">
          {/* Safety & Correction Alerts */}
          <SafetyAlerts 
            requiresManualCorrection={requiresManualCorrection}
            safetyMetadata={safetyMetadata}
            highRiskApproved={highRiskApproved}
            onApproveChange={onApproveChange}
            safetyCheckboxRef={safetyCheckboxRef}
          />

          {/* Revision Banner */}
          {auditResult?.final_verdict === "NEEDS_REVISION" && auditResult.revision_instructions && (
            <RevisionBanner instructions={auditResult.revision_instructions} />
          )}

          {/* Audit Tabs */}
          {auditResult && (
            <AuditTabs auditResult={auditResult} />
          )}

          {!scriptScenes.length && (
            <div className="text-center text-gray-500 mt-20 flex flex-col items-center gap-3">
              {isProcessing ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="font-mono text-xs uppercase tracking-widest text-primary animate-pulse">{progressMessage || t("script.generating_script")}</span>
                </>
              ) : (
                <>
                  <span className="text-lg">
                    {t("script.empty_script")}
                  </span>
                  {scriptVersionsLength > 0 && (
                    <span className="text-xs text-red-400">
                      {t("script.parse_error")}
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {scriptScenes.map((sceneContent, index) => {
            const isActive = activeBeatIndex === index;
            const isPendingDiff = pendingDiff?.index === index;

            return (
              <SceneCard
                key={index}
                index={index}
                content={sceneContent}
                isActive={isActive}
                isPendingDiff={isPendingDiff}
                pendingDiff={pendingDiff}
                onFocus={onFocus}
                onBlur={onBlur}
                onChange={onChange}
                onDiscard={onDiscard}
                onAccept={onAccept}
                onTTS={onTTS}
                onVerifyClaim={onVerifyClaim}
                researchData={researchData}
                setRef={(el) => {
                  sceneRefs.current[index] = el;
                }}
              />
            );
          })}

          {/* The "Write to the End" Space - Visual Metaphor */}
          <div className="h-[60vh] flex flex-col items-center justify-start pt-32 border-t border-white/[0.02]">
              <div className="flex flex-col items-center gap-6 opacity-10 hover:opacity-40 transition-opacity duration-1000 group">
                  <div className="w-px h-32 bg-gradient-to-b from-zinc-500 to-transparent group-hover:h-48 transition-all duration-1000"></div>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.6em] font-light">{t('script.write_to_end')}</span>
              </div>
          </div>
        </div>
      </div>

      <RefineBar 
        visualAnchor={visualAnchor}
        isProcessing={isProcessing}
        isRefining={isRefining}
        pendingDiff={pendingDiff}
        refineInstruction={refineInstruction}
        activeBeatIndex={activeBeatIndex}
        onInstructionChange={onInstructionChange}
        onKeyDown={onRefineKeyDown}
        onSubmit={onRefineSubmit}
      />

      {constraintCompliance && (
        <ConstraintComplianceBar 
          compliance={constraintCompliance} 
          targetMetaphorCount={styleProfile?.track_a_script?.metaphor_count || 5} 
          targetInteractionCues={styleProfile?.track_a_script?.interaction_cues_count || 1} 
        />
      )}
    </section>
  );
};
