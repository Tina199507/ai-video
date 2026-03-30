import React from 'react';
import { ImageIcon, Loader2, Check, AlertTriangle, Maximize2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../ui/Button';

interface StoryboardGridProps {
    onSceneClick: (sceneId: string) => void;
    onAnchorClick?: () => void;
}

export const StoryboardGrid: React.FC<StoryboardGridProps> = ({ onSceneClick, onAnchorClick }) => {
    const { state, generatingAssets } = useProject();
    const { t } = useLanguage();
    const scenes = state.scenes || [];
    const isPortrait = state.targetAspectRatio === "9:16";

    if (scenes.length === 0 && !state.referenceSheetUrl) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600 space-y-4">
                {state.isProcessing ? (
                    <><Loader2 size={48} className="text-primary animate-spin" /><p className="font-mono text-sm uppercase tracking-widest animate-pulse">{t('story.consulting')}</p></>
                ) : (
                    <><ImageIcon size={48} strokeWidth={1} /><p className="font-mono text-sm uppercase tracking-widest">{t('story.no_scenes')}</p><Button variant="secondary" onClick={() => window.history.back()}>{t('story.back_script')}</Button></>
                )}
            </div>
        );
    }

    return (
        <div className="flex-grow overflow-y-auto pr-2 pb-40 custom-scrollbar">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-12">
                {/* Global Style Anchor Card */}
                {state.referenceSheetUrl && (
                    <article 
                        onClick={onAnchorClick}
                        className={`group relative bg-primary/5 rounded-2xl overflow-hidden transition-all duration-700 cursor-pointer hover:scale-[1.02] hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-2 border-primary/30 hover:border-primary/60 ${isPortrait ? 'aspect-[9/16]' : 'aspect-video'}`}
                    >
                        <div className="absolute inset-0 z-0">
                            <img 
                                src={state.referenceSheetUrl} 
                                className="w-full h-full object-cover transition-all duration-1000 opacity-100 group-hover:scale-105" 
                                alt="Global Style Anchor" 
                            />
                        </div>

                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/40 opacity-80 group-hover:opacity-100 transition-opacity duration-500 z-10"></div>

                        <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-20">
                            <div className="flex items-center gap-2 bg-primary/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-primary/30">
                                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{t('story.anchor_frame')}</span>
                            </div>
                        </div>

                        <div className="absolute bottom-6 left-6 right-6 z-20">
                            <p className="text-xs text-zinc-300 font-serif italic line-clamp-3 mb-3">
                                "{state.styleProfile?.visualStyle}"
                            </p>
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-mono text-primary uppercase tracking-[0.2em]">{t('story.click_to_edit')}</span>
                            </div>
                        </div>
                    </article>
                )}

                {scenes.map((scene, index) => {
                    const isGenerating = scene.status === 'generating' || generatingAssets.has(scene.id);
                    const isDone = scene.status === 'done' && !!scene.keyframeUrl;
                    const isError = scene.status === 'error';
                    const startTime = scenes.slice(0, index).reduce((acc, s) => acc + (s.estimatedDuration || 0), 0);
                    const formattedTime = new Date(startTime * 1000).toISOString().substr(14, 5);

                    return (
                        <article 
                            key={scene.id} 
                            onClick={() => onSceneClick(scene.id)}
                            className={`group relative bg-white/[0.02] rounded-2xl overflow-hidden transition-all duration-700 cursor-pointer hover:scale-[1.02] hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${isPortrait ? 'aspect-[9/16]' : 'aspect-video'}`}
                        >
                            <div className="absolute inset-0 z-0">
                                {scene.keyframeUrl || scene.assetUrl ? (
                                    <img 
                                        src={scene.keyframeUrl || scene.assetUrl} 
                                        className={`w-full h-full object-cover transition-all duration-1000 ${isGenerating ? 'opacity-30 blur-xl scale-110' : 'opacity-100 group-hover:scale-105'}`} 
                                        alt={`Scene ${scene.number}`} 
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900/50">
                                        <ImageIcon size={32} className="text-zinc-800" />
                                    </div>
                                )}
                            </div>

                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10"></div>

                            <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-20 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-[-10px] group-hover:translate-y-0">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl font-black text-white/20 font-display">{scene.number.toString().padStart(2, '0')}</span>
                                    <div className="h-4 w-px bg-white/10"></div>
                                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">{formattedTime}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isGenerating && <Loader2 size={12} className="text-amber-500 animate-spin" />}
                                    {isDone && <Check size={12} className="text-emerald-500" />}
                                    {isError && <AlertTriangle size={12} className="text-red-500" />}
                                </div>
                            </div>

                            <div className="absolute bottom-6 left-6 right-6 z-20 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-[10px] group-hover:translate-y-0">
                                <p className="text-xs text-zinc-200 font-medium leading-relaxed line-clamp-2 mb-3">
                                    {scene.narrative}
                                </p>
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em]">{scene.estimatedDuration}S DURATION</span>
                                    <div className="flex gap-2">
                                        <button className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                                            <Maximize2 size={14} className="text-white" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {isGenerating && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-md z-30">
                                    <Loader2 size={32} className="text-primary animate-spin mb-4" />
                                    <span className="text-[10px] text-primary font-mono uppercase tracking-[0.3em] animate-pulse">
                                        {scene.progressMessage || t('common.generating')}
                                    </span>
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>
        </div>
    );
};
