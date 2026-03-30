import React from 'react';
import { Activity, Clock, Type } from 'lucide-react';

interface CalibrationPanelProps {
  calibration?: {
    reference_total_words: number;
    reference_duration_sec: number;
    actual_speech_rate: string;
    new_video_target_duration_sec: number;
    target_word_count: number;
    target_word_count_min: string;
    target_word_count_max: string;
  };
  currentWordCount: number;
}

export const CalibrationPanel: React.FC<CalibrationPanelProps> = ({ calibration, currentWordCount }) => {
  if (!calibration) return null;

  // Parse min/max from string (e.g. "504" or "504 words")
  const min = parseInt(calibration.target_word_count_min.replace(/\D/g, '')) || 0;
  const max = parseInt(calibration.target_word_count_max.replace(/\D/g, '')) || 0;
  const target = calibration.target_word_count;

  // Calculate progress percentage relative to target
  const progress = Math.min(100, Math.max(0, (currentWordCount / target) * 100));
  
  // Determine status color
  let statusColor = "bg-zinc-600";
  let statusText = "In Progress";
  
  if (currentWordCount < min) {
    statusColor = "bg-amber-500";
    statusText = "Too Short";
  } else if (currentWordCount > max) {
    statusColor = "bg-red-500";
    statusText = "Too Long";
  } else {
    statusColor = "bg-emerald-500";
    statusText = "On Target";
  }

  return (
    <div className="bg-zinc-900/50 border-b border-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <Activity size={12} />
          Calibration
        </h3>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${statusColor.replace('bg-', 'text-')} bg-white/5`}>
          {statusText}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-black/20 p-2 rounded border border-white/5">
          <div className="text-zinc-500 text-[10px] mb-0.5 flex items-center gap-1">
            <Clock size={10} /> Speech Rate
          </div>
          <div className="text-zinc-300 font-mono">{calibration.actual_speech_rate}</div>
        </div>
        <div className="bg-black/20 p-2 rounded border border-white/5">
          <div className="text-zinc-500 text-[10px] mb-0.5 flex items-center gap-1">
            <Type size={10} /> Target Range
          </div>
          <div className="text-zinc-300 font-mono">{min} - {max} chars</div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-zinc-500">
          <span>Current: {currentWordCount}</span>
          <span>Target: {target}</span>
        </div>
        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className={`h-full ${statusColor} transition-all duration-500`} 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
