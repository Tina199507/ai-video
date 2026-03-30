
import React from 'react';
import { AlertTriangle, ArrowRight, Link } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface SafetyModalProps {
  isOpen: boolean;
  onProceed: () => void;
  onCancel: () => void;
  reason?: string;
}

const SafetyModal: React.FC<SafetyModalProps> = ({ isOpen, onProceed, onCancel, reason }) => {
  const { t } = useLanguage();
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
        <div className="bg-[#1a1d24] border border-red-500/30 rounded-2xl shadow-2xl max-w-md w-full p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500"></div>
            <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-red-500/10 rounded-full border border-red-500/20 shrink-0">
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white mb-1">{t('script.safety_warning')}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                        {reason || t('safety.desc')}
                    </p>
                </div>
            </div>
            
            <div className="bg-black/40 rounded-lg p-4 mb-6 border border-white/5">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">{t('script.safety_help_resources')}</h4>
                <ul className="space-y-2 text-sm">
                    <li>
                        <a href="#" className="text-blue-400 hover:text-blue-300 flex items-center gap-2 transition-colors">
                            <Link size={14} /> International Helplines Database
                        </a>
                    </li>
                    <li>
                        <a href="#" className="text-blue-400 hover:text-blue-300 flex items-center gap-2 transition-colors">
                            <Link size={14} /> Mental Health Support Resources
                        </a>
                    </li>
                </ul>
            </div>

            <div className="flex items-center justify-end gap-3">
                <button 
                    onClick={onCancel}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                    {t('common.cancel')}
                </button>
                <button 
                    onClick={onProceed}
                    className="px-4 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                >
                    <span>{t('script.safety_proceed_caution')}</span>
                    <ArrowRight size={14} />
                </button>
            </div>
        </div>
    </div>
  );
};

export default SafetyModal;
