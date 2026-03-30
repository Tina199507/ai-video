import React from 'react';
import { Link, Edit3, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface FactItemProps {
    index: number;
    fact: { content: string; source?: string; confidence?: string };
    isLinked: boolean;
    isSelected: boolean;
    isDimmed: boolean;
    isEditing: boolean;
    isUsed: boolean;
    tempEditValue: string;
    onFactClick: (factId: string, index: number, content: string) => void;
    onEditStart: (index: number, content: string) => void;
    onEditSave: () => void;
    onEditCancel: () => void;
    onDelete: (e: React.MouseEvent, index: number) => void;
    setTempEditValue: (value: string) => void;
}

export const FactItem: React.FC<FactItemProps> = ({
    index,
    fact,
    isLinked,
    isSelected,
    isDimmed,
    isEditing,
    isUsed,
    tempEditValue,
    onFactClick,
    onEditStart,
    onEditSave,
    onEditCancel,
    onDelete,
    setTempEditValue
}) => {
    const { t } = useLanguage();

    return (
        <div 
            onClick={() => !isEditing && onFactClick(`Fact-${index+1}`, index, fact.content)}
            className={`
                p-4 transition-all duration-500 group cursor-pointer relative overflow-hidden
                ${isSelected ? 'bg-blue-500/5' : ''}
                ${isLinked ? 'bg-blue-500/10 scale-[1.02]' : ''}
                ${isUsed && !isSelected && !isLinked ? 'bg-emerald-500/5' : ''}
                ${!isSelected && !isLinked && !isUsed ? 'hover:bg-white/[0.02]' : ''}
                ${isDimmed ? 'opacity-20 blur-[0.5px]' : 'opacity-100'}
            `}
        >
            {/* Selection Indicator */}
            {(isSelected || isLinked) && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 animate-pulse"></div>
            )}

            <div className="flex items-start justify-between mb-3 relative z-10">
                <div className="flex items-center gap-3">
                    <span className={`text-[9px] font-mono font-bold transition-colors tracking-widest ${isLinked ? 'text-blue-400' : 'text-zinc-600'}`}>{t('script.fact_id')}_0{index+1}</span>
                    {isUsed && <div className="w-1 h-1 rounded-full bg-emerald-500"></div>}
                </div>
                <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {isLinked && <Link size={10} className="text-blue-500" />}
                    {!isEditing && (
                        <>
                            <button onClick={(e) => { e.stopPropagation(); onEditStart(index, fact.content); }} className="text-zinc-600 hover:text-white transition-colors"><Edit3 size={10} /></button>
                            <button onClick={(e) => onDelete(e, index)} className="text-zinc-600 hover:text-red-400 transition-colors"><Trash2 size={10} /></button>
                        </>
                    )}
                </div>
            </div>
            
            {isEditing ? (
                <div className="flex flex-col gap-3">
                    <textarea value={tempEditValue} onChange={(e) => setTempEditValue(e.target.value)} className="w-full bg-black/40 border-none rounded p-2 text-xs text-zinc-200 focus:ring-1 focus:ring-blue-500/50 outline-none resize-none" rows={3} autoFocus />
                    <div className="flex justify-end gap-4">
                        <button onClick={(e) => { e.stopPropagation(); onEditCancel(); }} className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest hover:text-white transition-colors">{t('common.cancel')}</button>
                        <button onClick={(e) => { e.stopPropagation(); onEditSave(); }} className="text-[9px] font-bold text-blue-500 uppercase tracking-widest hover:text-blue-400 transition-colors">{t('common.save')}</button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-3 relative z-10">
                    <p className={`text-xs leading-relaxed break-words whitespace-pre-wrap transition-colors duration-500 ${isSelected || isLinked ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-400'}`}>{fact.content}</p>
                    {(fact.source || fact.confidence) && (
                        <div className="flex items-center gap-4 pt-1">
                            {fact.source && <span className="text-[8px] text-zinc-700 font-mono uppercase tracking-tighter"><span className="opacity-50">SRC:</span> {fact.source}</span>}
                            {fact.confidence && <span className="text-[8px] text-zinc-700 font-mono uppercase tracking-tighter"><span className="opacity-50">CONF:</span> {fact.confidence}</span>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};