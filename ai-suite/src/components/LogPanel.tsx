import React, { useState } from 'react';
import { Terminal, X, ChevronDown, ChevronUp, Database, Info, CheckCircle, AlertCircle, Copy, Trash2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useLanguage } from '../context/LanguageContext';
import { LogEntry } from '../types';

export const LogPanel: React.FC = () => {
  const { state, actions } = useProject();
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const toggleLog = (id: string) => {
    const next = new Set(expandedLogs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedLogs(next);
  };

  const copyToClipboard = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  };

  const clearLogs = () => {
    if (actions.handleClearLogs) {
        actions.handleClearLogs();
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all shadow-2xl group"
        title="System Logs"
      >
        <Terminal size={20} />
        <span className="absolute right-full mr-3 px-2 py-1 bg-zinc-800 text-[10px] text-zinc-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          {t('nav.system_logs') || 'System Logs'}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 w-full md:w-[450px] h-[600px] max-h-[80vh] bg-[#0a0a0a] border-l border-t border-white/10 z-[60] flex flex-col shadow-[0_-20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <Terminal size={16} className="text-emerald-500" />
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-200">{t('nav.system_logs') || 'System Logs'}</h3>
          <span className="px-1.5 py-0.5 bg-zinc-800 text-[9px] font-mono text-zinc-500 rounded">{state.logs.length}</span>
        </div>
        <div className="flex items-center gap-4">
          {state.projectId && (
            <button 
                onClick={() => { if(window.confirm('Wipe current project data? Logs will be kept.')) actions.handleDeleteActiveProject(); }}
                className="text-[10px] text-zinc-500 hover:text-orange-400 transition-colors flex items-center gap-1.5 uppercase tracking-widest font-bold"
            >
                Wipe Data
            </button>
          )}
          {state.logs.length > 0 && (
            <button 
                onClick={clearLogs}
                className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1.5 uppercase tracking-widest font-bold"
            >
                <Trash2 size={12} />
                Clear
            </button>
          )}
          <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Log List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
        {state.logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4">
            <Database size={40} />
            <p className="text-xs font-mono uppercase tracking-widest">No logs recorded</p>
          </div>
        ) : (
          [...state.logs].reverse().map((log) => (
            <div key={log.id} className="border border-white/5 rounded-lg overflow-hidden bg-white/[0.01]">
              <div 
                onClick={() => log.data && toggleLog(log.id)}
                className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-white/[0.03] transition-colors ${log.data ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="mt-0.5">
                  {log.type === 'success' && <CheckCircle size={14} className="text-emerald-500" />}
                  {log.type === 'error' && <AlertCircle size={14} className="text-red-500" />}
                  {log.type === 'warning' && <AlertCircle size={14} className="text-yellow-500" />}
                  {log.type === 'data' && <Database size={14} className="text-blue-500" />}
                  {log.type === 'info' && <Info size={14} className="text-zinc-500" />}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[10px] font-mono text-zinc-600">{log.timestamp}</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1 rounded ${
                      log.type === 'success' ? 'text-emerald-500 bg-emerald-500/10' :
                      log.type === 'error' ? 'text-red-500 bg-red-500/10' :
                      log.type === 'warning' ? 'text-yellow-500 bg-yellow-500/10' :
                      log.type === 'data' ? 'text-blue-500 bg-blue-500/10' :
                      'text-zinc-500 bg-zinc-500/10'
                    }`}>
                      {log.type}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed break-words">{log.message}</p>
                </div>
                {log.data && (
                  <div className="text-zinc-600">
                    {expandedLogs.has(log.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                )}
              </div>

              {/* Data Preview */}
              {log.data && expandedLogs.has(log.id) && (
                <div className="border-t border-white/5 bg-black p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Output Data Payload</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); copyToClipboard(log.data); }}
                      className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-white transition-colors"
                    >
                      <Copy size={12} />
                      Copy JSON
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-blue-400/80 leading-relaxed overflow-x-auto custom-scrollbar p-3 bg-white/[0.02] rounded border border-white/5">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/5 bg-white/[0.01] flex items-center justify-between">
        <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">System Runtime v1.2.0</span>
        <div className="flex gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Live Stream Active</span>
        </div>
      </div>
    </div>
  );
};
