
import React, { createContext, useContext, ReactNode } from 'react';
import { useStudioEngine } from '../hooks/useStudioEngine';
import { useLanguage } from './LanguageContext';

// Infer the return type of the hook so we don't have to manually type the context
type ProjectContextType = ReturnType<typeof useStudioEngine>;

const ProjectContext = createContext<ProjectContextType | null>(null);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  // Initialize the core engine here. 
  // We pass the current language to the engine so AI prompts can adapt.
  const { language } = useLanguage();
  const engine = useStudioEngine(language);

  return (
    <ProjectContext.Provider value={engine}>
      {children}
    </ProjectContext.Provider>
  );
};

// Custom hook for consuming the context
export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
