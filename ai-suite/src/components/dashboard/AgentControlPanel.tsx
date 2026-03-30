import React, { useState } from 'react';
import { Sliders, Eye, BrainCircuit, Palette, ImageIcon, Video } from 'lucide-react';
import { Card } from '../ui/Card';
import { IconBox } from '../ui/IconBox';
import { AgentCard } from './AgentCard';
import { ProviderSelector } from '../ProviderSelector';
import { useProject } from '../../context/ProjectContext';
import { useLanguage } from '../../context/LanguageContext';
import { AIProvider } from '../../types';
import { AVAILABLE_MODELS } from '../../config/constants';

type VisualTab = 'image' | 'video';

export const AgentControlPanel: React.FC = () => {
    const { state, actions } = useProject();
    const { t } = useLanguage();
    const [visualTab, setVisualTab] = useState<VisualTab>(state.modelConfig.preferredWorkflow || 'image');

    const hasKey = (p: AIProvider) => !!state.apiKeys[p];

    const getModelsForProvider = (category: 'ANALYSIS' | 'SCRIPTING' | 'VISUAL' | 'VIDEO', provider: AIProvider) => {
        if (!hasKey(provider)) return [];
        // @ts-ignore - dynamic key access
        return AVAILABLE_MODELS[category].filter(m => m.provider === provider);
    };

    return (
        <Card className="flex-grow flex flex-col gap-6 border-zinc-800 bg-zinc-900/20" noPadding>
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-zinc-900/50">
                <div className="flex items-center gap-3">
                    <IconBox icon={<Sliders size={18} />} color="primary" size="sm" />
                    <div>
                        <h3 className="font-bold text-white text-sm">{t('dash.agent_control')}</h3>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{t('dash.agent_desc')}</p>
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-4">
                {/* CONTEXT AGENT (Video Analysis) */}
                <AgentCard 
                    title={t('dash.context_agent')}
                    description={t('dash.context_desc')}
                    icon={<Eye size={16} />}
                    color="emerald"
                    badgeText="GEMINI NATIVE"
                >
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-caps">{t('dash.analysis_model')}</label>
                            <select 
                                className="agent-select border-emerald-500/20 focus:ring-emerald-500"
                                value={state.modelConfig.analysisModel}
                                onChange={(e) => {
                                    actions.handleUpdateModelConfig({ analysisModel: e.target.value });
                                }}
                            >
                                {AVAILABLE_MODELS.ANALYSIS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label-caps">{t('dash.capabilities')}</label>
                            <div className="flex gap-1.5 flex-wrap">
                                <span className="px-1.5 py-0.5 bg-black/40 text-[9px] text-zinc-400 rounded border border-white/5">{t('dash.context_2m')}</span>
                                <span className="px-1.5 py-0.5 bg-black/40 text-[9px] text-zinc-400 rounded border border-white/5">{t('dash.context_multi')}</span>
                            </div>
                        </div>
                    </div>
                </AgentCard>

                {/* NARRATIVE AGENT (Scripting) */}
                <AgentCard 
                    title={t('dash.narrative_agent')}
                    description={t('dash.narrative_desc')}
                    icon={<BrainCircuit size={16} />}
                    color="blue"
                >
                    <div className="flex items-center justify-between mb-4 -mt-10">
                        <div className="flex-1"></div>
                        <ProviderSelector 
                            current={state.modelConfig.scriptingProvider}
                            options={[AIProvider.GEMINI, AIProvider.OPENAI, AIProvider.ANTHROPIC]}
                            onChange={(p) => {
                                const firstModel = getModelsForProvider('SCRIPTING', p)[0];
                                if (firstModel) {
                                    actions.handleUpdateModelConfig({ scriptingModel: firstModel.id, scriptingProvider: p });
                                }
                            }}
                        />
                    </div>

                     <div className="grid grid-cols-1">
                        <div>
                            <label className="label-caps">{t('dash.reasoning_model')}</label>
                            <select 
                                className="agent-select border-blue-500/20 focus:ring-blue-500"
                                value={state.modelConfig.scriptingModel}
                                onChange={(e) => {
                                    actions.handleUpdateModelConfig({ scriptingModel: e.target.value });
                                }}
                            >
                                <optgroup label="Google DeepMind">
                                    {hasKey(AIProvider.GEMINI) ? getModelsForProvider('SCRIPTING', AIProvider.GEMINI).map(m => <option key={m.id} value={m.id}>{m.name}</option>) : <option disabled>{t('dash.api_req')}</option>}
                                </optgroup>
                                <optgroup label="OpenAI">
                                    {hasKey(AIProvider.OPENAI) ? getModelsForProvider('SCRIPTING', AIProvider.OPENAI).map(m => <option key={m.id} value={m.id}>{m.name}</option>) : <option disabled>{t('dash.api_req')}</option>}
                                </optgroup>
                                <optgroup label="Anthropic">
                                    {hasKey(AIProvider.ANTHROPIC) ? getModelsForProvider('SCRIPTING', AIProvider.ANTHROPIC).map(m => <option key={m.id} value={m.id}>{m.name}</option>) : <option disabled>{t('dash.api_req')}</option>}
                                </optgroup>
                            </select>
                        </div>
                    </div>
                </AgentCard>

                {/* VISUAL & MOTION AGENT (Assets) */}
                <AgentCard 
                    title={t('dash.visual_agent')}
                    description={t('dash.visual_desc')}
                    icon={<Palette size={16} />}
                    color="purple"
                >
                    <div className="flex items-center justify-between mb-4 -mt-10">
                        <div className="flex-1"></div>
                        <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/5">
                            <button 
                                onClick={() => {
                                    setVisualTab('image');
                                    actions.handleUpdateModelConfig({ preferredWorkflow: 'image' });
                                }}
                                className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all flex items-center gap-1.5 ${visualTab === 'image' ? 'bg-zinc-700 text-white shadow-sm ring-1 ring-white/10' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                <ImageIcon size={10} /> {t('dash.images')}
                            </button>
                            <button 
                                onClick={() => {
                                    setVisualTab('video');
                                    actions.handleUpdateModelConfig({ preferredWorkflow: 'video' });
                                }}
                                className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all flex items-center gap-1.5 ${visualTab === 'video' ? 'bg-zinc-700 text-white shadow-sm ring-1 ring-white/10' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                <Video size={10} /> {t('dash.videos')}
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 space-y-4">
                        {visualTab === 'image' ? (
                            <div className="space-y-3 animate-in fade-in slide-in-from-left-2 duration-300">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">{t('dash.image_supplier')}</span>
                                    <ProviderSelector 
                                        current={state.modelConfig.visualProvider} 
                                        options={[AIProvider.GEMINI, AIProvider.OPENAI]}
                                        onChange={(p) => {
                                            const firstModel = getModelsForProvider('VISUAL', p)[0];
                                            if (firstModel) {
                                                actions.handleUpdateModelConfig({ visualProvider: p, visualModel: firstModel.id });
                                            }
                                        }}
                                    />
                                </div>
                                <div>
                                    <select 
                                        className="agent-select border-purple-500/20 focus:ring-purple-500"
                                        value={state.modelConfig.visualModel}
                                        onChange={(e) => {
                                            actions.handleUpdateModelConfig({ visualModel: e.target.value });
                                        }}
                                    >
                                        {getModelsForProvider('VISUAL', state.modelConfig.visualProvider).map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <p className="text-[10px] text-zinc-500 italic">
                                    {state.modelConfig.visualProvider === AIProvider.GEMINI 
                                        ? t('dash.desc_imagen') 
                                        : t('dash.desc_dalle')}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-300">
                                 <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">{t('dash.video_supplier')}</span>
                                    <ProviderSelector 
                                        current={state.modelConfig.videoProvider} 
                                        options={[AIProvider.GEMINI]} // Currently only Gemini supported for Video
                                        onChange={(p) => {
                                            const firstModel = getModelsForProvider('VIDEO', p)[0];
                                            if (firstModel) {
                                                actions.handleUpdateModelConfig({ videoProvider: p, videoModel: firstModel.id });
                                            }
                                        }}
                                    />
                                </div>
                                <div>
                                    <select 
                                        className="agent-select border-purple-500/20 focus:ring-purple-500"
                                        value={state.modelConfig.videoModel}
                                        onChange={(e) => {
                                            actions.handleUpdateModelConfig({ videoModel: e.target.value });
                                        }}
                                    >
                                        {getModelsForProvider('VIDEO', state.modelConfig.videoProvider).map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <p className="text-[10px] text-zinc-500 italic">
                                    {t('dash.desc_veo')} 
                                    <span className="text-amber-500 ml-1">{t('dash.paid_key')}</span>
                                </p>
                            </div>
                        )}
                    </div>
                </AgentCard>
            </div>
        </Card>
    );
};
