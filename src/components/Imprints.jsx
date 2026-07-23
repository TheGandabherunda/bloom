import React, { useEffect, useState } from 'react';

const IMPRINT_GROUPS = [
  {
    category: 'Decentralized P2P & Data Mesh',
    icon: 'hub',
    items: [
      { name: 'OrbitDB', role: 'Peer-to-Peer Key-Value & EventLog Database', desc: 'Powers real-time room playback state synchronization and distributed live chat across peers.' },
      { name: 'Helia / IPFS', role: 'Decentralized Block Storage & Content Addressing', desc: 'Enables decentralized block storing and immutable data integrity for P2P music sessions.' },
      { name: 'libp2p', role: 'Modular P2P Networking & Transport Suite', desc: 'Provides resilient browser-to-browser peer discovery, WebRTC streams, and circuit relays.' },
    ]
  },
  {
    category: 'Decentralized Relay Infrastructure',
    icon: 'sensors',
    items: [
      { name: 'Nostr Protocol (NIP-53)', role: 'Live Activities & Decentralized Room Beacons', desc: 'Facilitates global public party discovery without centralized servers or tracking.' },
      { name: 'Nostr Relay Network', role: 'Distributed WebSocket Relay Pool', desc: 'Relays host heartbeats across damus.io, nos.lol, bravas.me, primal.net, and global relays.' },
    ]
  },
  {
    category: 'Audio Engines & Media APIs',
    icon: 'graphic_eq',
    items: [
      { name: 'Web Audio API', role: 'Real-time WebAudio Graph & AnalyserNode', desc: 'Drives low-latency audio processing, AnalyserNode frequency analysis, and dynamic visualizers.' },
      { name: 'Piped / Invidious APIs', role: 'Distributed Audio Stream Resolvers', desc: 'Fetches high-fidelity audio streams, track metadata, search indices, and recommendations.' },
      { name: 'LRCLIB API', role: 'Synchronized Lyrics Provider', desc: 'Delivers word-by-word timed lyrics for thousands of songs in real time.' },
      { name: 'Tenor & Giphy APIs', role: 'Rich Media & Chat GIF Search Engine', desc: 'Powers inline GIF searching and animated reactions inside the P2P chat.' },
    ]
  },
  {
    category: 'Infrastructure & Services',
    icon: 'cloud',
    items: [
      { name: 'GeoJS API', role: 'Privacy-Preserving Geolocation Service', desc: 'Resolves anonymous regional airport codes for room timestamps without user tracking.' },
      { name: 'Netlify Serverless Functions', role: 'Distributed API Functions & Edge Proxying', desc: 'Handles CORS proxying, stream resolution, playlist parsing, and search aggregation.' },
    ]
  },
  {
    category: 'Framework & Design System',
    icon: 'code',
    items: [
      { name: 'React 18 & Vite 6', role: 'UI Application Framework & High-Speed Bundler', desc: 'Delivers fluid UI state management, context architecture, and instant development builds.' },
      { name: 'TailwindCSS v3', role: 'Utility-First Styling & Glassmorphic Design', desc: 'Drives custom color tokens, responsive layouts, dynamic glass panels, and smooth transitions.' },
      { name: 'Google Material Symbols & Lucide', role: 'Universal Iconography Suite', desc: 'Crisp, rounded material iconography across the music player and control interfaces.' },
    ]
  },
  {
    category: 'Special Thanks & Gratitude',
    icon: 'favorite',
    items: [
      { name: 'Open Source Community', role: 'Pioneers of the Decentralized Web', desc: 'To all developers creating open APIs, privacy-first protocols, and independent software standards.' },
      { name: 'Bloom Listeners & Hosts', role: 'Every Room Host & Music Lover', desc: 'Thank you for building communities, hosting live music parties, and sharing sound together.' },
    ]
  }
];

