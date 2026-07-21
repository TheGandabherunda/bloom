import React, { useEffect, useState, useCallback } from 'react';
import { useOrbit } from '../context/OrbitContext';
import { usePlayback } from '../context/PlaybackContext';
import Search from './Search';
import Player from './Player';
import Sidebar from './Sidebar';
import { getRecommendations, getTopVideos, getMix } from '../services/monochromeApi';
import { extractDominantColors, extractPrimaryColor } from '../utils/colorExtractor';
import TrackCard from './TrackCard';
import { AppInitSkeleton, TrackGridSkeleton } from './Skeleton';

const Layout = ({ config }) => {
  const { initP2P, status } = useOrbit();
  const { isPlaying, currentTrack, setIsExpanded } = usePlayback();
  const [showSearch, setShowSearch] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMobileView, setActiveMobileView] = useState('home');
  const [activeSidebarTab, setActiveSidebarTab] = useState('queue');

  useEffect(() => {
    initP2P(config.roomId, config.displayName, config.isHost);
    return () => {
    };
  }, [config, initP2P]);

  // Auto-hide search and extract colors when a track is played
  useEffect(() => {
    if (currentTrack) {
      setShowSearch(false);
      
      const root = document.documentElement;
      // Clear old colors immediately for a smooth transition to neutral before the new colors load
      root.style.setProperty('--color-1', 'rgb(30, 30, 30)');
      root.style.setProperty('--color-2', 'rgb(40, 40, 40)');
      root.style.setProperty('--color-3', 'rgb(20, 20, 20)');
      root.style.setProperty('--color-4', 'rgb(50, 50, 50)');
      root.style.setProperty('--color-primary', 'rgb(100, 100, 100)');
      root.style.setProperty('--color-primary-rgb', '100 100 100');
      
      // Extract and apply colors
      if (currentTrack.thumbnail) {
        // Ambient background blobs
        extractDominantColors(currentTrack.thumbnail)
          .then(colors => {
            if (colors && colors.rawRgbStrings && colors.rawRgbStrings.length >= 4) {
              root.style.setProperty('--color-1', `rgb(${colors.rawRgbStrings[0].split(' ').join(', ')})`);
              root.style.setProperty('--color-2', `rgb(${colors.rawRgbStrings[1].split(' ').join(', ')})`);
              root.style.setProperty('--color-3', `rgb(${colors.rawRgbStrings[2].split(' ').join(', ')})`);
              root.style.setProperty('--color-4', `rgb(${colors.rawRgbStrings[3].split(' ').join(', ')})`);
            }
          })
          .catch(e => console.error('Dominant color extraction failed:', e));

        // Vibrant UI primary color
        extractPrimaryColor(currentTrack.thumbnail)
          .then(color => {
            if (color) {
              // Extract just the RGB numbers from "rgb(R, G, B)"
              const m = color.match(/\d+/g);
              if (m && m.length >= 3) {
                 const rgbStr = `${m[0]} ${m[1]} ${m[2]}`;
                 root.style.setProperty('--color-primary-rgb', rgbStr);
                 root.style.setProperty('--color-primary-light-rgb', rgbStr);
                 root.style.setProperty('--color-primary-dark-rgb', rgbStr);
              }
              root.style.setProperty('--color-primary', color);
            }
          })
          .catch(e => console.error('Primary color extraction failed:', e));
      }
    }
  }, [currentTrack]);


  return (
    <div className={`h-[100dvh] w-screen overflow-hidden flex flex-col antialiased ${isPlaying ? 'ambient-playing' : ''}`}>
      {status !== 'connected' && (
        <AppInitSkeleton status={status} />
      )}

      {/* Ambient Background — hidden until a track plays */}
      <div id="ambient-layer" className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-black">
        <div
          id="ambient-blobs"
          className="absolute inset-0 w-full h-full mix-blend-screen transition-opacity duration-[2000ms]"
          style={{
            opacity: currentTrack ? 0.55 : 0,
            filter: typeof window !== 'undefined' && window.innerWidth < 768 ? 'saturate(150%)' : 'blur(40px) saturate(150%)',
            transform: 'translateZ(0)',
          }}
        >
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
          <div className="blob blob-4"></div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative w-full h-full pb-[137px] lg:pb-0 z-10">
        <main className={`w-full h-full flex-1 flex flex-col bg-transparent min-w-0 relative overflow-hidden ${activeMobileView !== 'home' ? 'hidden lg:flex' : 'flex'}`}>
          {/* Header */}
          <header className="bg-black/40 backdrop-blur-xl p-3 lg:p-4 shadow-sm flex items-center justify-between border-b border-white/10 shrink-0 z-40 relative">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-white tracking-wide text-lg lg:text-xl">Bloom</h2>
              <span className="text-white/30 font-bold">•</span>
              <span className="font-bold text-white/30 tracking-wide text-lg lg:text-xl">{config.roomId}</span>
              <button
                title="Copy invite link"
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}#${config.roomId}`;
                  navigator.clipboard.writeText(url).catch(() => {});
                }}
                className="text-white/30 hover:text-[var(--color-primary)] transition-colors flex items-center justify-center"
              >
                <span className="material-symbols-rounded text-[26px] leading-none">link</span>
              </button>
            </div>

            <div className="flex-1 max-w-xl mx-8 hidden lg:block">
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

            {/* Spacer to keep search centered with flex justify-between on desktop */}
            <div className="w-[120px] hidden lg:block"></div>
          </header>

          {/* Mobile Search Bar (Below Header) */}
          <div className="lg:hidden p-3 bg-black/20 border-b border-white/5 relative z-30 shrink-0">
            <div className="w-full relative group">
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

          <div className="flex-1 relative w-full flex flex-col min-h-0">
             {showSearch ? (
               <Search query={searchQuery} onClose={() => { setShowSearch(false); setSearchQuery(''); }} />
             ) : (
               <div className="flex-1 overflow-y-auto p-6 pb-[90px] space-y-12">
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

           </div>
        </main>
        
        <Player />

        <Sidebar 
          activeTab={activeSidebarTab} 
          setActiveTab={setActiveSidebarTab} 
          className={activeMobileView !== 'home' ? 'flex' : 'hidden lg:flex'} 
        />
        
        {/* Bottom Navigation for Mobile */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 h-[60px] bg-black/80 backdrop-blur-3xl border-t border-white/10 z-[100] flex items-center justify-around px-2">
          <button 
            onClick={() => setActiveMobileView('home')} 
            className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeMobileView === 'home' ? 'text-[var(--color-primary)]' : 'text-white/40 hover:text-white/70'}`}
          >
            <span className="material-symbols-rounded text-[24px]">home</span>
            <span className="text-[9px] font-bold tracking-widest mt-1">HOME</span>
          </button>
          <button 
            onClick={() => { setActiveMobileView('queue'); setActiveSidebarTab('queue'); }} 
            className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeMobileView === 'queue' ? 'text-[var(--color-primary)]' : 'text-white/40 hover:text-white/70'}`}
          >
            <span className="material-symbols-rounded text-[24px]">queue_music</span>
            <span className="text-[9px] font-bold tracking-widest mt-1">QUEUE</span>
          </button>
          <button 
            onClick={() => { setActiveMobileView('chat'); setActiveSidebarTab('chat'); }} 
            className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeMobileView === 'chat' ? 'text-[var(--color-primary)]' : 'text-white/40 hover:text-white/70'}`}
          >
            <span className="material-symbols-rounded text-[24px]">chat</span>
            <span className="text-[9px] font-bold tracking-widest mt-1">CHAT</span>
          </button>
          <button 
            onClick={() => { setActiveMobileView('peers'); setActiveSidebarTab('peers'); }} 
            className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeMobileView === 'peers' ? 'text-[var(--color-primary)]' : 'text-white/40 hover:text-white/70'}`}
          >
            <span className="material-symbols-rounded text-[24px]">people</span>
            <span className="text-[9px] font-bold tracking-widest mt-1">PEERS</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const TrendingSection = () => {
  const [items, setItems] = useState([]);
  const { loadTrack, addToQueue } = usePlayback();
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
  return <HomeSection title="Trending Now" icon="trending_up" items={items} onItemClick={(track) => loadTrack(track, -1)} addToQueue={addToQueue} />;
};

