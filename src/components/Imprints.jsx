import React, { useEffect } from 'react';

const IMPRINT_GROUPS = [
  {
    category: 'Decentralized P2P & Data Mesh',
    items: [
      { name: 'OrbitDB', role: 'Peer-to-Peer Key-Value & EventLog Database', desc: 'Powers real-time room playback state synchronization and distributed live chat across peers.' },
      { name: 'Helia / IPFS', role: 'Decentralized Block Storage & Content Addressing', desc: 'Enables decentralized block storing and immutable data integrity for P2P music sessions.' },
      { name: 'libp2p', role: 'Modular P2P Networking & Transport Suite', desc: 'Provides resilient browser-to-browser peer discovery, WebRTC streams, and circuit relays.' },
    ]
  },
  {
    category: 'Decentralized Relay Infrastructure',
    items: [
      { name: 'Nostr Protocol (NIP-53)', role: 'Live Activities & Decentralized Room Beacons', desc: 'Facilitates global public party discovery without centralized servers or tracking.' },
      { name: 'Nostr Relay Network', role: 'Distributed WebSocket Relay Pool', desc: 'Relays host heartbeats across damus.io, nos.lol, bravas.me, primal.net, and global relays.' },
    ]
  },
  {
    category: 'Audio Engines & Media APIs',
    items: [
      { name: 'Web Audio API', role: 'Real-time WebAudio Graph & AnalyserNode', desc: 'Drives low-latency audio processing, AnalyserNode frequency analysis, and dynamic visualizers.' },
      { name: 'Piped & Invidious APIs', role: 'Distributed Audio Stream Resolvers', desc: 'Fetches high-fidelity audio streams, track metadata, search indices, and recommendations.' },
      { name: 'LRCLIB API', role: 'Synchronized Lyrics Provider', desc: 'Delivers word-by-word timed lyrics for thousands of songs in real time.' },
      { name: 'Tenor & Giphy APIs', role: 'Rich Media & Chat GIF Search Engine', desc: 'Powers inline GIF searching and animated reactions inside the P2P chat.' },
    ]
  },
  {
    category: 'Infrastructure & Services',
    items: [
      { name: 'GeoJS API', role: 'Privacy-Preserving Geolocation Service', desc: 'Resolves anonymous regional airport codes for room timestamps without user tracking.' },
      { name: 'Netlify Serverless Functions', role: 'Distributed API Functions & Edge Proxying', desc: 'Handles CORS proxying, stream resolution, playlist parsing, and search aggregation.' },
    ]
  },
  {
    category: 'Framework & Design System',
    items: [
      { name: 'React 18 & Vite 6', role: 'UI Application Framework & High-Speed Bundler', desc: 'Delivers fluid UI state management, context architecture, and instant development builds.' },
      { name: 'TailwindCSS v3', role: 'Utility-First Styling & Glassmorphic Design', desc: 'Drives custom color tokens, responsive layouts, dynamic glass panels, and smooth transitions.' },
      { name: 'Google Material Symbols & Lucide', role: 'Universal Iconography Suite', desc: 'Crisp, rounded material iconography across the music player and control interfaces.' },
    ]
  }
];

const Imprints = ({ onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/85 backdrop-blur-2xl animate-fade-in overflow-hidden select-none">
      
      {/* Top Bar - Close Button Only (No top-left heading, no stroke, no play/pause button) */}
      <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-end z-50 pointer-events-auto">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition-colors shadow-lg"
          title="Close Imprints (Esc)"
        >
          <span className="material-symbols-rounded text-xl">close</span>
        </button>
      </div>

      {/* Progressive Blur / Gradient Overlays (Top & Bottom) */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-black via-black/80 to-transparent z-40 backdrop-blur-[2px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black via-black/80 to-transparent z-40 backdrop-blur-[2px]" />

      {/* Rolling Credits Motion Container */}
      <div className="w-full max-w-2xl h-full overflow-hidden relative flex flex-col items-center mask-image-y px-4">
        <div 
          className="w-full flex flex-col items-center space-y-16 py-12 text-center"
          style={{
            animation: 'imprintsRoll 36s cubic-bezier(0.1, 0, 0.25, 1) forwards'
          }}
        >
          {/* Main Heading in the List Itself */}
          <div className="text-center pt-28 pb-6 max-w-xl flex flex-col items-center">
            <span className="text-xs font-semibold text-[var(--color-primary,#ec4899)] mb-2">
              Bloom Architecture & Imprints
            </span>
            <h1 
              className="text-4xl sm:text-5xl text-white font-serif tracking-tight leading-tight mb-4"
              style={{ fontFamily: '"Gloock", serif', fontWeight: 400 }}
            >
              Built on Open & Decentralized Foundations
            </h1>
            <p className="text-white/50 text-sm leading-relaxed max-w-lg">
              Bloom is crafted without centralized tracking or walled gardens. 
              We stand on the shoulders of open-source projects, peer-to-peer databases, and independent media protocols.
            </p>
            <div className="mt-8 text-white/20 text-xs tracking-[0.4em]">
              •••
            </div>
          </div>

          {/* Imprint Category Groups */}
          {IMPRINT_GROUPS.map((group, groupIdx) => (
            <div key={groupIdx} className="w-full flex flex-col items-center text-center">
              {/* Category Title in Gloock font */}
              <h2 
                className="text-2xl text-white/90 font-serif mb-8"
                style={{ fontFamily: '"Gloock", serif', fontWeight: 400 }}
              >
                {group.category}
              </h2>

              {/* Items in Category - Seamless centered text without box containers or stroke */}
              <div className="w-full flex flex-col gap-8 items-center">
                {group.items.map((item, itemIdx) => (
                  <div key={itemIdx} className="flex flex-col items-center max-w-lg px-4 text-center">
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5 mb-1.5">
                      <span className="text-lg font-bold text-white tracking-wide">{item.name}</span>
                      <span className="hidden sm:inline text-white/30 text-xs">•</span>
                      <span className="text-white/50 text-xs font-medium">
                        {item.role}
                      </span>
                    </div>
                    <p className="text-white/40 text-xs leading-relaxed max-w-md">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="mt-12 text-white/20 text-xs tracking-[0.4em]">
                •••
              </div>
            </div>
          ))}

          {/* Final Thank You Section - Stops exactly in the vertical center */}
          <div className="text-center pt-8 pb-4 max-w-md flex flex-col items-center shrink-0">
            {/* Heart Icon with Red Color (no container box, no stroke) */}
            <span 
              className="material-symbols-rounded icon-fill text-4xl mb-3"
              style={{ color: '#ef4444' }}
            >
              favorite
            </span>

            <h3 
              className="text-3xl text-white font-serif mb-2"
              style={{ fontFamily: '"Gloock", serif', fontWeight: 400 }}
            >
              Thank You for Listening
            </h3>
            
            <p className="text-white/40 text-xs leading-relaxed max-w-sm mb-6">
              Keep the music peer-to-peer. Enjoy your sound experience on Bloom.
            </p>

            <button
              onClick={onClose}
              className="bg-white hover:bg-white/90 text-black px-6 py-2.5 rounded-full font-bold text-sm transition-colors shadow-xl"
            >
              Back to Lobby
            </button>
          </div>

        </div>
      </div>

      {/* Animation Keyframes: Stops with the Thank You section in vertical center */}
      <style>{`
        @keyframes imprintsRoll {
          0% {
            transform: translateY(75vh);
          }
          100% {
            transform: translateY(calc(-100% + 62vh));
          }
        }
      `}</style>
    </div>
  );
};

export default Imprints;
