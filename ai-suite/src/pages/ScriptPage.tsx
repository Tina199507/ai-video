import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ModelType } from "../types";
import SafetyModal from "../components/SafetyModal";
import { useProject } from "../context/ProjectContext";
import { useLanguage } from "../context/LanguageContext";
import { ScriptTopBar } from "../components/script/ScriptTopBar";
import { ResearchPanel } from "../components/script/ResearchPanel";
import { NarrativePanel } from "../components/script/NarrativePanel";
import { ScriptEditorPanel } from "../components/script/ScriptEditorPanel";
import { ScriptToast } from "../components/script/ScriptToast";
import {
  DndContext,
  DragEndEvent,
} from "@dnd-kit/core";

export interface PendingDiff {
  index: number;
  original: string;
  new: string;
}

const ScriptPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, actions, workflowProgress } = useProject();
  const { t } = useLanguage();

  const [localScript, setLocalScript] = useState(state.draftScript || "");
  const [refineInstruction, setRefineInstruction] = useState("");

  const [editingFactIndex, setEditingFactIndex] = useState<number | null>(null);
  const [editingBeatIndex, setEditingBeatIndex] = useState<number | null>(null);
  const [tempEditValue, setTempEditValue] = useState("");

  const [activeBeatIndex, setActiveBeatIndex] = useState<number | null>(null);
  const [highlightedFactId, setHighlightedFactId] = useState<string | null>(
    null,
  );
  const [isScrolling, setIsScrolling] = useState(false);

  const [isRefining, setIsRefining] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<PendingDiff | null>(null);
  const [showToast, setShowToast] = useState<{
    message: string;
    type: "success" | "info";
  } | null>(null);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };


  const sceneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const latestVersion = state.scriptVersions[state.scriptVersions.length - 1];
  const usedFactIDs = useMemo(
    () => latestVersion?.usedFactIDs || [],
    [latestVersion],
  );
  const requiresManualCorrection = useMemo(
    () => latestVersion?.requiresManualCorrection || false,
    [latestVersion],
  );
  const safetyMetadata = useMemo(
    () => latestVersion?.safetyMetadata,
    [latestVersion],
  );
  const constraintCompliance = useMemo(
    () => latestVersion?.constraintCompliance || state.scriptVersions[state.scriptVersions.length - 1]?.constraintCompliance,
    [latestVersion, state.scriptVersions]
  );
  const auditResult = useMemo(
    () => latestVersion?.auditResult || state.scriptVersions[state.scriptVersions.length - 1]?.auditResult,
    [latestVersion, state.scriptVersions]
  );
  const calibration = useMemo(
    () => (latestVersion as any)?.calibration || (state.scriptVersions[state.scriptVersions.length - 1] as any)?.calibration,
    [latestVersion, state.scriptVersions]
  );

  const [highRiskApproved, setHighRiskApproved] = useState(false);
  const safetyCheckboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.draftScript && !pendingDiff) {
      setLocalScript(state.draftScript);
    }
  }, [state.draftScript, pendingDiff]);

  // Autosave
  useEffect(() => {
    const id = setTimeout(() => {
      if (localScript !== state.draftScript) {
        actions.handleUpdateDraft(localScript);
        actions.handleCreateLocalHistory(localScript);
      }
    }, 1200);
    return () => clearTimeout(id);
  }, [localScript, state.draftScript, actions]);

  useEffect(() => {
    if (!localScript && state.scriptVersions.length > 0) {
      const latest = state.scriptVersions[state.scriptVersions.length - 1];
      if (latest && latest.content) {
        setLocalScript(latest.content);
      }
    }
  }, [state.scriptVersions]); // Fixed dependency

  const scriptScenes = useMemo(() => {
    if (!localScript) return [];
    // Robust splitting: Try Markdown headers first
    const mdHeadings = localScript.split(/\n(?=##\s)/);
    if (mdHeadings.length > 1)
      return mdHeadings.map((s) => s.trim()).filter(Boolean);

    // Fallback to regex
    const splitRegex =
      /(?=^(?:#{0,6}\s*)?(?:[\*\_\[【])?(?:(?:Scene|Sequence|Section|Beat|Shot)\s+(?:\d+|[IVX]+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)|(?:场景|幕|场次)\s*(?:\d+|[一二三四五六七八九十百]+)|(?:第\s*[0-9一二三四五六七八九十百]+\s*[场幕]))(?:[:\uff1a\.\]】])?)/gim;
    const parts = localScript.split(splitRegex);
    let validScenes = parts.filter((p) => p.trim().length > 0);

    if (validScenes.length > 1) {
      const firstBlockFirstLine = validScenes[0].trim().split("\n")[0];
      const headerPattern =
        /^(?:#{0,6}\s*)?(?:[\*\_\[【])?(?:(?:Scene|Sequence|Section|Beat)|(?:场景|幕|场次)|(?:第))/i;
      if (!headerPattern.test(firstBlockFirstLine)) {
        validScenes.shift();
      }
    }
    if (validScenes.length === 0 && localScript.trim().length > 0) {
      return [`## Scene 1 (${t("script.auto_recovered")})\n${localScript}`];
    }
    return validScenes;
  }, [localScript, t]);

  useEffect(() => {
    const rootEl = scrollContainerRef.current;
    if (!rootEl || scriptScenes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrolling) return;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute("data-scene-index"));
            if (!isNaN(index)) {
              setActiveBeatIndex(index);
              setHighlightedFactId(null);
            }
          }
        });
      },
      { root: rootEl, threshold: 0.6 },
    );

    const currentRefs = sceneRefs.current;
    currentRefs.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => {
      currentRefs.forEach((el) => {
        if (el) observer.unobserve(el);
      });
      observer.disconnect();
    };
  }, [scriptScenes, isScrolling]);

  const handleConfirm = () => {
    // High Risk Approval Check
    if (safetyMetadata?.isHighRisk && !highRiskApproved) {
      actions.addLog(
        "Action Blocked: High-risk content must be manually approved before proceeding.",
        "error",
      );
      
      // Visual cue: scroll to and flash the checkbox
      safetyCheckboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      safetyCheckboxRef.current?.classList.add('animate-pulse', 'ring-2', 'ring-orange-500');
      setTimeout(() => {
        safetyCheckboxRef.current?.classList.remove('animate-pulse', 'ring-2', 'ring-orange-500');
      }, 3000);
      
      return;
    }

    // Safety Check
    if (
      state.verificationReport?.safetyCheck === false ||
      state.verificationReport?.medicalFlag
    ) {
      setShowSafetyModal(true);
      return;
    }

    if (safetyMetadata?.isHighRisk && highRiskApproved) {
      actions.addLog(`Audit: High-risk content approved by user.`, "warning");
    }

    actions.handleScriptApproved(localScript);
    // Small delay to ensure state updates (like isProcessing) propagate before navigation
    setTimeout(() => navigate("/storyboard"), 50);
  };

  const handleProceedSafety = () => {
    setShowSafetyModal(false);
    actions.addLog(
      `Safety Override: User proceeded despite warning. Reason: ${state.verificationReport?.safetyReason}`,
      "warning",
    );
    actions.handleScriptApproved(localScript);
    // Small delay to ensure state updates propagate before navigation
    setTimeout(() => navigate("/storyboard"), 50);
  };

  const handleRefineSubmit = async () => {
    if (!refineInstruction.trim() || state.isProcessing || isRefining) return;
    setIsRefining(true);
    if (activeBeatIndex !== null && scriptScenes[activeBeatIndex]) {
      try {
        const originalSceneText = scriptScenes[activeBeatIndex];
        const newSceneText = await actions.handleRefineScenePreview(
          originalSceneText,
          activeBeatIndex,
          refineInstruction,
        );
        
        if (newSceneText === originalSceneText) {
             setShowToast({ message: "AI made no changes to the scene.", type: "info" });
        } else {
            setPendingDiff({
              index: activeBeatIndex,
              original: originalSceneText,
              new: newSceneText,
            });
            setShowToast({
              message: t("script.revision_complete"),
              type: "success",
            });
        }
      } catch (e) {
        setShowToast({ message: t("script.refinement_failed"), type: "info" });
      }
    } else {
      await actions.handleRefineScript(refineInstruction);
    }
    setIsRefining(false);
    setRefineInstruction("");
  };

  const handleAcceptRefinement = async () => {
    if (pendingDiff) {
      const newScenes = [...scriptScenes];
      newScenes[pendingDiff.index] = pendingDiff.new;
      const newFullScript = newScenes.join("\n\n");

      handleSceneChange(pendingDiff.index, pendingDiff.new);

      try {
        await actions.handleCreateScriptVersion(newFullScript, {
          source: "accept-refine",
        });
        
        // Trigger verification (async, don't block UI)
        actions.handleVerifyScript(newFullScript);

        setShowToast({ message: t("script.saved_version"), type: "success" });
      } catch (e) {
        setShowToast({ message: t("script.save_failed"), type: "info" });
      } finally {
        setPendingDiff(null);
      }
    }
  };

  const handleDiscardRefinement = () => {
    setPendingDiff(null);
    setShowToast(null);
  };

  const handleTTS = (text: string) => {
    if ("speechSynthesis" in window) {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
      setShowToast({
        message: t("script.tts_preview") + " (Local Preview)",
        type: "info",
      });
    }
  };

  const handleVerifyClaim = (index: number, newContent: string) => {
    handleSceneChange(index, newContent);
    setShowToast({
        message: t("script.claim_verified"),
        type: "success"
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleRefineSubmit();
    }
  };

  const handleSceneChange = (index: number, newContent: string) => {
    if (index === -1) {
      setLocalScript(newContent);
      return;
    }
    const newScenes = [...scriptScenes];
    newScenes[index] = newContent;
    setLocalScript(newScenes.join("\n\n"));
  };

  const handleEditFactStart = (index: number, content: string) => {
    setEditingFactIndex(index);
    setTempEditValue(content);
  };

  const handleEditFactSave = () => {
    if (editingFactIndex !== null) {
      const updatedFact = {
        ...state.researchData!.facts[editingFactIndex],
        content: tempEditValue,
      };
      actions.handleUpdateResearchData((prev) => {
        const newFacts = [...prev.facts];
        newFacts[editingFactIndex] = updatedFact;
        return { ...prev, facts: newFacts };
      });
      actions.addLog('Research Fact edited manually', 'info', updatedFact);
      setEditingFactIndex(null);
    }
  };

  const handleAddFact = () => {
    actions.handleUpdateResearchData((prev) => ({
      ...prev,
      facts: [
        {
          content: t("script.new_fact"),
          source: t("script.manual_entry"),
          confidence: "User",
        },
        ...prev.facts,
      ],
    }));
  };

  const handleDeleteFact = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    actions.handleUpdateResearchData((prev) => ({
      ...prev,
      facts: prev.facts.filter((_, i) => i !== index),
    }));
  };

  const handleEditBeatStart = (index: number, beat: any) => {
    setEditingBeatIndex(index);
    setTempEditValue(beat.description);
  };

  const handleEditBeatSave = () => {
    if (editingBeatIndex !== null) {
      const updatedBeat = {
        ...state.narrativeMap![editingBeatIndex],
        description: tempEditValue,
      };
      actions.handleUpdateNarrativeMap((prev) => {
        const newMap = [...prev];
        newMap[editingBeatIndex] = updatedBeat;
        return newMap;
      });
      actions.addLog('Narrative Beat edited manually', 'info', updatedBeat);
      setEditingBeatIndex(null);
    }
  };

  const handleAddBeat = () => {
    actions.handleUpdateNarrativeMap((prev) => [
      ...prev,
      {
        sectionTitle: t("script.new_section"),
        description: t("script.describe_scene"),
        estimatedDuration: 10,
        factReferences: [],
      },
    ]);
  };

  const handleDeleteBeat = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    actions.handleUpdateNarrativeMap((prev) =>
      prev.filter((_, i) => i !== index),
    );
  };

  const scrollToScene = (index: number) => {
    setIsScrolling(true);
    setActiveBeatIndex(index);
    const targetRef = sceneRefs.current[index];
    if (targetRef && scrollContainerRef.current) {
      targetRef.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setTimeout(() => setIsScrolling(false), 800);
  };

  const handleBeatClick = (index: number, beat: any) => {
    if (editingBeatIndex === index) return;
    if (activeBeatIndex === index) {
      scrollToScene(index);
    } else {
      scrollToScene(index);
    }
    setHighlightedFactId(null);
  };

  const handleSceneFocus = (index: number) => {
    if (!pendingDiff) {
      setActiveBeatIndex(index);
      setIsImmersiveMode(true);
    }
  };

  const handleSceneBlur = () => {
    setIsImmersiveMode(false);
  };

  const handleFactClick = (factId: string, index: number, content: string) => {
    if (editingFactIndex === index) return;
    if (highlightedFactId === factId) {
      setHighlightedFactId(null);
    } else {
      setHighlightedFactId(factId);
      setActiveBeatIndex(null);
    }
  };

  const isFactInActiveBeat = (factIndex: number) => {
    if (activeBeatIndex === null) return false;
    const beat = state.narrativeMap?.[activeBeatIndex];
    const factIdStr = `Fact-${factIndex + 1}`;
    return beat?.factReferences.some((ref) => ref.includes(factIdStr));
  };

  const isBeatUsingHighlightedFact = (beat: any) => {
    if (!highlightedFactId) return false;
    return beat.factReferences.some((ref: string) =>
      ref.includes(highlightedFactId),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    // Handle Fact -> Beat linking
    if (active.id.toString().startsWith('fact-') && over.id.toString().startsWith('beat-')) {
      const factIndex = active.data.current?.index;
      const beatIndex = over.data.current?.index;
      const factIdStr = `Fact-${factIndex + 1}`;

      actions.handleUpdateNarrativeMap((prev) => {
        const newMap = [...prev];
        const beat = newMap[beatIndex];
        if (!beat.factReferences.includes(factIdStr)) {
          newMap[beatIndex] = {
            ...beat,
            factReferences: [...beat.factReferences, factIdStr],
          };
        }
        return newMap;
      });
    }
    
    // Handle Beat -> Beat reordering
    if (active.id.toString().startsWith('beat-') && over.id.toString().startsWith('beat-')) {
      const oldIndex = active.data.current?.index;
      const newIndex = over.data.current?.index;
      
      if (oldIndex !== newIndex) {
        actions.handleUpdateNarrativeMap((prev) => {
          const newMap = [...prev];
          const [removed] = newMap.splice(oldIndex, 1);
          newMap.splice(newIndex, 0, removed);
          return newMap;
        });
        
        // Also reorder script scenes to match
        const newScenes = [...scriptScenes];
        const [removedScene] = newScenes.splice(oldIndex, 1);
        newScenes.splice(newIndex, 0, removedScene);
        const newFullScript = newScenes.join("\n\n");
        handleSceneChange(-1, newFullScript); // -1 to indicate full update
      }
    }
  };

  const researchData = state.researchData;
  const narrativeMap = state.narrativeMap;
  const visualAnchor = state.referenceSheetUrl || state.referenceThumbnailUrl;
  const beatCount = narrativeMap?.length || 0;
  const sceneCount = scriptScenes.length;
  const isExpansion = sceneCount > beatCount;
  const expansionRatio =
    beatCount > 0 ? (sceneCount / beatCount).toFixed(1) : "1.0";

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="w-full h-full flex flex-col bg-[#050505] overflow-hidden animate-fade-in font-sans text-primary">
        <ScriptTopBar
          t={t}
          beatCount={beatCount}
          wordCount={state.styleProfile?.wordCount || 0}
          targetWPM={state.generationPlan?.targetWPM || 150}
          scriptVersionsLength={state.scriptVersions.length}
          isProcessing={state.isProcessing}
          localScript={localScript}
          pendingDiff={pendingDiff}
          safetyMetadata={safetyMetadata}
          highRiskApproved={highRiskApproved}
          styleProfile={state.styleProfile}
          onUpdateGenerationPlan={actions.handleUpdateGenerationPlan}
          onConfirm={handleConfirm}
        />
        
        <div className="flex flex-grow overflow-hidden relative">
          {/* Column 1: Assets (Facts) - The Drawer */}
          <ResearchPanel
            researchData={researchData}
            highlightedFactId={highlightedFactId}
            activeBeatIndex={activeBeatIndex}
            usedFactIDs={usedFactIDs}
            editingFactIndex={editingFactIndex}
            tempEditValue={tempEditValue}
            expandedSections={expandedSections}
            isImmersiveMode={isImmersiveMode}
            t={t}
            onFactClick={handleFactClick}
            onEditStart={handleEditFactStart}
            onEditSave={handleEditFactSave}
            onEditCancel={() => setEditingFactIndex(null)}
            onDelete={handleDeleteFact}
            onAddFact={handleAddFact}
            onClearFilter={() => setHighlightedFactId(null)}
            onToggleSection={toggleSection}
            setTempEditValue={setTempEditValue}
            checkIfFactInActiveBeat={isFactInActiveBeat}
            calibration={calibration}
            currentWordCount={localScript ? localScript.length : 0} // Approximate char count for Chinese
          />

          {/* Column 2: Narrative Map - The Drawer 2 */}
          <NarrativePanel
            narrativeMap={narrativeMap}
            activeBeatIndex={activeBeatIndex}
            highlightedFactId={highlightedFactId}
            beatCount={beatCount}
            editingBeatIndex={editingBeatIndex}
            tempEditValue={tempEditValue}
            researchData={researchData}
            isImmersiveMode={isImmersiveMode}
            t={t}
            onAddBeat={handleAddBeat}
            onEditStart={handleEditBeatStart}
            onEditSave={handleEditBeatSave}
            onEditCancel={() => setEditingBeatIndex(null)}
            onDelete={handleDeleteBeat}
            onEditChange={setTempEditValue}
            onBeatClick={handleBeatClick}
            checkIfBeatUsingHighlightedFact={isBeatUsingHighlightedFact}
            constraintCompliance={constraintCompliance}
          />

          {/* Column 3: Script Draft (The Stage) */}
          <ScriptEditorPanel
            scriptScenes={scriptScenes}
            activeBeatIndex={activeBeatIndex}
            pendingDiff={pendingDiff}
            requiresManualCorrection={requiresManualCorrection}
            safetyMetadata={safetyMetadata}
            highRiskApproved={highRiskApproved}
            safetyCheckboxRef={safetyCheckboxRef}
            isProcessing={state.isProcessing}
            scriptVersionsLength={state.scriptVersions.length}
            t={t}
            onApproveChange={setHighRiskApproved}
            onFocus={handleSceneFocus}
            onBlur={handleSceneBlur}
            onChange={handleSceneChange}
            onDiscard={handleDiscardRefinement}
            onAccept={handleAcceptRefinement}
            onTTS={handleTTS}
            sceneRefs={sceneRefs}
            scrollContainerRef={scrollContainerRef}
            visualAnchor={visualAnchor}
            isRefining={isRefining}
            refineInstruction={refineInstruction}
            onInstructionChange={setRefineInstruction}
            onRefineKeyDown={handleKeyDown}
            onRefineSubmit={handleRefineSubmit}
            progressMessage={state.isProcessing && workflowProgress?.step === 'scripting' ? workflowProgress.message : undefined}
            onVerifyClaim={handleVerifyClaim}
            researchData={researchData}
            constraintCompliance={constraintCompliance}
            auditResult={auditResult}
            styleProfile={state.styleProfile}
          />
        </div>

        <ScriptToast 
          showToast={showToast}
          pendingDiff={pendingDiff}
          onDiscard={handleDiscardRefinement}
        />
        <SafetyModal
          isOpen={showSafetyModal}
          onProceed={handleProceedSafety}
          onCancel={() => setShowSafetyModal(false)}
          reason={state.verificationReport?.safetyReason}
        />
      </div>
    </DndContext>
  );
};

export default ScriptPage;
