import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../ui/Button';

interface TranscriptModalProps {
    isOpen: boolean;
    onClose: () => void;
    transcript: string;
    onSave: (newTranscript: string) => void;
}

export const TranscriptModal: React.FC<TranscriptModalProps> = ({ isOpen, onClose, transcript, onSave }) => {
    const { t } = useLanguage();
    const [value, setValue] = useState(transcript);

    useEffect(() => {
        setValue(transcript);
    }, [transcript]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-3xl bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl flex flex-col max-h-[85vh]">
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <h3 className="text-lg font-display text-white tracking-wide">{t('style.edit_transcript')}</h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="flex-1 p-6 overflow-hidden flex flex-col gap-4">
                    <div className="text-xs text-zinc-400 font-mono leading-relaxed bg-blue-500/5 border border-blue-500/10 p-3 rounded">
                        {t('style.transcript_edit_hint')}
                    </div>
                    <textarea 
                        className="flex-1 w-full bg-zinc-900/50 border border-white/5 rounded-lg p-4 text-sm font-mono text-zinc-300 focus:outline-none focus:border-emerald-500/50 resize-none custom-scrollbar"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={t('style.transcript_placeholder')}
                    />
                </div>

                <div className="p-6 border-t border-white/5 flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button 
                        variant="primary" 
                        onClick={() => {
                            onSave(value);
                            onClose();
                        }}
                        icon={<Save size={16} />}
                    >
                        {t('common.save')}
                    </Button>
                </div>
            </div>
        </div>
    );
};