const Imprints = ({ onClose }) => {
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/85 backdrop-blur-2xl animate-fade-in overflow-hidden select-none">
      
      {/* Top Header & Close Button Bar */}
      <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-50 pointer-events-auto bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white shadow-lg">
            <span className="material-symbols-rounded text-xl">auto_awesome</span>
          </div>
          <div>
            <h2 className="text-white font-bold text-lg tracking-wider uppercase">Imprints & Credits</h2>
            <p className="text-white/40 text-xs">Gratitude to open protocols, APIs, and P2P technologies</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPaused(prev => !prev)}
            className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white/70 hover:text-white text-xs font-semibold transition-all flex items-center gap-1.5"
            title={isPaused ? "Resume scrolling" : "Pause scrolling"}
          >
            <span className="material-symbols-rounded text-[16px]">
              {isPaused ? 'play_arrow' : 'pause'}
            </span>
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
          
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all shadow-lg hover:scale-105"
            title="Close Imprints (Esc)"
          >
            <span className="material-symbols-rounded text-xl">close</span>
          </button>
        </div>
      </div>

      {/* Progressive Blur / Gradient Overlays (Top & Bottom) */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-black via-black/80 to-transparent z-40 backdrop-blur-[2px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black via-black/80 to-transparent z-40 backdrop-blur-[2px]" />

      {/* Rolling Credits Motion Container */}
      <div 
        className="w-full max-w-3xl h-full overflow-hidden relative flex flex-col items-center mask-image-y px-4"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div 
          className="w-full flex flex-col items-center space-y-16 py-12"
          style={{
            animation: 'imprintsRoll 45s linear infinite',
            animationPlayState: isPaused ? 'paused' : 'running'
          }}
        >
          {/* Opening Header */}
          <div className="text-center pt-24 pb-8 max-w-xl">
            <span className="text-xs font-bold uppercase tracking-[0.4em] text-[var(--color-primary,#ec4899)] mb-3 block">
              Bloom Architecture & Imprints
            </span>
            <h1 
              className="text-4xl sm:text-5xl text-white font-serif tracking-tight leading-tight mb-4"
              style={{ fontFamily: '"Gloock", serif', fontWeight: 400 }}
            >
              Built on Open & Decentralized Foundations
            </h1>
            <p className="text-white/50 text-sm leading-relaxed">
              Bloom is crafted without centralized tracking, walled gardens, or middle management. 
              We stand on the shoulders of open-source projects, peer-to-peer databases, and independent media protocols.
            </p>
            <div className="mt-8 flex items-center justify-center gap-2 text-white/30 text-xs tracking-widest">
              <span>•••</span>
            </div>
          </div>

          {/* Imprint Group Cards */}
          {IMPRINT_GROUPS.map((group, groupIdx) => (
            <div key={groupIdx} className="w-full flex flex-col items-center">
              {/* Category Title Header */}
              <div className="flex items-center gap-2.5 mb-6 text-white/90">
                <span className="material-symbols-rounded text-xl text-[var(--color-primary,#ec4899)]">{group.icon}</span>
                <h3 className="font-bold text-lg tracking-wider uppercase text-white/80">{group.category}</h3>
              </div>

              {/* Items in Category */}
              <div className="w-full flex flex-col gap-4">
                {group.items.map((item, itemIdx) => (
                  <div 
                    key={itemIdx}
                    className="w-full bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 p-6 rounded-2xl transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4 backdrop-blur-md shadow-xl"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h4 className="text-xl font-bold text-white tracking-wide">{item.name}</h4>
                        <span className="text-white/20 text-xs">•</span>
                        <span className="text-white/60 text-xs font-medium bg-white/10 px-2.5 py-0.5 rounded-full">
                          {item.role}
                        </span>
                      </div>
                      <p className="text-white/40 text-xs leading-relaxed mt-1">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-12 text-white/20 text-xs tracking-[0.4em]">
                •••
              </div>
            </div>
          ))}

          {/* Closing Footer Card */}
          <div className="text-center pt-12 pb-36 max-w-md flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white mb-4 shadow-2xl">
              <span className="material-symbols-rounded text-2xl">graphic_eq</span>
            </div>
            <h3 className="text-white font-bold text-2xl tracking-wide">Thank You for Listening</h3>
            <p className="text-white/40 text-xs mt-2 leading-relaxed">
              Keep the music peer-to-peer. Enjoy your sound experience on Bloom.
            </p>
            <button
              onClick={onClose}
              className="mt-6 bg-white hover:bg-white/90 text-black px-6 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider transition-all hover:scale-105 shadow-xl"
            >
              Back to Lobby
            </button>
          </div>

        </div>
      </div>

      {/* Keyframe animation inline style */}
      <style>{`
        @keyframes imprintsRoll {
          0% {
            transform: translateY(60vh);
          }
          100% {
            transform: translateY(-100%);
          }
        }
      `}</style>
    </div>
  );
};

export default Imprints;
