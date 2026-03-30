import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/Button';

interface TopBarProps {
  title: string;
  subtitle?: string;
  centerContent?: React.ReactNode;
  actions?: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = ({ 
  title, 
  subtitle, 
  centerContent, 
  actions 
}) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 w-full h-16 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5 z-40 flex items-center justify-between px-6 animate-fade-in flex-none">
      {/* Left: Context */}
      <div className="flex items-center gap-4 min-w-[200px]">
        <div>
          <h1 className="text-sm font-bold text-white uppercase tracking-wider font-display">{title}</h1>
          {subtitle && <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {/* Center: Status/Config */}
      <div className="flex-1 flex justify-center items-center gap-4">
        {centerContent}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center justify-end gap-3 min-w-[200px]">
        {actions}
      </div>
    </header>
  );
};
