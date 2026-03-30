import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Loader2, RefreshCw, Edit2, Smile, Download, Check } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface ScenePreviewModalProps {
    sceneId: string | null;
    onClose: () => void;
    onNavigate: (directionOrId: 'next' | 'prev' | string) => void;
    onSavePrompt: (sceneId: string, newPrompt: string) => void;
}

export const ScenePreviewModal: React.FC<ScenePreviewModalProps> = ({ sceneId, onClose, onNavigate, onSavePrompt }) => {
    const { state, actions, generatingAssets } = useProject();
    const { t } = useLanguage();
    const [isEditing, setIsEditing] = useState(false);
    const [tempPrompt, setTempPrompt] = useState("");

    const scenes = state.scenes || [];
    const isPortrait = state.targetAspectRatio === "9:16";
    const activeScene = scenes.find(s => s.id === sceneId);

    useEffect(() => {
        if (activeScene) {
            setTempPrompt(activeScene.visualPrompt);
            setIsEditing(false);
        }
    }, [activeScene]);

    const handleDownload = (url: string, filename: string) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    if (!activeScene) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
            <button onClick={onClose} className="absolute top-6 right-8 text-zinc-400 hover:text-white bg-black/20 hover:bg-zinc-800/50 rounded-full p-2 transition-colors z-[110]"><X size={24} /></button>
            <div className="relative w-full h-full max-w-[1600px] flex flex-col items-center justify-center p-6 md:p-10">
                <div className="w-full flex items-center justify-between gap-6 h-full max-h-[90vh]">
                    <button onClick={() => onNavigate('prev')} className="group flex items-center justify-center w-14 h-14 rounded-full bg-zinc-800/30 hover:bg-zinc-700/50 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white transition-all backdrop-blur-md shrink-0 focus:outline-none"><ChevronLeft size={32} className="group-hover:-translate-x-0.5 transition-transform" /></button>
                    <div className="flex flex-col items-center w-full max-w-6xl h-full justify-center">
                        <div className="flex items-center gap-4 mb-4 w-full px-1">
                            <div className="flex items-center gap-2">
                                <span className="text-3xl font-bold text-white font-display">{activeScene.number.toString().padStart(2, '0')}</span>
                                <div className="h-6 w-px bg-zinc-700 mx-2"></div>
                                <span className="text-sm font-mono text-zinc-400 bg-zinc-800/50 px-2 py-1 rounded border border-zinc-700">{activeScene.estimatedDuration}s</span>
                            </div>
                            <div className="flex-1"><p className="text-lg font-medium text-zinc-100 font-display line-clamp-1">"{activeScene.narrative}"</p></div>
                            <div className="flex gap-2">
                                {generatingAssets.has(activeScene.id) ? <Badge variant="warning" pulsing>{t('common.generating')}</Badge> : activeScene.status === 'done' ? <Badge variant="success">{t('common.ready')}</Badge> : <Badge variant="neutral">{t('common.pending')}</Badge>}
                            </div>
                        </div>
                        <div className={`relative w-full ${isPortrait ? 'h-[80vh] aspect-[9/16]' : 'aspect-video'} rounded-lg overflow-hidden border border-zinc-700 shadow-2xl bg-black group flex items-center justify-center`}>
                            <img src={activeScene.keyframeUrl || activeScene.assetUrl} alt={`Scene ${activeScene.number}`} className={`w-full h-full object-contain transition-opacity duration-500 ${generatingAssets.has(activeScene.id) ? 'opacity-50 blur-sm' : 'opacity-100'}`} />
                            {generatingAssets.has(activeScene.id) && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                                    <Loader2 size={48} className="text-primary animate-spin mb-4" />
                                    <span className="text-lg font-bold text-white uppercase tracking-widest animate-pulse">{t('story.rendering_hifi')}</span>
                                </div>
                            )}
                        </div>
                        <div className="mt-6 flex items-center justify-center gap-3">
                            <Button onClick={() => actions.handleGenerateAsset(activeScene.id, 'image')} disabled={state.isProcessing} variant="primary" icon={<RefreshCw size={16} />} className="rounded-full px-6 py-2.5 shadow-lg shadow-primary/20 hover:scale-105">{t('story.regen_scene')}</Button>
                            <div className="w-px h-8 bg-zinc-700 mx-2"></div>
                            <Button onClick={() => setIsEditing(!isEditing)} variant="secondary" icon={<Edit2 size={16} />} className="rounded-full px-5 py-2.5 bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white">{isEditing ? t('story.cancel_edit') : t('story.edit_prompt')}</Button>
                            <Button onClick={() => actions.handleGenerateAsset(activeScene.id, 'image')} variant="secondary" icon={<Smile size={16} />} disabled={state.isProcessing} className="rounded-full px-5 py-2.5 bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white">{t('story.fix_face')}</Button>
                            {activeScene.keyframeUrl && (
                                <Button onClick={() => handleDownload(activeScene.keyframeUrl!, `scene-${activeScene.number}.png`)} variant="secondary" icon={<Download size={16} />} className="rounded-full px-5 py-2.5 bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white">{t('common.download')}</Button>
                            )}
                        </div>
                        <div className="mt-6 w-full max-w-4xl text-center">
                            {isEditing ? (
                                <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2">
                                    <textarea value={tempPrompt} onChange={(e) => setTempPrompt(e.target.value)} className="w-full bg-black/50 border border-primary/50 rounded-lg p-3 text-sm text-zinc-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none h-24 font-mono leading-relaxed" autoFocus />
                                    <div className="flex justify-center gap-2">
                                        <Button size="sm" variant="primary" icon={<Check size={14}/>} onClick={() => onSavePrompt(activeScene.id, tempPrompt)}>{t('story.save_regen')}</Button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-zinc-500 font-mono leading-relaxed max-w-3xl mx-auto cursor-pointer hover:text-zinc-400 transition-colors" onClick={() => setIsEditing(true)} title={t('story.click_to_edit')}>
                                    <span className="uppercase text-xs font-bold tracking-wider text-zinc-600 mr-2 border border-zinc-800 px-1.5 py-0.5 rounded bg-black/30">{t('story.prompt')}</span>
                                    {activeScene.visualPrompt}
                                </p>
                            )}
                        </div>
                    </div>
                    <button onClick={() => onNavigate('next')} className="group flex items-center justify-center w-14 h-14 rounded-full bg-zinc-800/30 hover:bg-zinc-700/50 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white transition-all backdrop-blur-md shrink-0 focus:outline-none"><ChevronRight size={32} className="group-hover:translate-x-0.5 transition-transform" /></button>
                </div>
                <div className="absolute bottom-6 flex gap-1.5 opacity-50 hover:opacity-100 transition-opacity">
                    {scenes.map((s) => (
                        <div key={s.id} onClick={() => onNavigate(s.id)} className={`w-2 h-2 rounded-full cursor-pointer transition-all ${s.id === sceneId ? 'bg-primary scale-125 shadow-glow' : 'bg-zinc-600 hover:bg-zinc-400'}`} />
                    ))}
                </div>
            </div>
        </div>
    );
};
