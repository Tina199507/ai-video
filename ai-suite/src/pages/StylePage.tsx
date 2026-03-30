import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import { Save, Sparkles, Upload, ChevronRight, X, Film, BookOpen, CheckCircle2, FileText, Trash2 } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { Button } from '../components/ui/Button';
import { TranscriptModal } from '../components/style/TranscriptModal';
import { ValidationModal } from '../components/style/ValidationModal';
import { validateStyleProfile, ValidationReport } from '../services/utils/styleProfileQuality';
import { AgentControlPanel } from '../components/dashboard/AgentControlPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

type PageState = 'input' | 'processing' | 'ready';

// ─── Sub-components ───────────────────────────────────────────────────────────

const VideoDropZone: React.FC<{
  file: File | null;
  onFile: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
}> = ({ file, onFile, onRemove, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith('video/')) onFile(f);
  }, [disabled, onFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && !file && inputRef.current?.click()}
      className={`
        relative rounded-2xl border-2 transition-all duration-300 overflow-hidden h-[180px] flex flex-col justify-center
        ${file
          ? 'border-emerald-500/40 bg-emerald-950/10 cursor-default'
          : dragging
            ? 'border-emerald-400/60 bg-emerald-950/20 scale-[1.01] cursor-copy'
            : 'border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04] cursor-pointer'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />

      {file ? (
        <div className="relative w-full h-full group">
          <video
            src={URL.createObjectURL(file)}
            className="w-full h-full object-cover"
            muted
            playsInline
            onLoadedData={(e) => {
              e.currentTarget.currentTime = 0; // Seek to first frame
            }}
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4">
            <p className="text-xs font-medium text-white truncate w-full text-center mb-1">{file.name}</p>
            <p className="text-[10px] text-zinc-300">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
          {!disabled && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors z-10"
            >
              <X size={12} className="text-white" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-6 px-4 text-center h-full">
          <div className={`w-12 h-12 rounded-full border-2 border-dashed flex items-center justify-center transition-colors ${dragging ? 'border-emerald-400 text-emerald-400' : 'border-zinc-700 text-zinc-600'}`}>
            <Upload size={18} />
          </div>
          <div>
            <p className="text-sm text-zinc-300 font-medium">添加视频素材</p>
            <p className="text-[10px] text-zinc-600 mt-1">拖入或点击上传</p>
          </div>
        </div>
      )}
    </div>
  );
};


const TopicInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => (
  <div className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden ${value.trim() ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-white/8 bg-white/[0.02] focus-within:border-white/15'} ${disabled ? 'opacity-50' : ''}`}>
    <div className="flex items-start gap-4 p-5">
      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
        <BookOpen size={20} className="text-zinc-400" />
      </div>
      <div className="flex-1">
        <label className="block text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">
          新视频主题
        </label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="例如：人为什么会做梦？黑洞是怎么形成的？"
          rows={2}
          className="w-full bg-transparent text-sm text-white placeholder:text-zinc-600 resize-none outline-none leading-relaxed"
        />
      </div>
    </div>
  </div>
);


const ReadyCard: React.FC<{
  topic: string;
  sourceTitle: string;
}> = ({ topic, sourceTitle }) => (
  <div className="flex flex-col items-center justify-center gap-8 py-12 animate-in fade-in zoom-in-95 duration-500 h-full">
    <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
      <CheckCircle2 size={32} className="text-emerald-400" />
    </div>

    <div className="text-center max-w-sm">
      <p className="text-xs font-mono text-emerald-500/70 uppercase tracking-widest mb-2">风格分析完成</p>
      <h2 className="text-xl font-semibold text-white mb-1">「{topic}」</h2>
      <p className="text-sm text-zinc-500">已提取参考视频「{sourceTitle}」的写作风格</p>
    </div>
  </div>
);


