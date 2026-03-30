import React from 'react';
import { Play, Film, Image as ImageIcon, Mic, Download, Loader2, CheckCircle2, AlertTriangle, Activity } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Scene } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface AssetRowProps {
    scene: Scene;
    generationMode: 'video' | 'image';
    playingAudioId: string | null;
    isProcessing: boolean;
    onOpenPreview: (id: string) => void;
    onPlayAudio: (url: string, id: string) => void;
    onGenerateAsset: (id: string, type: 'video' | 'image') => void;
    onGenerateSpeech: (id: string) => void;
}

export const AssetRow: React.FC<AssetRowProps> = ({
    scene,
    generationMode,
    playingAudioId,
    isProcessing,
    onOpenPreview,
    onPlayAudio,
    onGenerateAsset,
    onGenerateSpeech
}) => {
    const { t } = useLanguage();

    const isVisualGenerating = scene.status === 'generating';
    const isAudioGenerating = false; // Add audio generating state if available in the future

    return (
        <div className="flex gap-4 group relative">
            {/* Timecode / Scene Number */}
            <div className="w-16 shrink-0 flex flex-col items-end pt-2 pr-4 border-r border-white/10">
                <span className="text-xs font-mono text-zinc-500">{scene.number.toString().padStart(2, '0')}</span>
                <span className="text-[9px] font-mono text-zinc-700 mt-1">{scene.estimatedDuration}s</span>
            </div>

            {/* Tracks Container */}
            <div className="flex-1 flex flex-col gap-1 py-1">
                
                {/* Visual Track */}
                <div className={`relative h-20 rounded-md overflow-hidden flex items-center border ${scene.assetUrl ? 'bg-indigo-900/20 border-indigo-500/30' : 'bg-zinc-900/50 border-dashed border-zinc-800'}`}>
                    {/* Status Indicator */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 flex flex-col">
                        <div className={`flex-1 ${scene.assetUrl ? 'bg-indigo-500' : isVisualGenerating ? 'bg-amber-500 animate-pulse' : 'bg-zinc-700'}`}></div>
                    </div>

                    <div className="w-32 h-full shrink-0 bg-black relative cursor-pointer group/img" onClick={() => onOpenPreview(scene.id)}>
                        {scene.assetUrl ? (
                            <>
                                {scene.assetType === 'video' ? (
                                    <video src={scene.assetUrl} className="w-full h-full object-cover opacity-80 group-hover/img:opacity-100 transition-opacity" muted loop onMouseOver={e => e.currentTarget.play()} onMouseOut={e => e.currentTarget.pause()} />
                                ) : (
                                    <img src={scene.keyframeUrl || scene.assetUrl} className="w-full h-full object-cover opacity-80 group-hover/img:opacity-100 transition-opacity" alt="" />
                                )}
                            </>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                {isVisualGenerating ? <Loader2 size={14} className="text-amber-500 animate-spin" /> : <ImageIcon size={14} className="text-zinc-700" />}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 px-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Film size={12} className={scene.assetUrl ? 'text-indigo-400' : 'text-zinc-600'} />
                            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider truncate max-w-[300px]">
                                {scene.assetUrl ? `${t('editor.visual_ready')} [${scene.assetType?.toUpperCase()}]` : t('editor.visual_pending')}
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {(!scene.assetUrl || scene.assetType !== generationMode) && (
                                <button 
                                    onClick={() => onGenerateAsset(scene.id, generationMode)} 
                                    disabled={isProcessing} 
                                    className="px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-[9px] font-bold uppercase tracking-widest rounded border border-indigo-500/20 transition-colors"
                                >
                                    {isVisualGenerating ? t('common.generating') : t('editor.generate_visual')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Audio Track */}
                <div className={`relative h-12 rounded-md overflow-hidden flex items-center border ${scene.audioUrl ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-zinc-900/50 border-dashed border-zinc-800'}`}>
                    {/* Status Indicator */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 flex flex-col">
                        <div className={`flex-1 ${scene.audioUrl ? 'bg-emerald-500' : isAudioGenerating ? 'bg-amber-500 animate-pulse' : 'bg-zinc-700'}`}></div>
                    </div>

                    <div className="w-32 h-full shrink-0 bg-black/50 flex items-center justify-center border-r border-white/5">
                        {scene.audioUrl ? (
                            <button 
                                onClick={() => onPlayAudio(scene.audioUrl!, scene.id)}
                                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${playingAudioId === scene.id ? 'bg-emerald-500 text-black' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40'}`}
                            >
                                {playingAudioId === scene.id ? <div className="w-2 h-2 bg-black rounded-sm" /> : <Play size={10} fill="currentColor" className="ml-0.5" />}
                            </button>
                        ) : (
                            <Mic size={14} className="text-zinc-700" />
                        )}
                    </div>

                    <div className="flex-1 px-4 flex items-center justify-between">
                        <div className="flex items-center gap-3 w-full">
                            {scene.audioUrl ? (
                                <Activity size={12} className="text-emerald-400" />
                            ) : (
                                <Mic size={12} className="text-zinc-600" />
                            )}
                            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider truncate flex-1">
                                {scene.audioUrl ? t('editor.voiceover_ready') : `"${scene.narrative}"`}
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!scene.audioUrl && (
                                <button 
                                    onClick={() => onGenerateSpeech(scene.id)} 
                                    disabled={isProcessing} 
                                    className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-widest rounded border border-emerald-500/20 transition-colors"
                                >
                                    {t('editor.generate_audio')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
