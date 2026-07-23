import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useOrbit } from '../context/OrbitContext';
import { usePlayback } from '../context/PlaybackContext';
import Search from './Search';
import Player from './Player';
import Sidebar from './Sidebar';
import { getRecommendations, getTopVideos, getMix, getTrendingByLocation } from '../services/musicApi';
import { extractDominantColors, extractPrimaryColor } from '../utils/colorExtractor';
import TrackCard from './TrackCard';
import { AppInitSkeleton, TrackGridSkeleton } from './Skeleton';

const Layout = ({ config, onLeave, onMinimize }) => {
  const { initP2P, stopP2P, status, peerId, peerRoles, getConnectedRelays, deleteRoom } = useOrbit();
  const { isPlaying, currentTrack, setIsExpanded, loadTrack, addToQueue, stopPlayback, error, togglePlay } = usePlayback();
  const [showSearch, setShowSearch] = useState(false);
  
  const role = peerRoles ? peerRoles[peerId] || 'peer' : 'peer';
  const canControl = role === 'owner' || role === 'admin';
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMobileView, setActiveMobileView] = useState('home');
  const [activeSidebarTab, setActiveSidebarTab] = useState('queue');
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [trendingTracks, setTrendingTracks] = useState([]);
  const [loadingTrending, setLoadingTrending] = useState(true);

  useEffect(() => {
    let isMounted = true;
    getTrendingByLocation().then(tracks => {
      if (isMounted) {
        setTrendingTracks(tracks);
        setLoadingTrending(false);
      }
    });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (status === 'connected') {
      const timer = setTimeout(() => {
        setShowSkeleton(false);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setShowSkeleton(true);
    }
  }, [status]);

  useEffect(() => {
    if (!config) return;
    initP2P(config.roomId, config.displayName, config.isHost, config.hostId, config.nostrPk, config.nostrSk, config.isPublic, config.relays);
  }, [config, initP2P]);

  useEffect(() => {
    if (config.isHost && peerId) {
      window.location.hash = `${config.roomId}?host=${peerId}`;
    } else if (!config.isHost && config.hostId) {
      window.location.hash = `${config.roomId}?host=${config.hostId}`;
    }
  }, [config, peerId]);

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


  const [roomName, setRoomName] = useState(config.roomId);
  const [isEditingName, setIsEditingName] = useState(false);
  const { stateDb } = useOrbit();

  useEffect(() => {
    if (!stateDb) return;
    const handleUpdate = (e) => {
      if (e.payload.key === 'roomName') setRoomName(e.payload.value);
    };
    stateDb.events.on('update', handleUpdate);
    stateDb.get('roomName').then(val => { if (val) setRoomName(val); });
    return () => stateDb.events.off('update', handleUpdate);
  }, [stateDb]);

  const handleNameSave = (e) => {
    e.preventDefault();
    setIsEditingName(false);
    if (stateDb && config.isHost) {
      stateDb.put('roomName', roomName);
    }
  };

  return (
    <div className={`h-[100dvh] w-screen overflow-hidden flex flex-col antialiased ${isPlaying ? 'ambient-playing' : ''}`}>
      {showSkeleton && (
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

      <div className={`flex-1 flex flex-col lg:flex-row overflow-hidden relative w-full h-full lg:pb-0 z-10 ${activeMobileView === 'chat' ? 'pb-[60px]' : 'pb-[137px]'}`}>
        <main className={`w-full h-full flex-1 flex flex-col bg-transparent min-w-0 relative overflow-hidden ${activeMobileView !== 'home' ? 'hidden lg:flex' : 'flex'}`}>
          {/* Header */}
          <header className="bg-black/40 backdrop-blur-xl p-3 lg:p-4 shadow-sm flex items-center justify-between border-b border-white/10 shrink-0 z-40 relative">
            <div className="flex items-center gap-3">
              <button
                onClick={onMinimize}
                title="Back to Lobby"
                className="text-white/40 hover:text-white transition-colors flex items-center justify-center -ml-1 mr-1"
              >
                <span className="material-symbols-rounded text-[26px]">keyboard_arrow_down</span>
              </button>
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-white tracking-wide text-lg lg:text-xl">Bloom</h2>
              </div>
              <span className="text-white/30 font-bold">•</span>
              
              <div className="flex items-center gap-2">
                <span className="font-bold text-white/30 tracking-wide text-lg lg:text-xl truncate max-w-[120px] lg:max-w-[200px]">{roomName}</span>
              </div>
              <button
                title="Copy invite link"
                onClick={() => {
                  let inviteLink = window.location.href;
                  try {
                    const relays = getConnectedRelays?.() || [];
                    if (relays.length > 0) {
                      const rString = relays.map(r => r.replace('wss://', '').replace('ws://', '')).join(',');
                      const url = new URL(window.location.href);
                      const [hashPath, hashQuery] = url.hash.substring(1).split('?');
                      const params = new URLSearchParams(hashQuery || '');
                      params.set('r', rString);
                      params.set('host', config.hostId || peerId);
                      inviteLink = `${url.origin}${url.pathname}#${hashPath || config.roomId}?${params.toString()}`;
                    }
                  } catch (e) {}
                  navigator.clipboard.writeText(inviteLink).catch(() => {});
                }}
                className="text-white/30 hover:text-[var(--color-primary)] transition-colors flex items-center justify-center ml-2"
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

            <div className="flex items-center justify-end min-w-[120px]">
              <button
                title={config.isHost ? "End Party" : "Leave Party"}
                onClick={() => setShowEndConfirm(true)}
                className="text-white/30 hover:text-red-500 transition-colors flex items-center justify-center"
              >
                <span className="material-symbols-rounded text-[26px] leading-none">logout</span>
              </button>
            </div>
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
               <div className="flex-1 overflow-y-auto p-6 pb-[90px] flex flex-col gap-8">
                  {!currentTrack ? (
                    <div className="w-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700">
                      {loadingTrending ? (
                        <div className="w-full">
                          <div className="h-4 w-40 shimmer rounded-lg mb-6" />
                          <TrackGridSkeleton count={5} />
                        </div>
                      ) : (
                        <div>
                          <HomeSection 
                            title="Discover Top Hits" 
                            items={trendingTracks} 
                            onItemClick={canControl ? (track) => loadTrack(track, -1) : undefined} 
                            addToQueue={canControl ? addToQueue : undefined} 
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <RecommendationsFeed track={currentTrack} />
                      <div>
                        {loadingTrending ? (
                          <div className="w-full">
                            <div className="h-4 w-40 shimmer rounded-lg mb-6" />
                            <TrackGridSkeleton count={5} />
                          </div>
                        ) : (
                          <div>
                            <HomeSection 
                              title="Discover Top Hits" 
                              items={trendingTracks} 
                              onItemClick={canControl ? (track) => loadTrack(track, -1) : undefined} 
                              addToQueue={canControl ? addToQueue : undefined} 
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}
               </div>
             )}

           </div>
        </main>
        
        <Player activeMobileView={activeMobileView} />

        <Sidebar 
          activeTab={activeSidebarTab} 
          setActiveTab={setActiveSidebarTab} 
          className={activeMobileView !== 'home' ? 'flex' : 'hidden lg:flex'} 
        />
        
        {/* Bottom Navigation for Mobile */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 h-[60px] bg-black/80 backdrop-blur-3xl border-t border-white/10 z-[100] flex items-center justify-around px-2">
          <button 
            onClick={() => { setActiveMobileView('home'); setIsExpanded(false); }} 
            className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeMobileView === 'home' ? 'text-[var(--color-primary)]' : 'text-white/40 hover:text-white/70'}`}
          >
            <span className="material-symbols-rounded text-[24px]">home</span>
            <span className="text-[9px] font-bold tracking-widest mt-1">HOME</span>
          </button>
          <button 
            onClick={() => { setActiveMobileView('queue'); setActiveSidebarTab('queue'); setIsExpanded(false); }} 
            className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeMobileView === 'queue' ? 'text-[var(--color-primary)]' : 'text-white/40 hover:text-white/70'}`}
          >
            <span className="material-symbols-rounded text-[24px]">queue_music</span>
            <span className="text-[9px] font-bold tracking-widest mt-1">QUEUE</span>
          </button>
          <button 
            onClick={() => { setActiveMobileView('chat'); setActiveSidebarTab('chat'); setIsExpanded(false); }} 
            className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeMobileView === 'chat' ? 'text-[var(--color-primary)]' : 'text-white/40 hover:text-white/70'}`}
          >
            <span className="material-symbols-rounded text-[24px]">chat</span>
            <span className="text-[9px] font-bold tracking-widest mt-1">CHAT</span>
          </button>
          <button 
            onClick={() => { setActiveMobileView('peers'); setActiveSidebarTab('peers'); setIsExpanded(false); }} 
            className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${activeMobileView === 'peers' ? 'text-[var(--color-primary)]' : 'text-white/40 hover:text-white/70'}`}
          >
            <span className="material-symbols-rounded text-[24px]">people</span>
            <span className="text-[9px] font-bold tracking-widest mt-1">PEERS</span>
          </button>
        </div>
      </div>
      
      {/* End/Leave Party Confirmation Modal */}
      {showEndConfirm && (
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[200] flex flex-col justify-end md:justify-center items-center p-4 sm:p-6 pb-6 md:pb-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEndConfirm(false);
          }}
        >
          <div 
            className="w-full max-w-[420px] bg-[#0a0a0a] rounded-[32px] p-8 shadow-2xl relative"
            style={{ animation: 'slideUpModal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
          >
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/10 rounded-full md:hidden"></div>
            
            <button 
              type="button"
              onClick={() => setShowEndConfirm(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors z-10"
            >
              <span className="material-symbols-rounded text-[20px]">close</span>
            </button>

            <div className="mt-2 mb-8 text-center px-4">
              <h3 className="text-3xl text-white font-serif" style={{ fontFamily: '"Gloock", serif', fontWeight: 400 }}>{config.isHost ? 'End Party?' : 'Leave Party?'}</h3>
              <p className="text-white/40 text-sm mt-3 leading-relaxed">
                Are you sure you want to {config.isHost ? 'end' : 'leave'} the <strong className="text-white/80">{roomName}</strong> party?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setShowEndConfirm(false)}
                className="flex items-center justify-center p-4 bg-white/[0.03] hover:bg-white/[0.06] rounded-full text-white font-bold transition-colors h-[48px]"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  setShowEndConfirm(false);
                  stopPlayback();
                  if (config.isHost) {
                    await deleteRoom();
                  }
                  stopP2P();
                  if (onLeave) onLeave();
                }}
                className="flex items-center justify-center p-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-full transition-colors h-[48px]"
              >
                {config.isHost ? 'End Party' : 'Leave'}
              </button>
            </div>
          </div>
          <style>{`
            @keyframes slideUpModal {
              0% { opacity: 0; transform: translateY(40px) scale(0.96); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>
      )}

      {/* Autoplay Blocked Overlay */}
      {error && error.toLowerCase().includes('interact') && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[9999] flex flex-col items-center justify-center p-6 animate-in fade-in duration-500"
          onClick={() => togglePlay(true)}
        >
          <div className="bg-white/10 p-8 rounded-[32px] flex flex-col items-center shadow-2xl border border-white/20 text-center max-w-sm w-full hover:bg-white/15 transition-colors cursor-pointer group">
            <div className="w-24 h-24 bg-[var(--color-primary)] rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(var(--color-primary-rgb),0.6)] group-hover:scale-110 transition-transform">
              <span className="material-symbols-rounded text-white text-[56px] leading-none icon-fill" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
            </div>
            <h2 className="text-3xl font-serif text-white mb-2" style={{ fontFamily: '"Gloock", serif' }}>Listen In</h2>
            <p className="text-white/70 text-sm mb-8 leading-relaxed">The party is already playing. Tap anywhere to sync audio.</p>
            <button className="bg-white text-black px-8 py-3.5 rounded-full font-bold uppercase tracking-wider text-sm hover:scale-105 active:scale-95 transition-transform w-full shadow-lg">
              Start Listening
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const TrendingSection = () => {
  const [items, setItems] = useState([]);
  const { loadTrack, addToQueue } = usePlayback();
  const { peerId, peerRoles } = useOrbit();
  const role = peerRoles ? peerRoles[peerId] || 'peer' : 'peer';
  const canControl = role === 'owner' || role === 'admin';

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
  return (
    <div>
      <HomeSection 
        title="Trending Now" 
        icon="trending_up" 
        items={items} 
        onItemClick={canControl ? (track) => loadTrack(track, -1) : undefined} 
        addToQueue={canControl ? addToQueue : undefined} 
      />
    </div>
  );
};

const RecommendationsFeed = ({ track }) => {
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const { loadTrack, addToQueue } = usePlayback();
  const { peerId, peerRoles } = useOrbit();
  const role = peerRoles ? peerRoles[peerId] || 'peer' : 'peer';
  const canControl = role === 'owner' || role === 'admin';

  useEffect(() => {
    setLoading(true);
    setRecs([]);
    const fetch = async () => {
      try {
        const data = await getRecommendations(track);
        setRecs(data);
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
    <div className="w-full">
      <HomeSection 
        title={`More like ${track.title}`} 
        items={recs} 
        onItemClick={canControl ? loadTrack : undefined} 
        addToQueue={canControl ? addToQueue : undefined} 
      />
    </div>
  );
};

const HomeSection = ({ title, icon, items, onItemClick, addToQueue }) => {
  const scrollRef = useRef(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState('All');

  // Compute unique languages (capitalize first letter)
  const languages = Array.from(new Set(items.map(item => item.language).filter(l => l && l !== 'unknown')))
    .map(l => l.charAt(0).toUpperCase() + l.slice(1));
  
  const showFilters = languages.length > 1;

  const filteredItems = selectedLanguage === 'All' 
    ? items 
    : items.filter(item => item.language?.toLowerCase() === selectedLanguage.toLowerCase());

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeft(scrollLeft > 0);
    setShowRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
  };

  useEffect(() => {
    handleScroll();
  }, [filteredItems]);

  const scrollLeft = () => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: -(scrollRef.current.clientWidth + 24), behavior: 'smooth' });
  };

  const scrollRight = () => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: (scrollRef.current.clientWidth + 24), behavior: 'smooth' });
  };

  return (
    <section className="relative w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between mb-6 pr-2">
        <h3 className="text-3xl text-white/90 flex items-center gap-3 font-serif" style={{ fontFamily: '"Gloock", serif', fontWeight: 400 }}>
          {icon && <span className="material-symbols-rounded text-[var(--color-primary)] text-[28px]">{icon}</span>}
          {title}
        </h3>
        
        {/* Navigation Arrows in Heading Row */}
        {filteredItems.length > 5 && (
          <div className="flex items-center gap-2">
            <button 
              onClick={scrollLeft}
              disabled={!showLeft}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5 transition-colors"
            >
              <span className="material-symbols-rounded text-[20px]">chevron_left</span>
            </button>
            <button 
              onClick={scrollRight}
              disabled={!showRight}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5 transition-colors"
            >
              <span className="material-symbols-rounded text-[20px]">chevron_right</span>
            </button>
          </div>
        )}
      </div>

      {showFilters && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-6 pb-2 -mt-2">
          <button
            onClick={() => setSelectedLanguage('All')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              selectedLanguage === 'All' 
                ? 'bg-white text-black' 
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            All
          </button>
          {languages.map(lang => (
            <button
              key={lang}
              onClick={() => setSelectedLanguage(lang)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedLanguage === lang 
                  ? 'bg-white text-black' 
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
      )}

      <div className="relative w-full">
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="grid grid-rows-2 grid-flow-col gap-6 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth pb-4
                     auto-cols-[calc(50%-0.75rem)] 
                     sm:auto-cols-[calc(33.333333%-1rem)] 
                     xl:auto-cols-[calc(25%-1.125rem)] 
                     2xl:auto-cols-[calc(20%-1.2rem)]"
        >
          {filteredItems.map(track => (
            <div key={track.id} className="snap-start h-full">
              <TrackCard track={track} addToQueue={addToQueue} onClick={onItemClick ? () => onItemClick(track) : undefined} />
            </div>
          ))}
        </div>
        
      </div>
    </section>
  );
};

export default Layout;
