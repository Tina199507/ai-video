
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { generateProjectKit, compileEpisode } from '../services/videoRenderer';
import { 
    Download, Package, CheckCircle2, ArrowLeft, Layers, 
    Loader2, FolderArchive, Video, Sparkles, AlertTriangle, Film, Image as ImageIcon
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useLanguage } from '../context/LanguageContext';
import { PreviewModal } from '../components/editor/PreviewModal';
import { AssetRow } from '../components/editor/AssetRow';
import { TopBar } from '../components/TopBar';

const EditorPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, actions } = useProject();
  const { t } = useLanguage();
  const [isPackaging, setIsPackaging] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState('');
  const [showExportOptions, setShowExportOptions] = useState(false);
  
  const generationMode = state.modelConfig.preferredWorkflow || 'video';
  
  // Preview Modal State
  const [previewSceneId, setPreviewSceneId] = useState<string | null>(null);

  // Audio preview state (for list item)
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayAudio = (url: string, id: string) => {
      if (playingAudioId === id && audioRef.current) {
          audioRef.current.pause();
          setPlayingAudioId(null);
      } else {
          if (audioRef.current) audioRef.current.pause();
          try {
              audioRef.current = new Audio(url);
              audioRef.current.onended = () => setPlayingAudioId(null);
              audioRef.current.onerror = (e) => {
                  console.error("Audio playback error", e);
                  alert(t('editor.audio_error') || "Audio file unavailable. Please regenerate.");
                  setPlayingAudioId(null);
              };
              audioRef.current.play().catch(e => {
                  console.error("Audio play failed", e);
                  // Don't alert for user-interruption (Aborted), only for source errors
                  if (e.name !== 'AbortError') {
                      alert(t('editor.audio_error') || "Audio file unavailable. Please regenerate.");
                  }
                  setPlayingAudioId(null);
              });
              setPlayingAudioId(id);
          } catch (e) {
              console.error("Audio init failed", e);
              setPlayingAudioId(null);
          }
      }
  };

  const handleOpenPreview = (id: string) => {
      setPreviewSceneId(id);
  };

  const handleClosePreview = () => {
      setPreviewSceneId(null);
  };

  const handleDownloadKit = async () => {
      if (isPackaging || isRendering) return;
      setIsPackaging(true);
      setShowExportOptions(false);
      try {
          const zipBlob = await generateProjectKit(
              state.scenes,
              state.projectTitle || 'My_Video_Project',
              state.draftScript || '',
              state.styleProfile?.tone || 'Neutral',
              (msg) => setProgress(msg)
          );
          
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${(state.projectTitle || 'project').replace(/\s+/g, '_')}_Kit.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
      } catch (e) {
          console.error("Packaging failed", e);
          alert(t('editor.package_error') || "Failed to package project. Please try again.");
      } finally {
          setIsPackaging(false);
          setProgress('');
      }
  };

  const handleCompileVideo = async () => {
      if (isPackaging || isRendering) return;
      setIsRendering(true);
      setShowExportOptions(false);
      try {
          const videoBlob = await compileEpisode(
              state.scenes,
              state.targetAspectRatio,
              (msg) => setProgress(msg)
          );
          
          const url = URL.createObjectURL(videoBlob);
          const a = document.createElement('a');
          a.href = url;
          const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
          a.download = `${(state.projectTitle || 'project').replace(/\s+/g, '_')}_Final.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
      } catch (e: any) {
          console.error("Rendering failed", e);
          alert(t('editor.render_fail') + ": " + e.message);
      } finally {
          setIsRendering(false);
          setProgress('');
      }
  };

  // --- EMPTY STATE ---
  if (!state.scenes || state.scenes.length === 0) {
      return (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-4">
              <Layers size={48} /><p>{t('editor.empty_state')}</p>
              <Button onClick={() => navigate('/storyboard')}>{t('editor.go_storyboard')}</Button>
          </div>
      );
  }

  const activePreviewScene = state.scenes.find(s => s.id === previewSceneId) || null;

  return (
    <div className="w-full h-full flex flex-col bg-[#050505] animate-fade-in relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/5 via-transparent to-black pointer-events-none"></div>
        <TopBar
            title={t('editor.title')}
            subtitle={t('editor.subtitle')}
            centerContent={
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/5 backdrop-blur-sm">
                        {generationMode === 'video' ? <Film size={12} className="text-indigo-400" /> : <ImageIcon size={12} className="text-indigo-400" />}
                        <span className="text-[10px] font-mono text-zinc-300 uppercase tracking-wider">
                            {generationMode === 'video' ? t('editor.motion_mode') : t('editor.slideshow_mode')}
                        </span>
                    </div>
                </div>
            }
            actions={
                <div className="flex items-center gap-3">
                    <Button 
                        variant="secondary" 
                        onClick={() => setShowExportOptions(true)} 
                        disabled={isPackaging || isRendering}
                        icon={isRendering || isPackaging ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
                        className="border-white/10 bg-white/5 hover:bg-white/10 font-mono uppercase tracking-widest text-[10px] h-8 px-4"
                    >
                        {t('editor.export')}
                    </Button>

                    <Button 
                        variant="primary" 
                        onClick={() => actions.handleGenerateAllMissingAssets(generationMode)} 
                        disabled={state.isProcessing}
                        icon={state.isProcessing ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                        className="shadow-[0_0_20px_rgba(147,51,234,0.2)] bg-indigo-600 hover:bg-indigo-500 border-none font-mono uppercase tracking-widest text-[10px] h-8 px-4"
                    >
                        {t('editor.auto_generate_missing')}
                    </Button>
                </div>
            }
        />
        
        {/* Preview Modal */}
        {activePreviewScene && (
            <PreviewModal 
                scene={activePreviewScene}
                onClose={handleClosePreview}
                onGenerateMotion={(id) => actions.handleGenerateAsset(id, 'video')}
                onGenerateAudio={(id) => actions.handleGenerateSpeech(id)}
            />
        )}

        {/* Export Modal Overlay */}
        {showExportOptions && (
            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <Card className="w-full max-w-md bg-zinc-900 border-zinc-800 shadow-2xl">
                    <div className="p-6 space-y-6">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-white mb-1">{t('editor.export_project')}</h3>
                                <p className="text-sm text-zinc-400">{t('editor.export_desc')}</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setShowExportOptions(false)}>✕</Button>
                        </div>

                        <div className="space-y-4">
                            <button 
                                onClick={handleCompileVideo}
                                className="w-full flex items-center gap-4 p-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 hover:border-indigo-500/50 transition-all group text-left"
                            >
                                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                    <Video size={20} />
                                </div>
                                <div>
                                    <div className="font-bold text-white">{t('editor.stitch_render')}</div>
                                    <div className="text-xs text-zinc-400">{t('editor.stitch_desc')}</div>
                                </div>
                            </button>

                            <button 
                                onClick={handleDownloadKit}
                                className="w-full flex items-center gap-4 p-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 hover:border-blue-500/50 transition-all group text-left"
                            >
                                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                    <FolderArchive size={20} />
                                </div>
                                <div>
                                    <div className="font-bold text-white">{t('editor.project_kit')}</div>
                                    <div className="text-xs text-zinc-400">{t('editor.kit_desc')}</div>
                                </div>
                            </button>
                        </div>
                        
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-3 items-start">
                            <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                            <p className="text-xs text-amber-200/80">
                                {t('editor.render_warning')}
                            </p>
                        </div>
                    </div>
                </Card>
            </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
            
            {/* Timeline Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:px-12 relative">
                <div className="max-w-[1920px] mx-auto w-full">
                    
                    {/* Timeline Header - Modernized */}
                    <div className="sticky top-0 z-20 bg-[#050505]/95 backdrop-blur-xl border-b border-white/5 mb-6 pb-4 pt-2 flex items-center gap-6">
                        <div className="w-16 shrink-0 text-right pr-4 border-r border-white/10">
                            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">{t('editor.tc')}</span>
                        </div>
                        
                        <div className="flex-1 flex items-center justify-between">
                            <div className="flex items-center gap-8">
                                <div className="flex items-center gap-2 group cursor-help" title="Visual Track">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
                                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest group-hover:text-indigo-400 transition-colors">{t('editor.v1_visual')}</span>
                                </div>
                                <div className="flex items-center gap-2 group cursor-help" title="Audio Track">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest group-hover:text-emerald-400 transition-colors">{t('editor.a1_voiceover')}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 bg-white/[0.02] px-4 py-1.5 rounded-full border border-white/5">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">{t('editor.total_duration')}:</span>
                                    <span className="text-[11px] font-mono text-zinc-300 font-medium">
                                        00:{state.scenes.reduce((acc, s) => acc + (s.estimatedDuration || 0), 0).toString().padStart(2, '0')}.00
                                    </span>
                                </div>

                                <div className="h-3 w-px bg-white/10"></div>

                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">{t('editor.a2_bgm')}:</span>
                                    <span className="text-[10px] font-mono text-zinc-500 italic">{t('editor.no_bgm_track')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Timeline Tracks */}
                    <div className="flex flex-col gap-3 pb-24">
                        {state.scenes.map((scene, index) => (
                            <AssetRow 
                                key={scene.id}
                                scene={scene}
                                generationMode={generationMode}
                                playingAudioId={playingAudioId}
                                isProcessing={state.isProcessing}
                                onOpenPreview={handleOpenPreview}
                                onPlayAudio={handlePlayAudio}
                                onGenerateAsset={actions.handleGenerateAsset}
                                onGenerateSpeech={actions.handleGenerateSpeech}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Floating Status Indicator (Replaces Engine Room) */}
            {(isPackaging || isRendering) && (
                <div className="absolute bottom-8 right-8 z-50 flex items-center gap-4 bg-zinc-900/90 backdrop-blur-md px-5 py-3 rounded-2xl border border-indigo-500/20 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-4">
                    <div className="relative">
                        <Loader2 className="animate-spin text-indigo-400" size={20} />
                        <div className="absolute inset-0 bg-indigo-500/20 blur-lg rounded-full"></div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest font-mono">{t('editor.rendering_engine_active')}</span>
                        <span className="text-xs text-zinc-400 font-mono mt-0.5">{progress || t('editor.processing')}</span>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

export default EditorPage;
