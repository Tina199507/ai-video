import React, { useState, useCallback } from 'react';
import { Badge } from '../ui/Badge';
import { useLanguage } from '../../context/LanguageContext';
import { Upload, User } from 'lucide-react';

interface VisualAnchorProps {
    analyzed: boolean;
    analyzing: boolean;
    referenceVideoUrl: string | null;
    previewImage: string;
    onBrowse: () => void;
    onDropFile?: (file: File) => void;
    progressMessage?: string;
    faceRatio?: number;
}

export const VisualAnchor: React.FC<VisualAnchorProps> = ({
    analyzed,
    analyzing,
    referenceVideoUrl,
    previewImage,
    onBrowse,
    onDropFile,
    progressMessage,
    faceRatio
}) => {
    const { t } = useLanguage();
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (onDropFile && e.dataTransfer.files && e.dataTransfer.files[0]) {
            onDropFile(e.dataTransfer.files[0]);
        }
    }, [onDropFile]);

    return (
        <div className="p-8 flex-shrink-0">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">{t('style.source_material')}</h2>
                <div className="flex gap-2">
                    {faceRatio !== undefined && (
                        <Badge variant="neutral" className="bg-zinc-800/50 text-zinc-400 border-zinc-700/50 flex gap-1 items-center">
                            <User size={10} />
                            {Math.round(faceRatio * 100)}%
                        </Badge>
                    )}
                    {analyzed && <Badge variant="success" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">{t('style.analyzed')}</Badge>}
                </div>
            </div>

            {(analyzed || analyzing) ? (
                <div className="w-full aspect-video bg-black rounded-xl overflow-hidden relative group shadow-[0_0_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/5">
                    {referenceVideoUrl && analyzed ? (
                        <video src={referenceVideoUrl} controls className="w-full h-full object-contain" />
                    ) : (
                        <img src={previewImage} alt="Preview" className={`w-full h-full object-cover transition-all duration-1000 ${analyzed ? 'opacity-100 scale-105' : 'opacity-40 grayscale'}`} />
                    )}
                    
                    {/* Background Glow */}
                    {analyzed && (
                        <div className="absolute -inset-4 bg-emerald-500/5 blur-3xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
                    )}

                    {analyzing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md z-10">
                            <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-primary font-mono text-[10px] uppercase tracking-widest animate-pulse text-center px-4">
                                {progressMessage || t('style.analyzing')}
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div 
                    onClick={onBrowse}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`w-full aspect-video rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-all group border border-dashed ${
                        isDragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-800 hover:border-zinc-600 hover:bg-white/[0.04]'
                    }`}
                >
                    <div className={`w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center group-hover:scale-110 transition-transform border border-white/5 ${isDragging ? 'scale-110 border-emerald-500/50' : ''}`}>
                        {/* Icon removed as per user request */}
                    </div>
                    <div className="text-center">
                        <span className={`text-[10px] font-mono uppercase tracking-widest block mb-1 ${isDragging ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                            {isDragging ? t('style.drag_text') : t('style.upload_assets')}
                        </span>
                        <span className="text-[9px] text-zinc-600 hidden group-hover:block">{t('style.or_click')}</span>
                    </div>
                </div>
            )}
        </div>
    );
};
