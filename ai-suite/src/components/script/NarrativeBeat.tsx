import React from 'react';
import { Edit3, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface NarrativeBeatProps {
    beat: any;
    index: number;
    isActive: boolean;
    isRelatedToFact: boolean;
    isDimmed: boolean;
    isEditing: boolean;
    tempEditValue: string;
    onEditStart: (index: number, beat: any) => void;
    onEditSave: () => void;
    onEditCancel: () => void;
    onDelete: (e: React.MouseEvent, index: number) => void;
    onEditChange: (value: string) => void;
    onClick: () => void;
    researchData: any;
}

export const NarrativeBeat: React.FC<NarrativeBeatProps> = ({
    beat,
    index,
    isActive,
    isRelatedToFact,
    isDimmed,
    isEditing,
    tempEditValue,
    onEditStart,
    onEditSave,
    onEditCancel,
    onDelete,
    onEditChange,
    onClick,
    researchData
}) => {
    const { t } = useLanguage();

    return (
        <div
            onClick={onClick}
            className={`w-full h-full transition-all duration-500 group ${isRelatedToFact ? 'animate-breathe-glow ring-2 ring-blue-500/50 rounded-lg bg-blue-500/5' : ''} ${isDimmed ? 'opacity-30 grayscale' : 'opacity-100'}`}
        >
            <div className="flex justify-between items-start mb-2">
                <span
                    className={`text-[10px] font-bold block font-display uppercase tracking-wider whitespace-nowrap ${isActive ? "text-blue-400" : "text-gray-500"}`}
                >
                    {t("script.sequence")}_0{index + 1}
                </span>
                <div className="flex items-center gap-2">
                    {isActive && (
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse shadow-glow"></div>
                    )}
                    {!isEditing && (
                        <>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEditStart(index, beat);
                                }}
                                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-white transition-opacity"
                            >
                                <Edit3 size={12} />
                            </button>
                            <button
                                onClick={(e) => onDelete(e, index)}
                                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-opacity"
                            >
                                <Trash2 size={12} />
                            </button>
                        </>
                    )}
                </div>
            </div>
            <h3
                className={`text-sm font-bold mb-2 font-display leading-tight ${isActive ? "text-white" : "text-gray-200"}`}
            >
                {beat.sectionTitle}
            </h3>
            {isEditing ? (
                <div className="flex flex-col gap-2">
                    <textarea
                        value={tempEditValue}
                        onChange={(e) => onEditChange(e.target.value)}
                        className="w-full bg-black/30 border border-blue-500/50 rounded p-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                        autoFocus
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onEditCancel();
                            }}
                            className="text-[10px] text-zinc-400 hover:text-white"
                        >
                            {t("common.cancel")}
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onEditSave();
                            }}
                            className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded"
                        >
                            {t("common.save")}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    <p className="text-xs text-gray-500 mb-1 leading-relaxed whitespace-pre-wrap">
                        {beat.description}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-mono">
                        {beat.estimatedDuration && (
                            <span>
                                <span className="font-bold">Duration:</span>{" "}
                                {beat.estimatedDuration}s
                            </span>
                        )}
                        {beat.targetWordCount && (
                            <span>
                                <span className="font-bold">
                                    Target Words:
                                </span>{" "}
                                {beat.targetWordCount}
                            </span>
                        )}
                    </div>
                </div>
            )}
            {beat.factReferences &&
                beat.factReferences.length > 0 && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700/50">
                        <div className="flex -space-x-2">
                            {beat.factReferences
                                .slice(0, 3)
                                .map((ref: string, idx: number) => {
                                    let displayRef = ref.replace("Fact-", "");
                                    if (displayRef.length > 3) {
                                        const factIndex =
                                            researchData?.facts?.findIndex(
                                                (f: any) =>
                                                    f.content.includes(ref) ||
                                                    ref.includes(f.content),
                                            );
                                        if (
                                            factIndex !== undefined &&
                                            factIndex !== -1
                                        ) {
                                            displayRef = `${factIndex + 1}`;
                                        } else {
                                            displayRef = "?";
                                        }
                                    }
                                    return (
                                        <div
                                            key={idx}
                                            className={`w-6 h-6 rounded-full text-[9px] flex items-center justify-center border border-[#1a232e] font-display font-bold shadow-sm ${isActive || isRelatedToFact ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}
                                            title={ref}
                                        >
                                            {displayRef}
                                        </div>
                                    );
                                })}
                            {beat.factReferences.length > 3 && (
                                <div className="w-6 h-6 rounded-full bg-gray-800 text-[9px] text-gray-400 flex items-center justify-center border border-[#1a232e] z-10">
                                    +{beat.factReferences.length - 3}
                                </div>
                            )}
                        </div>
                        <span className="text-[10px] text-gray-500 font-display font-medium ml-1">
                            {t("script.assets_linked")}
                        </span>
                    </div>
                )}
        </div>
    );
};
