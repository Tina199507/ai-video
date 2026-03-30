
import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppView } from '../types';
import { PLACEHOLDER_AVATAR } from '../config/constants';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import { Key } from 'lucide-react';

interface NavBarProps {
  onOpenApiKeyModal: () => void;
}

export const NavBar: React.FC<NavBarProps> = ({ onOpenApiKeyModal }) => {
  const { language, setLanguage, t } = useLanguage();
  const { state } = useProject();
  const location = useLocation();
  const navigate = useNavigate();

  // Map current path to AppView
  const currentView = useMemo(() => {
    const path = location.pathname;
    if (path === '/' || path === '/dashboard') return AppView.DASHBOARD;
    if (path.includes('/style')) return AppView.STYLE;
    if (path.includes('/script')) return AppView.SCRIPTING;
    if (path.includes('/storyboard')) return AppView.STORYBOARD;
    if (path.includes('/editor') || path.includes('/delivery')) return AppView.EDITOR;
    return AppView.DASHBOARD;
  }, [location.pathname]);

  // Dynamic labels based on selected language
  const steps = [
    { view: AppView.STYLE, label: t('nav.init'), icon: "tune", path: '/' },
    { view: AppView.SCRIPTING, label: t('nav.script'), icon: "description", path: '/script', disabled: !state.styleProfile },
    { view: AppView.STORYBOARD, label: t('nav.storyboard'), icon: "view_list", path: '/storyboard', disabled: !state.draftScript },
    { view: AppView.EDITOR, label: t('nav.delivery'), icon: "inventory_2", path: '/editor', disabled: !state.scenes?.length },
  ];

  const currentStepIndex = steps.findIndex(s => s.view === currentView);
  const activeIndex = currentStepIndex === -1 ? 0 : currentStepIndex;

  const hasAnyKey = state.apiKeySet;

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-gray-800 bg-[#101922]/90 backdrop-blur-md h-16 lg:h-20 flex-none">
      <div className="w-full px-6 h-full flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex items-center gap-6 w-1/4 min-w-fit">
          <button onClick={() => handleNavigation('/')} className="flex items-center gap-2 group">
            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <span className="material-icons text-lg lg:text-xl">auto_awesome</span>
            </div>
            <div className="hidden md:flex flex-col items-start">
              <span className="font-bold text-lg lg:text-xl tracking-tight text-white leading-none">{t('nav.title')}</span>
              <span className="text-[9px] text-primary uppercase font-mono tracking-widest leading-none mt-1">{t('nav.subtitle')}</span>
            </div>
          </button>
          
          <div className="h-6 w-px bg-gray-700 hidden lg:block mx-2"></div>
          
          <div className="flex items-center text-sm text-gray-400 gap-2 hidden lg:flex font-medium">
             <span className="text-zinc-500 material-icons text-[16px]">folder_open</span>
             <span className="hover:text-white cursor-pointer transition-colors max-w-[200px] truncate text-zinc-300">
                {state.projectTitle || t('nav.project')}
             </span>
          </div>
        </div>

        {/* Center: Stepper */}
        <div className="flex-1 flex justify-center items-center px-4">
          <div className="flex items-center w-full max-w-lg">
            {steps.map((step, idx) => {
              const isActive = idx === activeIndex;
              const isCompleted = idx < activeIndex;
              const isDisabled = step.disabled;
              
              return (
                <React.Fragment key={step.view}>
                  <div 
                    onClick={() => !isDisabled && handleNavigation(step.path)}
                    className={`flex flex-col items-center gap-1 group relative cursor-pointer ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
                      ${isCompleted ? 'bg-green-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 
                        isActive ? 'bg-primary text-white shadow-glow ring-2 ring-primary/20 scale-110' : 
                        'bg-[#1c2936] text-gray-500 border border-gray-700'}`}>
                      <span className="material-icons text-sm">{isCompleted ? 'check' : step.icon}</span>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider absolute -bottom-5 whitespace-nowrap transition-colors
                      ${isCompleted ? 'text-green-500' : isActive ? 'text-primary' : 'text-gray-600'}`}>
                      {step.label}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`flex-grow h-[2px] mx-2 rounded-full transition-colors duration-500
                      ${idx < activeIndex ? 'bg-green-500' : 'bg-gray-800'}`}>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Right: User & Language Switcher */}
        <div className="w-1/4 flex justify-end items-center gap-6 min-w-fit">
          {/* API Key Manager Replaces Credits */}
          <div className="hidden xl:flex items-center">
              <button 
                onClick={onOpenApiKeyModal}
                className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg transition-all group ${hasAnyKey ? 'bg-zinc-900/50 hover:bg-zinc-800 border-zinc-700/50' : 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20'}`}
                title="Manage API Keys"
              >
                <Key size={16} className={`transition-colors ${hasAnyKey ? 'text-zinc-400 group-hover:text-primary' : 'text-blue-400'}`} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${hasAnyKey ? 'text-zinc-400 group-hover:text-zinc-200' : 'text-blue-400'}`}>
                    {hasAnyKey ? t('nav.api_keys') : t('nav.connect_api')}
                </span>
              </button>
          </div>
          
          <div className="flex items-center gap-4 pl-4 border-l border-gray-700/50">
             {/* Language Switcher */}
             <div className="flex items-center bg-black/40 border border-gray-700 rounded-lg p-1 gap-1">
                <button 
                  onClick={() => setLanguage('en')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all duration-300 ${language === 'en' ? 'bg-zinc-700 text-white shadow-lg shadow-black/50' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                >
                  EN
                </button>
                <button 
                  onClick={() => setLanguage('zh')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all duration-300 ${language === 'zh' ? 'bg-primary text-white shadow-[0_0_10px_rgba(139,92,246,0.4)]' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                >
                  中
                </button>
             </div>

             <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 p-[2px] cursor-pointer hover:shadow-glow transition-all">
               <img src={PLACEHOLDER_AVATAR} alt="Profile" className="w-full h-full rounded-full object-cover bg-gray-900" />
             </div>
          </div>
        </div>
      </div>
    </nav>
  );
};
