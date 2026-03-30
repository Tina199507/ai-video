import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface TemplateLibraryProps {
    templates: any[];
    onLoadTemplate: (template: any) => void;
    onRenameTemplate: (id: string, name: string) => void;
    onDeleteTemplate: (id: string) => void;
}

export const TemplateLibrary: React.FC<TemplateLibraryProps> = ({
    templates,
    onLoadTemplate,
    onRenameTemplate,
    onDeleteTemplate
}) => {
    const { t } = useLanguage();
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const handleEditTemplate = (template: any, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingTemplateId(template.id);
        setEditName(template.profile._meta?.sourceTitle || '');
    };

    const handleSaveRename = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        if (editName.trim()) {
            onRenameTemplate(id, editName);
            setEditingTemplateId(null);
        }
    };

    return (
        <div className="flex-grow overflow-y-auto custom-scrollbar p-8 pt-0 mt-auto">
            <div className="flex items-center justify-between mb-4 mt-8">
                <h3 className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.2em]">{t('style.template_lib')}</h3>
                <span className="text-[9px] font-mono text-zinc-700">{templates.length}</span>
            </div>
            <div className="space-y-1 opacity-40 hover:opacity-100 transition-opacity duration-500">
                {templates.length === 0 ? (
                    <div className="text-xs text-zinc-700 italic font-mono py-4">
                        {t('style.empty_lib')}
                    </div>
                ) : (
                    templates.map((item) => (
                        <div 
                            key={item.id} 
                            onClick={() => onLoadTemplate(item)}
                            className="group flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-all hover:bg-white/[0.04] relative"
                        >
                            <div className="w-10 h-10 rounded bg-zinc-900 overflow-hidden shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                                {item.profile._meta?.sourceThumbnail ? (
                                    <img src={item.profile._meta.sourceThumbnail} alt="" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-700 text-[8px]">IMG</div>
                                )}
                            </div>
                            <div className="min-w-0 flex-grow">
                                {editingTemplateId === item.id ? (
                                    <input 
                                        type="text" 
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(item.id, e)}
                                        onBlur={(e) => handleSaveRename(item.id, e)}
                                        className="w-full bg-black/50 border border-white/20 rounded px-1 py-0.5 text-xs text-white focus:outline-none focus:border-primary"
                                        autoFocus
                                    />
                                ) : (
                                    <h4 className="text-xs font-medium text-zinc-400 group-hover:text-white transition-colors truncate pr-16">
                                        {item.profile._meta?.sourceTitle || t('style.untitled_style')}
                                    </h4>
                                )}
                                <p className="text-[10px] text-zinc-600 truncate font-mono mt-0.5">{item.profile.tone} • {item.profile.pacing}</p>
                            </div>
                            
                            {/* Actions */}
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                <button 
                                    onClick={(e) => handleEditTemplate(item, e)}
                                    className="p-1.5 rounded hover:bg-white/10 text-zinc-500 hover:text-white transition-colors"
                                    title={t('style.rename')}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                </button>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm(t('style.confirm_delete'))) {
                                            onDeleteTemplate(item.id);
                                        }
                                    }}
                                    className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-500 transition-colors"
                                    title={t('style.delete')}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
