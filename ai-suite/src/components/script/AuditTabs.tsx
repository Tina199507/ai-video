import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle2, FileText, Palette, XCircle } from 'lucide-react';
import { AuditResult, ComplianceAudit, ContaminationAudit, StyleAudit } from '../../types';

interface AuditTabsProps {
  auditResult: AuditResult;
}

export const AuditTabs: React.FC<AuditTabsProps> = ({ auditResult }) => {
  const [activeTab, setActiveTab] = useState<'compliance' | 'contamination' | 'style'>('compliance');

  const { audit_1_compliance, audit_2_contamination, audit_3_style } = auditResult;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS':
      case 'CLEAN':
      case 'APPROVED':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'WARNING':
      case 'PARTIAL':
      case 'FLAGGED':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'BLOCK':
      case 'FAIL':
      case 'NEEDS_REVISION':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      default:
        return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS':
      case 'CLEAN':
      case 'APPROVED':
        return <CheckCircle2 size={14} />;
      case 'WARNING':
      case 'PARTIAL':
      case 'FLAGGED':
        return <AlertTriangle size={14} />;
      case 'BLOCK':
      case 'FAIL':
      case 'NEEDS_REVISION':
        return <XCircle size={14} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-4 mb-8 bg-zinc-900/40 border border-white/5 rounded-xl overflow-hidden">
      {/* Tab Header */}
      <div className="flex border-b border-white/5">
        <button
          onClick={() => setActiveTab('compliance')}
          className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'compliance' ? 'bg-white/5 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]'
          }`}
        >
          <ShieldAlert size={14} />
          合规检查
          <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] ${getStatusColor(audit_1_compliance.status)}`}>
            {audit_1_compliance.status}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('contamination')}
          className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'contamination' ? 'bg-white/5 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]'
          }`}
        >
          <FileText size={14} />
          污染扫描
          <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] ${getStatusColor(audit_2_contamination.status)}`}>
            {audit_2_contamination.status}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('style')}
          className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'style' ? 'bg-white/5 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]'
          }`}
        >
          <Palette size={14} />
          风格一致性
          <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] ${getStatusColor(audit_3_style.overall_status)}`}>
            {audit_3_style.overall_status}
          </span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-4 min-h-[120px]">
        {activeTab === 'compliance' && (
          <div className="space-y-3">
            {audit_1_compliance.issues.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-zinc-500 gap-2">
                <CheckCircle2 size={24} className="text-emerald-500/50" />
                <span className="text-xs">未发现合规问题</span>
              </div>
            ) : (
              audit_1_compliance.issues.map((issue, i) => (
                <div key={i} className={`p-3 rounded border text-xs ${
                  issue.level === 'BLOCK' ? 'bg-red-500/10 border-red-500/20' : 'bg-amber-500/10 border-amber-500/20'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] uppercase ${
                      issue.level === 'BLOCK' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {issue.level}
                    </span>
                    <span className="text-zinc-400">{issue.reason}</span>
                  </div>
                  <div className="text-zinc-300 font-mono bg-black/20 p-2 rounded mb-2 border border-white/5">
                    "{issue.text}"
                  </div>
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span className="text-[10px] uppercase tracking-wider opacity-60">建议:</span>
                    <span className="text-zinc-300">{issue.suggestion}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'contamination' && (
          <div className="space-y-3">
            {audit_2_contamination.flagged_sentences.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-zinc-500 gap-2">
                <CheckCircle2 size={24} className="text-emerald-500/50" />
                <span className="text-xs">未发现内容污染（抄袭）</span>
              </div>
            ) : (
              audit_2_contamination.flagged_sentences.map((flag, i) => (
                <div key={i} className="p-3 rounded border bg-amber-500/5 border-amber-500/20 text-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold px-1.5 py-0.5 rounded text-[9px] uppercase bg-amber-500/20 text-amber-300">
                      {flag.similarity_type}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-2">
                    <div>
                      <div className="text-[9px] uppercase text-zinc-500 mb-1">Generated</div>
                      <div className="text-zinc-300 font-mono bg-black/20 p-2 rounded border border-white/5">
                        "{flag.generated_text}"
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-zinc-500 mb-1">Original Source</div>
                      <div className="text-zinc-400 font-mono bg-black/20 p-2 rounded border border-white/5 opacity-80">
                        "{flag.original_text}"
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-400 border-t border-white/5 pt-2 mt-2">
                    <span className="text-[10px] uppercase tracking-wider opacity-60">建议:</span>
                    <span className="text-zinc-300">{flag.suggestion}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'style' && (
          <div className="space-y-2">
            {audit_3_style.stage_ratings.map((rating, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-white/[0.02] border border-white/5 text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-zinc-500 font-mono text-[10px] w-4">{i + 1}</span>
                  <span className="font-bold text-zinc-300 min-w-[120px]">{rating.stage}</span>
                </div>
                
                <div className="flex items-center gap-4 flex-1 justify-end">
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] text-zinc-500 uppercase">Expected</span>
                    <span className="text-zinc-400">{rating.expected_tone}</span>
                  </div>
                  
                  <div className="w-px h-6 bg-white/10 mx-2"></div>
                  
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] text-zinc-500 uppercase">Actual</span>
                    <span className={`font-medium ${
                      rating.rating === 'matches' ? 'text-emerald-400' : 
                      rating.rating === 'partial' ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {rating.actual_tone}
                    </span>
                  </div>

                  <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase w-20 text-center ${
                    rating.rating === 'matches' ? 'bg-emerald-500/10 text-emerald-400' : 
                    rating.rating === 'partial' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {rating.rating}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
