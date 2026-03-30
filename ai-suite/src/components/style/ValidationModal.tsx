import React from 'react';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../ui/Button';
import { ValidationReport } from '../../services/utils/styleProfileQuality';

interface ValidationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onProceed: () => void;
    report: ValidationReport;
}

export const ValidationModal: React.FC<ValidationModalProps> = ({ isOpen, onClose, onProceed, report }) => {
    const { t } = useLanguage();

    if (!isOpen) return null;

    const errorCount = report.issues.filter(i => i.level === 'error').length;
    const warnCount = report.issues.filter(i => i.level === 'warn').length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className={`w-5 h-5 ${errorCount > 0 ? 'text-red-500' : 'text-yellow-500'}`} />
                        <h3 className="text-lg font-display text-white tracking-wide">{t('style.validation_issues')}</h3>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <p className="text-sm text-zinc-400">
                        {t('style.validation_desc', { errorCount, warnCount } as any) || `Found ${errorCount} errors and ${warnCount} warnings.`}
                    </p>
                    
                    <div className="space-y-2">
                        {report.issues.map((issue, i) => (
                            <div key={i} className={`p-3 rounded-lg border flex gap-3 ${
                                issue.level === 'error' 
                                    ? 'bg-red-500/5 border-red-500/10' 
                                    : 'bg-yellow-500/5 border-yellow-500/10'
                            }`}>
                                <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                                    issue.level === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                                }`} />
                                <div className="space-y-1">
                                    <span className={`text-xs font-mono uppercase tracking-wider ${
                                        issue.level === 'error' ? 'text-red-400' : 'text-yellow-400'
                                    }`}>
                                        {issue.field}
                                    </span>
                                    <p className="text-xs text-zinc-300 leading-relaxed">
                                        {issue.message}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-6 border-t border-white/5 flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>
                        {t('style.validation_fix')}
                    </Button>
                    <Button 
                        variant={errorCount > 0 ? "secondary" : "primary"}
                        onClick={onProceed}
                        className={errorCount > 0 ? "opacity-50" : ""}
                    >
                        {t('style.validation_proceed_anyway')}
                    </Button>
                </div>
            </div>
        </div>
    );
};