const RecommendationsFeed = ({ track }) => {
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const { loadTrack, addToQueue } = usePlayback();

  useEffect(() => {
    setLoading(true);
    setRecs([]);
    const fetch = async () => {
      try {
        const data = await getRecommendations(track);
        setRecs(data.slice(0, 10));
      } catch (e) {
        // Fallback or silent fail
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [track.id]);

  if (loading) return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="h-4 w-56 shimmer rounded-lg" />
      <TrackGridSkeleton count={10} />
    </div>
  );

  if (recs.length === 0) return null;

  return (
    <div className="space-y-12">
      <HomeSection title={`Because you like ${track.title}`} icon="music_note" items={recs} onItemClick={loadTrack} addToQueue={addToQueue} />
    </div>
  );
};

const HomeSection = ({ title, icon, items, onItemClick, addToQueue }) => (
  <section className="animate-in fade-in slide-in-from-bottom-4 duration-700">
    <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest mb-6 flex items-center gap-2">
      <span className="material-symbols-rounded text-[var(--color-primary)] text-[20px]">{icon}</span>
      {title}
    </h3>
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
      {items.map(track => (
        <TrackCard key={track.id} track={track} addToQueue={addToQueue} onClick={onItemClick ? () => onItemClick(track) : undefined} />
      ))}
    </div>
  </section>
);

export default Layout;
