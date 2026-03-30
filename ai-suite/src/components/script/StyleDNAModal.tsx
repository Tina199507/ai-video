import React from 'react';
import { X, FileJson } from 'lucide-react';
import { StyleProfile } from '../../types';

interface StyleDNAModalProps {
  isOpen: boolean;
  onClose: () => void;
  styleProfile: StyleProfile | null;
}

export const StyleDNAModal: React.FC<StyleDNAModalProps> = ({ isOpen, onClose, styleProfile }) => {
  if (!isOpen || !styleProfile) return null;

  const { meta, track_a_script, track_b_visual, track_c_audio } = styleProfile;

  const renderSection = (title: string, data: any) => {
    if (!data) return null;
    return (
      <div className="mb-6">
        <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider border-b border-white/10 pb-2">{title}</h3>
        <div className="grid grid-cols-1 gap-2">
          {Object.entries(data).map(([key, value]) => {
            if (key === '_purpose') return null;
            return (
              <div key={key} className="bg-white/5 p-3 rounded-lg border border-white/5">
                <span className="text-xs font-mono text-zinc-400 block mb-1">{key}</span>
                <div className="text-sm text-zinc-200">
                  {typeof value === 'object' ? (
                    <pre className="text-xs whitespace-pre-wrap font-mono bg-black/30 p-2 rounded mt-1">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  ) : (
                    <span>{String(value)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <FileJson size={20} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Extracted Style DNA</h2>
              <p className="text-xs text-zinc-400">Parameters for downstream generation models</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {meta && renderSection("Meta", meta)}
          {track_a_script && renderSection("Track A: Script", track_a_script)}
          {track_b_visual && renderSection("Track B: Visual", track_b_visual)}
          {track_c_audio && renderSection("Track C: Audio", track_c_audio)}
          
          {(!meta && !track_a_script && !track_b_visual && !track_c_audio) && (
            <div className="text-center p-8 text-zinc-500">
              No detailed Style DNA tracks available for this profile.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
