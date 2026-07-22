import React, { useState } from 'react';
import Queue from './Queue';
import Chat from './Chat';
import PeersList from './PeersList';

const Sidebar = ({ activeTab = 'queue', setActiveTab, className = '' }) => {
  return (
    <aside className={`w-full h-full lg:w-[400px] flex flex-col bg-black/30 backdrop-blur-3xl border-l border-white/10 shadow-2xl relative z-50 ${className}`}>
      <div className="hidden lg:flex items-center gap-1 p-3 border-b border-white/[0.06] shrink-0">
        <button
          onClick={() => setActiveTab('queue')}
          className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'queue' ? 'bg-white/10 text-white shadow-inner' : 'text-white/40 hover:text-white/70'}`}
        >
          <span className="material-symbols-rounded text-[26px] leading-none">queue_music</span>
          Queue
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'chat' ? 'bg-white/10 text-white shadow-inner' : 'text-white/40 hover:text-white/70'}`}
        >
          <span className="material-symbols-rounded text-[26px] leading-none">chat</span>
          Chat
        </button>
        <button
          onClick={() => setActiveTab('peers')}
          title="Peers"
          className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full transition-all ${activeTab === 'peers' ? 'bg-white/10 text-white shadow-inner bg-[var(--color-primary)]' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
        >
          <span className="material-symbols-rounded text-[26px] leading-none">people</span>
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === 'queue' && <Queue />}
        {activeTab === 'chat' && <Chat />}
        {activeTab === 'peers' && <PeersList />}
      </div>
    </aside>
  );
};

export default Sidebar;
