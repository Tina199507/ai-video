import React, { useState } from 'react';
import { Type, Clock, X, Check, Volume2, Edit3, Sparkles, Info } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useProject } from '../../context/ProjectContext';
import { ResearchData } from '../../types';

interface PendingDiff {
    index: number;
    original: string;
    new: string;
}

interface SceneCardProps {
    index: number;
    content: string;
    isActive: boolean;
    isPendingDiff: boolean;
    pendingDiff: PendingDiff | null;
    onFocus: (index: number) => void;
    onBlur: () => void;
    onChange: (index: number, newContent: string) => void;
    onDiscard: () => void;
    onAccept: () => void;
    onTTS: (text: string) => void;
    setRef: (el: HTMLDivElement | null) => void;
    onVerifyClaim?: (index: number, claim: string) => void;
    researchData: ResearchData | null;
}

export const SceneCard: React.FC<SceneCardProps> = ({
    index,
    content,
    isActive,
    isPendingDiff,
    pendingDiff,
    onFocus,
    onBlur,
    onChange,
    onDiscard,
    onAccept,
    onTTS,
    setRef,
    onVerifyClaim,
    researchData
}) => {
    const { t } = useLanguage();
    const { state } = useProject();
    const [hoveredFact, setHoveredFact] = useState<string | null>(null);

    const lines = content.split('\n');
    const headerPattern = /^(?:#{0,6}\s*)?(?:[\*\_\[【])?(?:(?:Scene|Sequence|Section|Beat)\s+(?:\d+|[IVX]+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)|(?:场景|幕|场次)\s*(?:\d+|[一二三四五六七八九十百]+)|(?:第\s*[0-9一二三四五六七八九十百]+\s*[场幕]))(?:[:\uff1a\.\]】])?.*$/i;
    const headerMatch = lines[0].match(headerPattern);
    const displayHeader = (headerMatch ? headerMatch[0] : `## Scene ${index + 1}`).replace(/^[#*【\[]+/, '').replace(/[*:\uff1a\]】]+$/, '').trim();
    const body = headerMatch ? lines.slice(1).join('\n').trim() : content;

    // Word Count & Duration Logic - Handles CJK characters
    // Strip headers AND Fact tags for accurate count
    const plainTextBody = body.replace(/##.*\n/, '').replace(/\[Fact-\d+\]/g, '').trim(); 
    const englishWords = (plainTextBody.match(/[\w'-]+/g) || []).length;
    const cjkChars = (plainTextBody.match(/[\u4e00-\u9fa5]/g) || []).length;
    const wordCount = englishWords + cjkChars;

    const targetWPM = state.generationPlan?.targetWPM || 150;
    const duration = (wordCount / targetWPM) * 60;
    const targetDuration = state.generationPlan?.targetSceneDuration || 15;
    const durationRatio = duration / targetDuration;
    const wordProgress = Math.min(wordCount / (targetDuration * (targetWPM / 60)), 1.5);
    
    let durationColor = 'text-zinc-500';
    let durationBg = 'bg-zinc-500/10 border-zinc-500/20';
    let ringColor = 'stroke-zinc-500';
    
    if (durationRatio > 1.5 || durationRatio < 0.5) {
        durationColor = 'text-red-400';
        durationBg = 'bg-red-500/10 border-red-500/20';
        ringColor = 'stroke-red-400';
    } else if (durationRatio > 1.2 || durationRatio < 0.8) {
        durationColor = 'text-yellow-400';
        durationBg = 'bg-yellow-500/10 border-yellow-500/20';
        ringColor = 'stroke-yellow-400';
    } else {
        durationColor = 'text-emerald-400';
        durationBg = 'bg-emerald-500/10 border-emerald-500/20';
        ringColor = 'stroke-emerald-400';
    }

    const handleTTSClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Strip [Fact-X] tags before TTS
        const cleanText = body.replace(/\[Fact-\d+\]/g, '');
        onTTS(cleanText);
    };

    // Helper to render content with Fact tags and Verification tags
    const renderContentWithTags = (text: string, isOverlay: boolean) => {
        // Split by both tag types
        const parts = text.split(/(\[NEEDS VERIFICATION\]|\[Fact-\d+\])/g);
        
        return parts.map((part, i) => {
            if (part === '[NEEDS VERIFICATION]') {
                if (isOverlay) {
                    return (
                        <span key={i} className="relative inline-block align-middle mx-1">
                            <span className="opacity-0">{part}</span>
                            <span 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const newContent = content.replace('[NEEDS VERIFICATION]', ''); // Simple replace for now, ideally index-aware
                                    if (onVerifyClaim) onVerifyClaim(index, newContent);
                                    else onChange(index, newContent);
                                }}
                                className="absolute inset-0 flex items-center justify-center cursor-pointer pointer-events-auto z-20"
                            >
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500 text-black rounded-full text-[10px] font-bold tracking-wider shadow-lg hover:scale-105 transition-transform select-none whitespace-nowrap">
                                    CONFIRM
                                    <Check size={10} strokeWidth={3} />
                                </span>
                            </span>
                        </span>
                    );
                } else {
                    return (
                        <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-1 align-middle bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-bold text-amber-500/70 tracking-wider select-none">
                            VERIFY
                        </span>
                    );
                }
            } else if (part.match(/^\[Fact-(\d+)\]$/)) {
                const factIndex = parseInt(part.match(/\d+/)![0]) - 1;
                const factContent = researchData?.facts[factIndex]?.content;
                
                if (isOverlay) {
                    return (
                        <span key={i} className="relative inline-block align-top mx-0.5" onMouseEnter={() => setHoveredFact(part)} onMouseLeave={() => setHoveredFact(null)}>
                            <span className="opacity-0 text-[0px]">{part}</span>
                            <span className="absolute left-0 top-1 flex items-center justify-center pointer-events-auto z-20">
                                <span className="inline-flex items-center justify-center w-4 h-4 bg-blue-500/20 border border-blue-500/40 text-blue-400 rounded-full text-[9px] font-bold cursor-help hover:bg-blue-500 hover:text-white transition-colors select-none">
                                    {factIndex + 1}
                                </span>
                                {hoveredFact === part && factContent && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-zinc-900 border border-white/10 rounded-lg shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200">
                                        <div className="text-[10px] font-bold text-blue-400 mb-1 uppercase tracking-wider">Fact {factIndex + 1} Source</div>
                                        <div className="text-xs text-zinc-300 font-serif leading-relaxed">{factContent}</div>
                                    </div>
                                )}
                            </span>
                        </span>
                    );
                } else {
                    // In read-only mode, show just the number
                    return (
                        <span key={i} className="inline-flex items-center justify-center w-4 h-4 mx-0.5 align-top bg-blue-500/10 border border-blue-500/20 text-blue-500/70 rounded-full text-[9px] font-bold select-none" title={factContent}>
                            {factIndex + 1}
                        </span>
                    );
                }
            }
            return <span key={i}>{part}</span>;
        });
    };

    return (
        <div 
            ref={setRef} 
            data-scene-index={index} 
            onClick={() => onFocus(index)} 
            className={`group transition-all duration-1000 relative ${isActive ? 'z-10' : 'opacity-20 hover:opacity-100 grayscale-[0.8] hover:grayscale-0'} ${isPendingDiff ? 'bg-white/[0.02] backdrop-blur-xl rounded-3xl p-12 -mx-12' : ''}`}
        >
            {/* Scene Header HUD */}
            <div className="flex items-center justify-between mb-8 select-none">
                <div className="flex items-center gap-8">
                    <div className="flex flex-col">
                        <span className={`text-[10px] font-black uppercase tracking-[0.4em] transition-colors duration-700 ${isActive ? 'text-blue-500' : 'text-zinc-800 group-hover:text-zinc-600'}`}>
                            {displayHeader}
                        </span>
                        <div className={`h-0.5 w-4 mt-2 transition-all duration-700 ${isActive ? 'bg-blue-500 w-12' : 'bg-zinc-900 group-hover:bg-zinc-700'}`}></div>
                    </div>

                    {/* Meta HUD */}
                    <div className="flex items-center gap-6 opacity-0 group-hover:opacity-100 transition-all duration-700 translate-x-[-10px] group-hover:translate-x-0">
                        <div className={`flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest ${durationColor}`}>
                            <Type size={10} className="opacity-50" />
                            <span>{wordCount} WORDS</span>
                        </div>
                        <div className={`flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest ${durationColor}`}>
                            <Clock size={10} className="opacity-50" />
                            <span>{duration.toFixed(1)}S</span>
                        </div>
                    </div>
                </div>

                {/* Actions HUD */}
                <div className="flex items-center gap-4">
                    {isPendingDiff ? (
                        <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4">
                            <button onClick={(e) => { e.stopPropagation(); onDiscard(); }} className="text-[10px] font-bold text-red-500/50 hover:text-red-500 uppercase tracking-widest transition-colors">{t('script.discard')}</button>
                            <button onClick={(e) => { e.stopPropagation(); onAccept(); }} className="px-4 py-1.5 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-zinc-200 transition-all hover:scale-105 active:scale-95">{t('script.accept')}</button>
                        </div>
                    ) : (
                        <div className={`flex items-center gap-3 opacity-0 transition-all duration-700 translate-x-4 group-hover:translate-x-0 ${isActive ? 'opacity-100' : 'group-hover:opacity-100'}`}>
                            <button onClick={handleTTSClick} className="p-2 hover:bg-white/5 rounded-full text-zinc-600 hover:text-white transition-colors" title={t('script.tts_preview')}><Volume2 size={14} /></button>
                            <button className="p-2 hover:bg-white/5 rounded-full text-zinc-600 hover:text-white transition-colors"><Edit3 size={14} /></button>
                            <button className="p-2 hover:bg-white/5 rounded-full text-zinc-600 hover:text-white transition-colors"><Sparkles size={14} /></button>
                        </div>
                    )}

                    {/* Progress HUD */}
                    <div className="w-10 h-10 relative">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                            <circle className="stroke-white/[0.03] fill-none" strokeWidth="2" cx="18" cy="18" r="16" />
                            <circle
                                className={`fill-none transition-all duration-1000 ${ringColor}`}
                                strokeWidth="2"
                                strokeDasharray={`${Math.min(wordProgress, 1) * 100}, 100`}
                                strokeLinecap="round"
                                cx="18"
                                cy="18"
                                r="16"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className={`text-[7px] font-mono font-bold ${durationColor}`}>{Math.round(wordProgress * 100)}%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="relative">
                {isPendingDiff && pendingDiff ? (
                    <div className="grid grid-cols-2 gap-16 py-8">
                        <div className="space-y-6 opacity-40">
                            <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.3em]">{t('script.old_version')}</div>
                            <div className="text-zinc-500 line-through text-xl font-serif leading-relaxed italic">{pendingDiff.original.split('\n').slice(1).join('\n').trim()}</div>
                        </div>
                        <div className="space-y-6">
                            <div className="text-[9px] font-bold text-blue-500 uppercase tracking-[0.3em] flex items-center gap-2"><Sparkles size={10} /> {t('script.ai_enhanced')}</div>
                            <div className="text-zinc-200 text-xl font-serif leading-relaxed">{pendingDiff.new.split('\n').slice(1).join('\n').trim()}</div>
                        </div>
                    </div>
                ) : isActive ? (
                    <div className="relative">
                        <div className="absolute -left-12 top-0 bottom-0 w-0.5 bg-blue-500/20 rounded-full"></div>
                        
                        {/* Interactive Verification & Fact Layer */}
                        <div className="absolute inset-0 pointer-events-none z-10 whitespace-pre-wrap text-3xl font-serif leading-[1.6] p-0 text-transparent">
                            {renderContentWithTags(content, true)}
                        </div>

                        <textarea 
                            value={content} 
                            onChange={(e) => onChange(index, e.target.value)} 
                            onBlur={onBlur}
                            className="w-full bg-transparent border-none text-zinc-100 text-3xl font-serif leading-[1.6] p-0 focus:ring-0 focus:outline-none resize-none overflow-hidden placeholder-zinc-900 selection:bg-blue-500/30 relative z-0" 
                            rows={Math.max(4, content.split('\n').length)} 
                            autoFocus 
                            spellCheck={false} 
                            placeholder="..."
                        />
                    </div>
                ) : (
                    <div className="text-zinc-500 text-3xl font-serif leading-[1.6] whitespace-pre-wrap transition-all duration-1000 group-hover:text-zinc-300">
                        {renderContentWithTags(body, false) || <span className="text-zinc-900 italic">...</span>}
                    </div>
                )}
            </div>

            {/* Active Glow Effect */}
            {isActive && (
                <div className="absolute -inset-x-12 -inset-y-8 bg-blue-500/[0.02] blur-3xl rounded-[100px] -z-10 pointer-events-none"></div>
            )}
        </div>
    );
};

