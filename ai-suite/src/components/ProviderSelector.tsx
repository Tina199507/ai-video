import React from 'react';
import { AIProvider } from '../types';
import { Sparkles, Zap, BrainCircuit } from 'lucide-react';

interface ProviderSelectorProps {
    current: AIProvider;
    options: AIProvider[];
    onChange: (provider: AIProvider) => void;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
    current,
    options,
    onChange
}) => {
    const getProviderIcon = (p: AIProvider) => {
        switch (p) {
            case AIProvider.GEMINI: return <Sparkles size={12} />;
            case AIProvider.OPENAI: return <Zap size={12} />;
            case AIProvider.ANTHROPIC: return <BrainCircuit size={12} />;
            default: return <Sparkles size={12} />;
        }
    };

    const getProviderLabel = (p: AIProvider) => {
        switch (p) {
            case AIProvider.GEMINI: return 'Gemini';
            case AIProvider.OPENAI: return 'OpenAI';
            case AIProvider.ANTHROPIC: return 'Anthropic';
            default: return p;
        }
    };

    return (
        <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/5">
            {options.map(p => (
                <button
                    key={p}
                    onClick={() => onChange(p)}
                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1.5 ${current === p ? 'bg-zinc-700 text-white shadow-sm ring-1 ring-white/10' : 'text-zinc-500 hover:text-zinc-300'}`}
                    title={`Switch to ${getProviderLabel(p)}`}
                >
                    {getProviderIcon(p)}
                    <span className="hidden sm:inline">{getProviderLabel(p)}</span>
                </button>
            ))}
        </div>
    );
};
