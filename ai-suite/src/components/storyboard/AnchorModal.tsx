import React, { useState, useRef } from 'react';
import { Lock, RefreshCw, Edit2, Check, Upload, Lightbulb, Palette, Users, Cpu, Sparkles, Info, Film, ImageIcon } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useLanguage } from '../../context/LanguageContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface AnchorModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AnchorModal: React.FC<AnchorModalProps> = ({ isOpen, onClose }) => {
    const { state, actions } = useProject();
    const { t } = useLanguage();
    const [isEditing, setIsEditing] = useState(false);
    const [tempPrompt, setTempPrompt] = useState(state.styleProfile?.visualStyle || "");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSavePrompt = () => {
        if (tempPrompt.trim()) {
            actions.handleUpdateStyleProfile({ visualStyle: tempPrompt });
            setIsEditing(false);
        }
    };

    const handleRegenerate = () => {
        actions.handleRegenerateReference();
        onClose();
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            actions.handleUploadAnchor(file);
        }
    };

    return (
        <>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            <Modal 
                isOpen={isOpen} 
                onClose={onClose} 
                title={<span className="flex items-center gap-2"><Lock className="text-primary w-5 h-5" />{t('story.confirm_anchor')}</span>} 
                maxWidth="max-w-5xl"
                footer={
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                            <Button variant="secondary" onClick={handleUploadClick} icon={<Upload className="w-4 h-4" />}>{t('story.upload_image')}</Button>
                            <Button variant="secondary" onClick={handleRegenerate} icon={<RefreshCw className="w-4 h-4" />}>{t('story.regenerate')}</Button>
                            <Button variant="secondary" onClick={() => setIsEditing(!isEditing)} icon={<Edit2 className="w-4 h-4" />}>{isEditing ? t('story.cancel_edit') : t('story.edit_prompt')}</Button>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
                            <Button variant="primary" onClick={() => { onClose(); actions.handleGenerateAllAssets(); }} icon={<ImageIcon className="w-4 h-4"/>}>{t('story.generate_all')}</Button>
                        </div>
                    </div>
                }
            >
                <div className="flex flex-col md:flex-row h-auto md:h-[500px]">
                    <div className="w-full md:w-5/12 bg-black/40 p-6 flex flex-col justify-center border-r border-white/10 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-cover bg-center opacity-30 blur-xl scale-110" style={{ backgroundImage: `url(${state.referenceSheetUrl})` }}></div>
                        <div className="relative z-10 flex flex-col items-center">
                            <div className="w-full aspect-video rounded-lg overflow-hidden border-2 border-primary/30 shadow-2xl shadow-black/50 relative group-hover:border-primary/60 transition-colors bg-black">
                                <img src={state.referenceSheetUrl || ''} className="w-full h-full object-contain" alt="Anchor" />
                                <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded text-[10px] font-bold text-white border border-white/10 uppercase tracking-wider">{t('story.anchor_frame')}</div>
                            </div>
                            <div className="mt-4 flex items-center gap-2 text-primary font-medium text-xs uppercase tracking-widest"><Film className="w-4 h-4" /><span>{state.styleProfile?.tone || t('story.default_tone')} {t('story.style_style')}</span></div>
                        </div>
                    </div>
                    <div className="w-full md:w-7/12 p-8 flex flex-col relative bg-gradient-to-br from-transparent to-zinc-900/50 overflow-y-auto custom-scrollbar">
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-2"><Lightbulb className="text-zinc-500 w-4 h-4" /><span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('story.visual_directive')}</span></div>
                            {isEditing ? (
                                <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                                    <textarea value={tempPrompt} onChange={(e) => setTempPrompt(e.target.value)} className="w-full bg-black/50 border border-primary/50 rounded p-3 text-sm text-zinc-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none h-32 font-mono leading-relaxed" autoFocus />
                                    <div className="flex justify-end"><button onClick={handleSavePrompt} className="text-xs bg-primary text-white px-3 py-1.5 rounded font-bold hover:bg-primary-dark transition-colors flex items-center gap-1"><Check size={12} /> {t('story.save_changes')}</button></div>
                                </div>
                            ) : (
                                <div onClick={() => setIsEditing(true)} className="pl-4 border-l-2 border-zinc-700 hover:border-primary cursor-text transition-colors py-1 group/text">
                                    <p className="text-sm text-zinc-300 font-serif italic leading-relaxed group-hover/text:text-white">"{state.styleProfile?.visualStyle}"</p>
                                    <span className="text-[9px] text-zinc-600 mt-2 block opacity-0 group-hover/text:opacity-100 transition-opacity">{t('story.click_to_edit')}</span>
                                </div>
                            )}
                        </div>
                        <div className="space-y-6 flex-grow">
                            <div className="group"><div className="flex items-center gap-2 mb-2"><Palette className="text-zinc-500 w-4 h-4" /><span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('story.color_palette')}</span></div><div className="pl-6 flex items-center gap-4 flex-wrap">{state.styleProfile?.colorPalette.map((color, i) => (<div key={i} className="flex items-center gap-2"><div className="w-6 h-6 rounded-full border border-zinc-600 shadow-sm" style={{ backgroundColor: color }}></div><span className="text-xs text-zinc-400 font-mono">{color}</span></div>))}</div></div>
                            <div className="group"><div className="flex items-center gap-2 mb-2"><Users className="text-zinc-500 w-4 h-4" /><span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('story.consistency_lock')}</span></div><div className="pl-6"><span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/30 rounded text-xs text-green-400 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>{t('story.active')}</span></div></div>
                            <div className="group"><div className="flex items-center gap-2 mb-2"><Cpu className="text-zinc-500 w-4 h-4" /><span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('story.ai_model')}</span></div><div className="pl-6"><div className="flex items-center gap-2 text-zinc-300 bg-zinc-800/50 px-3 py-1.5 rounded border border-zinc-700/50 w-max"><Sparkles className="text-primary w-3 h-3" /><span className="text-xs font-mono">{state.modelConfig.visualModel}</span></div></div></div>
                        </div>
                        <div className="mt-auto pt-6 border-t border-white/5">
                            <div className="flex items-center gap-2 bg-blue-900/20 p-3 rounded border border-blue-900/30"><Info className="text-blue-400 w-4 h-4 flex-shrink-0" /><p className="text-[10px] text-blue-200 leading-tight">{t('story.lock_warning')}</p></div>
                        </div>
                    </div>
                </div>
            </Modal>
        </>
    );
};
