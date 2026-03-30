
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProjectProvider } from './context/ProjectContext';
import { LanguageProvider } from './context/LanguageContext';
import Layout from './components/Layout';
import StylePage from './pages/StylePage';
import ScriptPage from './pages/ScriptPage';
import StoryboardPage from './pages/StoryboardPage';
import EditorPage from './pages/EditorPage';

const App: React.FC = () => {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider>
        <ProjectProvider>
          <Routes>
            {/* All pages wrapped in Layout for consistent Navigation */}
            <Route element={<Layout />}>
               <Route path="/" element={<StylePage />} />
               <Route path="/script" element={<ScriptPage />} />
               <Route path="/storyboard" element={<StoryboardPage />} />
               <Route path="/editor" element={<EditorPage />} />
            </Route>
            
            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ProjectProvider>
      </LanguageProvider>
    </HashRouter>
  );
};

export default App;
