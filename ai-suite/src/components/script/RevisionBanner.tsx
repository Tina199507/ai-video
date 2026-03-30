import React from 'react';
import { AlertCircle } from 'lucide-react';

interface RevisionBannerProps {
  instructions: string;
}

export const RevisionBanner: React.FC<RevisionBannerProps> = ({ instructions }) => {
  if (!instructions) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6 animate-in slide-in-from-top-2">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">
            Revision Instructions
          </h3>
          <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {instructions}
          </p>
        </div>
      </div>
    </div>
  );
};
