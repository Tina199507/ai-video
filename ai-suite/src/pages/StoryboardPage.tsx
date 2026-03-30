
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useLanguage } from '../context/LanguageContext';
import { Button } from '../components/ui/Button';
import { ImageIcon, Film, Palette } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { ScenePreviewModal } from '../components/storyboard/ScenePreviewModal';
import { AnchorModal } from '../components/storyboard/AnchorModal';
import { StoryboardGrid } from '../components/storyboard/StoryboardGrid';

const StoryboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, actions, generatingAssets } = useProject();
  const { t } = useLanguage();
  
  const [showAnchorModal, setShowAnchorModal] = useState(false);
  const [hasAutoShownAnchor, setHasAutoShownAnchor] = useState(false);
  const [previewSceneId, setPreviewSceneId] = useState<string | null>(null);

  const scenes = state.scenes || [];
  const hasAnchor = !!state.referenceSheetUrl;
  const isGlobalProcessing = state.isProcessing;
  const isPortrait = state.targetAspectRatio === "9:16";

  // Auto-show AnchorModal when anchor is ready and it's the first time
  useEffect(() => {
      if (hasAnchor && !hasAutoShownAnchor && !isGlobalProcessing) {
          setShowAnchorModal(true);
          setHasAutoShownAnchor(true);
      }
  }, [hasAnchor, hasAutoShownAnchor, isGlobalProcessing]);

  const savePrompt = (id: string, newPrompt: string) => {
      if (newPrompt.trim()) {
          actions.handleUpdateScene(id, { visualPrompt: newPrompt });
      }
      setPreviewSceneId(null); // Close modal on save
  };

  const handleOpenPreview = (sceneId: string) => {
      setPreviewSceneId(sceneId);
  };

  const handleClosePreview = () => {
      setPreviewSceneId(null);
  };

  const handleNavigatePreview = useCallback((directionOrId: 'next' | 'prev' | string) => {
    if (directionOrId === 'next' || directionOrId === 'prev') {
        if (!previewSceneId) return;
        const currentIndex = scenes.findIndex(s => s.id === previewSceneId);
        if (currentIndex === -1) return;

        let newIndex = directionOrId === 'next' ? currentIndex + 1 : currentIndex - 1;
        
        if (newIndex >= scenes.length) newIndex = 0;
        if (newIndex < 0) newIndex = scenes.length - 1;

        setPreviewSceneId(scenes[newIndex].id);
    } else {
        setPreviewSceneId(directionOrId);
    }
  }, [previewSceneId, scenes]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (!previewSceneId) return;
          if (e.key === 'ArrowRight') handleNavigatePreview('next');
          if (e.key === 'ArrowLeft') handleNavigatePreview('prev');
          if (e.key === 'Escape') handleClosePreview();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewSceneId, handleNavigatePreview]);

  const readyToRender = scenes.length > 0 && scenes.some(s => s.status === 'done');

  return (
    <div className="w-full h-full flex flex-col relative animate-fade-in bg-[#050505]">
        <TopBar
            title={t('story.title')}
            subtitle={t('story.subtitle')}
            centerContent={
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/5">
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                            {state.modelConfig.visualModel}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/5">
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                            {scenes.length} {t('story.frames')}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/5">
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                            {isPortrait ? '9:16' : '16:9'}
                        </span>
                    </div>
                </div>
            }
            actions={
                <div className="flex items-center gap-3">
                    <Button 
                        onClick={actions.handleGenerateAllAssets} 
                        disabled={!hasAnchor || isGlobalProcessing} 
                        isLoading={isGlobalProcessing && generatingAssets.size > 1} 
                        variant="secondary" 
                        icon={<ImageIcon size={16} />} 
                        className="border-white/10"
                    >
                        {t('story.generate_all')}
                    </Button>
                    <Button 
                        onClick={() => navigate('/editor')} 
                        disabled={!readyToRender} 
                        variant="primary" 
                        icon={<Film size={16} />} 
                        className={readyToRender ? 'shadow-glow animate-pulse-slow' : 'opacity-50 grayscale'}
                    >
                        {t('story.generate_video')}
                    </Button>
                </div>
            }
        />

        <ScenePreviewModal 
            sceneId={previewSceneId}
            onClose={handleClosePreview}
            onNavigate={handleNavigatePreview}
            onSavePrompt={savePrompt}
        />

        <AnchorModal isOpen={showAnchorModal} onClose={() => setShowAnchorModal(false)} />

        <main className="flex-grow w-full max-w-[1920px] mx-auto px-12 py-12 flex flex-col h-[calc(100vh-10rem)] overflow-hidden">
            <StoryboardGrid onSceneClick={handleOpenPreview} onAnchorClick={() => setShowAnchorModal(true)} />
        </main>
    </div>
  );
};

export default StoryboardPage;
