import React, { useState } from 'react';
import { Binary, CheckCircle2, Sparkles, ArrowRight, FileJson, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { StyleDNAModal } from '../script/StyleDNAModal';
import { Button } from '../ui/Button';

interface AnalysisViewProps {
    styleProfile: any;
    onProceedToScript?: () => void;
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({ styleProfile, onProceedToScript }) => {
    const { t } = useLanguage();
    const [isDNAModalOpen, setIsDNAModalOpen] = useState(false);

    if (!styleProfile) {
        return (
            <div className="h-full flex flex-col items-center justify-center opacity-20 gap-8 min-h-[600px]">
                <div className="relative">
                    <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full"></div>
                    <Binary size={80} className="text-emerald-500 relative z-10 animate-pulse" />
                </div>
                <div className="text-center space-y-3">
                    <p className="text-2xl font-light text-zinc-300 uppercase tracking-[0.3em]">{t('style.select_source')}</p>
                    <p className="text-sm font-mono text-zinc-600 max-w-md mx-auto leading-relaxed">{t('style.upload_desc')}</p>
                </div>
            </div>
        );
    }

    const visual = styleProfile.track_b_visual || {};
    const script = styleProfile.track_a_script || {};
    const audio = styleProfile.track_c_audio || {};
    const nodeConfidence = styleProfile.nodeConfidence || {};

    // Calculate overall confidence score
    const confidenceValues = Object.values(nodeConfidence);
    const confidentCount = confidenceValues.filter(v => v === 'confident').length;
    const totalConfidenceItems = confidenceValues.length;
    const confidenceScore = totalConfidenceItems > 0 ? Math.round((confidentCount / totalConfidenceItems) * 100) : null;
    const isLowConfidence = confidenceScore !== null && confidenceScore < 60;

    // Extract core tags for quick verification
    const coreTags = [
        visual.base_medium,
        script.hook_strategy,
        script.emotional_tone_arc?.split('→')[0],
        audio.genre
    ].filter(Boolean);

    return (
        <div className="h-full flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-8 duration-700">
            
            {/* Success Card */}
            <div className="relative group">
                <div className="absolute inset-0 bg-emerald-500/20 blur-[100px] rounded-full opacity-50 group-hover:opacity-70 transition-opacity duration-1000"></div>
                
                <div className="relative bg-black/40 backdrop-blur-xl border border-white/10 p-12 rounded-[3rem] text-center max-w-2xl w-full shadow-2xl">
                    
                    {/* Icon */}
                    <div className="mb-8 flex justify-center">
                        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                        </div>
                    </div>

                    {/* Title */}
                    <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">
                        {t('style.analysis_complete')}
                    </h2>
                    <p className="text-zinc-400 text-lg mb-10 font-light">
                        {t('style.ready_to_create')}
                    </p>

                    {/* Core Tags */}
                    <div className="flex flex-wrap justify-center gap-3 mb-12">
                        {coreTags.map((tag: string, i) => (
                            <span key={i} className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm text-zinc-300 font-medium">
                                {tag}
                            </span>
                        ))}
                    </div>

                    {/* Confidence Warning (if low) */}
                    {isLowConfidence && (
                        <div className="mb-8 flex items-center justify-center gap-2 text-amber-400/80 bg-amber-500/5 py-2 px-4 rounded-lg border border-amber-500/10">
                            <AlertTriangle size={16} />
                            <span className="text-xs">
                                Analysis confidence is low ({confidenceScore}%). Results might need manual tuning.
                            </span>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-col items-center gap-4">
                        <Button 
                            onClick={onProceedToScript}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-12 py-6 rounded-2xl text-lg font-semibold shadow-[0_0_40px_rgba(16,185,129,0.3)] hover:shadow-[0_0_60px_rgba(16,185,129,0.5)] transition-all duration-300 w-full md:w-auto"
                            icon={<ArrowRight className="w-5 h-5" />}
                        >
                            {t('style.start_applying')}
                        </Button>

                        <button
                            onClick={() => setIsDNAModalOpen(true)}
                            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mt-4 group/raw"
                        >
                            <FileJson size={14} className="group-hover/raw:text-indigo-400 transition-colors" />
                            <span>View Raw Style DNA</span>
                        </button>
                    </div>
                </div>
            </div>

            <StyleDNAModal 
                isOpen={isDNAModalOpen} 
                onClose={() => setIsDNAModalOpen(false)} 
                styleProfile={styleProfile} 
            />
        </div>
    );
};
