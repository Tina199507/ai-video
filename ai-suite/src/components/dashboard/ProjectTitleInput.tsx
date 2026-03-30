import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface ProjectTitleInputProps {
    value: string;
    onChange: (value: string) => void;
}

export const ProjectTitleInput: React.FC<ProjectTitleInputProps> = ({ value, onChange }) => {
    const { t } = useLanguage();

    return (
        <div className="pt-10 flex flex-col items-center justify-center space-y-6">
            <div className="w-full max-w-3xl text-center space-y-2">
                <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em]">{t('dash.project_name') || "PROJECT IDENTITY"}</h2>
                <div className="relative group">
                    <input 
                        type="text" 
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full bg-transparent border-b-2 border-zinc-800 py-4 text-4xl md:text-3xl font-light text-white text-center placeholder-zinc-800 focus:outline-none focus:border-primary transition-all duration-500 font-display"
                        placeholder={t('dash.placeholder')}
                    />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-primary transition-all duration-500 group-focus-within:w-full shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]"></div>
                </div>
            </div>
        </div>
    );
};
