import React, { useEffect, useState, useCallback } from 'react';
import { useOrbit } from '../context/OrbitContext';
import { usePlayback } from '../context/PlaybackContext';
import Search from './Search';
import Player from './Player';
import Sidebar from './Sidebar';
import { getRecommendations, getTopVideos, getMix } from '../services/monochromeApi';
import { extractDominantColors } from '../utils/colorExtractor';
import TrackCard from './TrackCard';

const Layout = ({ config }) => {
  const { initP2P, status } = useOrbit();
  const { isPlaying, currentTrack, setIsExpanded } = usePlayback();
  const [showSearch, setShowSearch] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    initP2P(config.roomId, config.displayName, config.isHost);
    return () => {
    };
  }, [config, initP2P]);

  // Auto-hide search and extract colors when a track is played
  useEffect(() => {
    if (currentTrack) {
      setShowSearch(false);
      
      // Extract and apply colors
      if (currentTrack.thumbnail) {
        extractDominantColors(currentTrack.thumbnail)
          .then(colors => {
            if (colors && colors.length >= 4) {
              const root = document.documentElement;
              const rgbStr = colors[0]; // "R G B" space-separated

              root.style.setProperty('--color-primary-rgb', rgbStr);
              root.style.setProperty('--color-primary-light-rgb', rgbStr);
              root.style.setProperty('--color-primary-dark-rgb', rgbStr);

              // Full rgb() value — used by all var(--color-primary) references
              root.style.setProperty('--color-primary', `rgb(${rgbStr})`);

              // Ambient blob colors
              root.style.setProperty('--color-1', `rgb(${colors[0]})`);
              root.style.setProperty('--color-2', `rgb(${colors[1]})`);
              root.style.setProperty('--color-3', `rgb(${colors[2]})`);
              root.style.setProperty('--color-4', `rgb(${colors[3]})`);
            }
          })
          .catch(e => console.error('Color extraction failed:', e));
      }
    }
  }, [currentTrack]);


  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col antialiased ${isPlaying ? 'ambient-playing' : ''}`}>
      {status !== 'connected' && (
        <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center gap-6">
          <div className="w-16 h-16 border-4 border-white/10 border-t-white rounded-full animate-spin"></div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Initializing P2P Swarm</h2>
            <p className="text-white/40 text-sm font-medium uppercase tracking-widest animate-pulse">{status}...</p>
          </div>
        </div>
      )}

      {/* Ambient Background — hidden until a track plays */}
      <div id="ambient-layer" className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-black">
        <div
          id="ambient-blobs"
          className="absolute inset-0 w-full h-full mix-blend-screen transition-opacity duration-[2000ms]"
          style={{
            opacity: currentTrack ? 0.55 : 0,
            filter: 'blur(120px) saturate(150%)'
          }}
        >
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
          <div className="blob blob-4"></div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative w-full h-full pb-[60px] lg:pb-0 z-10">
        <main className="w-full h-full flex-1 flex flex-col bg-transparent min-w-0 relative overflow-hidden">
          {/* Header */}
          <header className="bg-black/40 backdrop-blur-xl p-3 lg:p-4 shadow-sm flex items-center justify-between border-b border-white/10 shrink-0 z-40 relative">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-white tracking-wide text-lg lg:text-xl">Bloom</h2>
              <span className="text-white/30 font-bold">•</span>
              <span className="font-bold text-white/30 tracking-wide text-lg lg:text-xl">{config.roomId}</span>
              <button
                title="Copy invite link"
                onClick={() => {
                  const url = `${window.location.origin}?room=${config.roomId}`;
                  navigator.clipboard.writeText(url).catch(() => {});
                }}
                className="text-white/30 hover:text-[var(--color-primary)] transition-colors flex items-center justify-center"
              >
                <span className="material-symbols-rounded text-[26px] leading-none">link</span>
              </button>
            </div>

            <div className="flex-1 max-w-xl mx-8">
              <div className="w-full max-w-md relative group z-[50]">
                <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-[var(--color-primary)] transition-colors">search</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsExpanded(false);
                  }}
                  onFocus={() => {
                    setShowSearch(true);
                    setIsExpanded(false);
                  }}
                  placeholder="Search tracks, albums, videos..."
                  className="w-full h-11 bg-white/[0.06] border border-white/10 rounded-full pl-12 pr-10 text-white focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/40 transition-all shadow-inner"
                />
                {showSearch && (
                  <button 
                    onClick={() => { setShowSearch(false); setSearchQuery(''); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/40 transition-colors"
                  >
                    <span className="material-symbols-rounded text-sm">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Spacer to keep search centered with flex justify-between */}
            <div className="w-[120px] hidden md:block"></div>
          </header>

          <div className="flex-1 relative w-full flex flex-col min-h-0">
             {showSearch ? (
               <Search query={searchQuery} onClose={() => { setShowSearch(false); setSearchQuery(''); }} />
             ) : (
               <div className="flex-1 overflow-y-auto p-6 space-y-12">
                  {!currentTrack ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/20 pointer-events-none">
                      <span className="material-symbols-rounded text-6xl">search</span>
                      <p className="text-sm font-bold uppercase tracking-widest">Type to start searching</p>
                    </div>
                  ) : (
                    <>
                      <RecommendationsFeed track={currentTrack} />
                    </>
                  )}
               </div>
             )}

             <Player />
          </div>
        </main>

        <Sidebar />
      </div>
    </div>
  );
};

const TrendingSection = () => {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getMix('001098c806426de17f57eb9d79b8ec'); // Popular mix seed
        setItems(data.slice(0, 10));
      } catch (e) {
        // Fallback or silent fail
      }
    };
    fetch();
  }, []);
  if (items.length === 0) return null;
  return <HomeSection title="Trending Now" icon="trending_up" items={items} />;
};

const RecommendationsFeed = ({ track }) => {
  const [recs, setRecs] = useState([]);
  const { loadTrack } = usePlayback();

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getRecommendations(track);
        setRecs(data.slice(0, 10));
      } catch (e) {
        // Fallback or silent fail
      }
    };
    fetch();
  }, [track.id]);

  if (recs.length === 0) return null;

  return (
    <div className="space-y-12">
      <HomeSection title={`Because you like ${track.title}`} icon="music_note" items={recs} onItemClick={loadTrack} />
    </div>
  );
};

const HomeSection = ({ title, icon, items, onItemClick }) => (
  <section className="animate-in fade-in slide-in-from-bottom-4 duration-700">
    <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest mb-6 flex items-center gap-2">
      <span className="material-symbols-rounded text-[var(--color-primary)] text-[20px]">{icon}</span>
      {title}
    </h3>
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
      {items.map(track => (
        <TrackCard key={track.id} track={track} onClick={onItemClick ? () => onItemClick(track) : undefined} />
      ))}
    </div>
  </section>
);

export default Layout;