const TemplateCard: React.FC<{
  template: any;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ template, onSelect, onDelete }) => {
  return (
    <div 
      onClick={onSelect}
      className="w-full h-[180px] shrink-0 rounded-2xl border-2 border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04] cursor-pointer transition-all overflow-hidden relative group flex flex-col"
    >
      <div className="h-28 bg-zinc-900 relative">
        {template.profile._meta?.sourceThumbnail ? (
          <img src={template.profile._meta.sourceThumbnail} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">无预览图</div>
        )}
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-zinc-400 hover:text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="p-3 flex-1 flex flex-col justify-center bg-black/40">
        <h3 className="text-sm font-medium text-white truncate">{template.profile._meta?.sourceTitle || '未命名模板'}</h3>
        <p className="text-[10px] text-zinc-500 mt-1 truncate">{template.profile.tone} • {template.profile.pacing}</p>
      </div>
    </div>
  );
};


// ─── Main Page ────────────────────────────────────────────────────────────────

const StylePage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { actions, state, workflowProgress } = useProject();

  // ── Local state ──
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [topicInput, setTopicInput] = useState(state.targetTopic || '');
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);

  // ── Derived state ──
  const analyzing = state.isProcessing && !state.styleProfile;
  const analyzed = !!state.styleProfile;

  const pageState: PageState = analyzing ? 'processing' : analyzed ? 'ready' : 'input';
  const canStart = !!selectedFile && topicInput.trim().length > 0 && !state.isProcessing;

  // Sync topic from context
  useEffect(() => {
    if (state.targetTopic && !topicInput) setTopicInput(state.targetTopic);
  }, [state.targetTopic]);

  // ── Handlers ──
  const handleStart = async () => {
    if (!canStart) return;
    const title = topicInput.trim();
    if (!state.projectId) await actions.handleStartProject(title);
    // Store topic in context before analysis
    actions.handleDraftOnly(title);
    await actions.handleAnalyze(selectedFile!, title);
  };

  const handleProceedToScript = () => {
    if (!state.styleProfile) return;
    const report = validateStyleProfile(state.styleProfile);
    if (report.ok) {
      navigate('/script');
    } else {
      setValidationReport(report);
      setShowValidationModal(true);
    }
  };

  const handleSaveTemplate = () => {
    if (state.styleProfile) {
      const name = state.referenceTitle || `Style ${new Date().toLocaleDateString()}`;
      actions.handleSaveStyleToLibrary(name);
    }
  };

  const handleLoadTemplate = (template: any) => {
    actions.handleLoadTemplate(template);
  };

  const handleReset = () => {
    setSelectedFile(null);
  };

  // ── Progress info ──
  const currentStep = workflowProgress?.step;
  const progressMessage = (state.isProcessing && workflowProgress?.step === 'analysis')
    ? workflowProgress.message
    : undefined;

  return (
    <div className="w-full h-full flex flex-col bg-[#050505] text-white selection:bg-emerald-500/30">
      {/* Background */}
      <div className="fixed inset-0 bg-dot-grid opacity-[0.03] pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-radial from-emerald-950/10 via-transparent to-transparent pointer-events-none" />

      {/* Top Bar */}
      <TopBar
        title="风格迁移"
        subtitle="上传参考视频，生成同风格新视频"
        className="border-b border-white/5 bg-black/40 backdrop-blur-xl z-50"
        centerContent={
          pageState === 'processing' ? (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-950/30 rounded-full border border-emerald-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-mono text-emerald-400/80 uppercase tracking-widest">
                正在分析
              </span>
            </div>
          ) : analyzed ? (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-white/[0.03] rounded-full border border-white/8">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest">
                {state.referenceTitle || '风格已提取'}
              </span>
            </div>
          ) : null
        }
        actions={
          <div className="flex items-center gap-3">
            {analyzed ? (
              <>
                <button
                  onClick={() => setShowTranscriptModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/8 text-zinc-400 hover:text-white hover:border-white/15 text-sm transition-all"
                  title="查看或编辑转录文本"
                >
                  <FileText size={14} />
                  <span className="hidden sm:inline">查看转录</span>
                </button>
                <button
                  onClick={handleSaveTemplate}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/8 text-zinc-400 hover:text-white hover:border-white/15 text-sm transition-all"
                >
                  <Save size={14} />
                  <span className="hidden sm:inline">保存模板</span>
                </button>
                <button
                  onClick={handleProceedToScript}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-all shadow-[0_0_30px_rgba(16,185,129,0.25)] hover:shadow-[0_0_40px_rgba(16,185,129,0.4)]"
                >
                  开始生成脚本
                  <ChevronRight size={16} />
                </button>
              </>
            ) : (
              <button
                onClick={handleStart}
                disabled={!canStart}
                className={`
                  px-6 py-2 rounded-xl font-medium text-sm transition-all duration-500 flex items-center gap-2
                  ${canStart
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_40px_rgba(16,185,129,0.25)] hover:shadow-[0_0_60px_rgba(16,185,129,0.4)] cursor-pointer'
                    : 'bg-zinc-900 text-zinc-600 cursor-not-allowed border border-zinc-800'}
                `}
              >
                <Sparkles size={16} className={canStart ? 'text-emerald-200' : 'text-zinc-700'} />
                开始分析风格
              </button>
            )}
          </div>
        }
      />

      {/* Main layout */}
      <main className="flex-1 overflow-y-auto custom-scrollbar relative">
        <div className="max-w-6xl mx-auto p-8 flex flex-col gap-8 min-h-full relative">

          {/* ── STATE: READY ── */}
          {pageState === 'ready' && (
            <div className="flex-1 flex items-center justify-center">
              <ReadyCard
                topic={topicInput || state.targetTopic || '新视频'}
                sourceTitle={state.referenceTitle || '参考视频'}
              />
            </div>
          )}

          {/* ── STATE: INPUT & PROCESSING ── */}
          {(pageState === 'input' || pageState === 'processing') && (
            <div className="flex flex-col gap-8 h-full">
              {/* Top: Topic Input */}
              <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500 shrink-0">
                <TopicInput
                  value={topicInput}
                  onChange={setTopicInput}
                  disabled={pageState === 'processing'}
                />
              </div>

              {/* Bottom: Two columns */}
              <div className="flex flex-1 gap-8 min-h-0">
                {/* Left: Vertical Cards */}
                <div className="w-1/2 flex flex-col animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100 min-h-0">
                  <div className="flex items-center justify-between mb-4 shrink-0">
                    <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-widest">参考视频与模板</h2>
                    <span className="text-xs text-zinc-600">{state.savedTemplates?.length || 0} 个已保存模板</span>
                  </div>
                  
                  <div className="flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                    {/* Card 1: Add Video */}
                    <div className="w-full shrink-0">
                      <VideoDropZone
                        file={selectedFile}
                        onFile={(f) => setSelectedFile(f)}
                        onRemove={handleReset}
                        disabled={pageState === 'processing'}
                      />
                    </div>
                    
                    {/* Template Cards */}
                    {state.savedTemplates?.map(template => (
                      <div key={template.id} className="w-full shrink-0">
                        <TemplateCard 
                          template={template} 
                          onSelect={() => {
                            if (pageState !== 'processing') handleLoadTemplate(template);
                          }} 
                          onDelete={() => {
                            if (pageState !== 'processing' && window.confirm(t('style.confirm_delete'))) {
                              actions.handleDeleteTemplate(template.id);
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Model Selection */}
                <div className="w-1/2 flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 overflow-y-auto custom-scrollbar pr-2">
                  <AgentControlPanel />
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Modals */}
      <TranscriptModal
        isOpen={showTranscriptModal}
        onClose={() => setShowTranscriptModal(false)}
        transcript={state.styleProfile?.fullTranscript || ''}
        onSave={(t) => {
          actions.handleUpdateStyleProfile({ fullTranscript: t });
          actions.addLog('Transcript edited manually', 'info', { fullTranscript: t });
        }}
      />

      {validationReport && (
        <ValidationModal
          isOpen={showValidationModal}
          onClose={() => setShowValidationModal(false)}
          onProceed={() => {
            setShowValidationModal(false);
            navigate('/script');
          }}
          report={validationReport}
        />
      )}
    </div>
  );
};

export default StylePage;