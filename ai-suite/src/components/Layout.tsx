import React from 'react';
import { Outlet } from 'react-router-dom';
import { NavBar } from './NavBar';
import { promptApiKeySelection } from '../services/core';

export default function Layout() {
  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Top Navigation */}
      <NavBar onOpenApiKeyModal={promptApiKeySelection} />

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>
        <Outlet />
      </main>
    </div>
  );
}
