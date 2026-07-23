import React, { useState, useEffect, useRef } from 'react';
import AmbientLight from './AmbientLight';
import { pool, getUserRelays } from '../services/nostr';
import { LobbyTileSkeleton } from './Skeleton';
import { usePlayback } from '../context/PlaybackContext';
import { useOrbit } from '../context/OrbitContext';

const MiniProgressBar = React.memo(({ playerRef, duration }) => {
  const progressRef = useRef(null);

  useEffect(() => {
    if (playerRef?.current) {
      const handleTime = (time) => {
        const actualProgress = (time / duration) * 100 || 0;
        if (progressRef.current) progressRef.current.style.width = `${actualProgress}%`;
      };
      playerRef.current.addTimeListener(handleTime);
      if (playerRef.current.audio) handleTime(playerRef.current.audio.currentTime);
      return () => {
        if (playerRef?.current) playerRef.current.removeTimeListener(handleTime);
      };
    }
  }, [playerRef, duration]);

  return (
    <div className="w-full px-2">
      <div className="w-full h-[4px] bg-white/10 rounded-full overflow-hidden">
        <div
          ref={progressRef}
          className="h-full bg-[var(--color-primary)] pointer-events-none transition-all duration-100 ease-linear rounded-full"
          style={{ width: '0%' }}
        ></div>
      </div>
    </div>
  );
});

const Lobby = ({ onJoin, onCreateRoom, displayName, onRestore, minimizedConfig }) => {
  const [rooms, setRooms] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  
  const [locationCode, setLocationCode] = useState('...');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Context hooks for mini-player
  const { currentTrack, isPlaying, togglePlay, playNext, playPrev, playerRef, duration } = usePlayback();
  const { status, peerNames, stateDb } = useOrbit();
  const [roomName, setRoomName] = useState(minimizedConfig ? minimizedConfig.roomId : '');

  useEffect(() => {
    if (minimizedConfig && stateDb) {
      stateDb.get('roomName').then(val => { if (val) setRoomName(val); });
      const handleState = (e) => {
        if (e.payload.key === 'roomName') setRoomName(e.payload.value);
      };
      window.addEventListener('orbit:state:update', handleState);
      return () => window.removeEventListener('orbit:state:update', handleState);
    }
  }, [minimizedConfig, stateDb]);

  useEffect(() => {
    const initTimer = setTimeout(() => setIsInitializing(false), 2000);
    return () => clearTimeout(initTimer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    fetch('https://get.geojs.io/v1/ip/geo.json')
      .then(res => res.json())
      .then(data => {
        if (data.city) {
          const city = data.city.toLowerCase();
          if (city === 'bengaluru' || city === 'bangalore') {
            setLocationCode('BLR');
          } else if (city === 'new york') {
            setLocationCode('NYC');
          } else if (city === 'san francisco') {
            setLocationCode('SFO');
          } else if (city === 'london') {
            setLocationCode('LDN');
          } else {
            const cons = city.toUpperCase().replace(/[^A-Z]/g, '').replace(/[AEIOU]/g, '');
            setLocationCode(cons.length >= 3 ? cons.substring(0, 3) : city.toUpperCase().substring(0, 3));
          }
        }
      })
      .catch(() => setLocationCode('LCL'));

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let sub = null;
    let relays = [];
    
    const initLobby = async () => {
      relays = await getUserRelays();
      console.log('[Lobby] Component mounted. Setting up beacon subscription for NIP-53 Live Activities on relays:', relays);
      // Subscribe to NIP-53 Live Activities (kind 30311)
      const filters = [{ kinds: [30311], limit: 100 }];
      console.log('[Lobby] Subscription filters:', filters);
  
      sub = pool.subscribeMany(
        relays,
        filters,
        {
        onevent(event) {
          try {
            const dTag = event.tags.find(t => t[0] === 'd');
            const statusTag = event.tags.find(t => t[0] === 'status');
            const titleTag = event.tags.find(t => t[0] === 'title');
            
            if (!dTag || !dTag[1].startsWith('bloom-') || statusTag?.[1] !== 'live') {
              return;
            }
            
            const roomId = dTag[1].replace('bloom-', '');
            let parsedContent = {};
            try { parsedContent = JSON.parse(event.content); } catch(e) {}
            
            const activePeers = parsedContent.activePeers || (parsedContent.activePeerIds ? parsedContent.activePeerIds.length : 1);
            const roomName = parsedContent.roomName || (titleTag ? titleTag[1].replace('Bloom Room: ', '') : roomId);
            const hostPk = event.pubkey;
            const hostName = parsedContent.hostName;
            const currentTrack = parsedContent.currentTrack;

            // Ignore stale beacons (older than 5 minutes). Active hosts broadcast every 30s.
            const now = Math.floor(Date.now() / 1000);
            if (now - event.created_at > 300) {
               console.log(`[Lobby] Ignoring stale beacon for room: ${roomId} (${now - event.created_at}s old)`);
               return;
            }

            console.log('[Lobby] Valid beacon for room:', roomId, 'Host PK:', hostPk);
            
            setRooms(prev => {
              const existing = prev[roomId];
              // Only update if newer
              if (existing && existing.timestamp > event.created_at) {
                return prev;
              }
              
              return {
                ...prev,
                [roomId]: {
                  roomId,
                  roomName,
                  hostName,
                  currentTrack,
                  hostPk,
                  activePeers,
                  timestamp: event.created_at,
                  pubkey: hostPk
                }
              };
            });
          } catch (e) { console.error('[Lobby] Failed to parse beacon event:', e); }
        }
      }
    );
  };
  initLobby();

  return () => {
    console.log('[Lobby] Component unmounting, closing subscription.');
    if (sub && sub.close) sub.close();
  };
}, []);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    let finalRoomId = `bloom-${Math.random().toString(36).substring(2, 8)}`;
    if (newRoomName) {
      finalRoomId = `bloom-${newRoomName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${Math.random().toString(36).substring(2, 8)}`;
    }
    onCreateRoom(finalRoomId, isPublic);
  };

  const filteredRooms = Object.values(rooms)
    .filter(r => 
      r.roomId.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (r.roomName && r.roomName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.hostName && r.hostName.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => b.timestamp - a.timestamp); // Newest beacons first

  const formatTimeDate = (date) => {
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const year = date.getFullYear().toString().slice(-2);
    return `${time} · ${day} ${month} ’${year}`;
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex flex-col antialiased bg-black relative animate-fade-in">
      
      <AmbientLight />

      <header className="bg-black/40 backdrop-blur-xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between border-b border-white/10 shrink-0 z-40 relative gap-4 md:h-[72px]">
        <div className="flex items-center gap-3 w-full md:w-auto justify-between z-20">
          <h2 className="font-bold text-white tracking-wide text-2xl flex items-center gap-2">
            Bloom
            {displayName && (
              <>
                <span className="text-white/30">•</span>
                <span className="font-bold tracking-wide text-white/70">{displayName}</span>
              </>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                setRooms({});
              }}
              className="md:hidden text-white/50 hover:text-white p-2 transition-colors"
            >
              <span className="material-symbols-rounded">refresh</span>
            </button>
            <button 
              onClick={() => setShowCreate(true)}
              className="md:hidden bg-white text-black px-4 py-2 rounded-full font-bold text-sm"
            >
              Host
            </button>
          </div>
        </div>

        <div className="w-full max-w-xl relative group md:absolute md:left-1/2 md:-translate-x-1/2 z-10">
          <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-white transition-colors">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search active parties..."
            className="w-full h-11 bg-white/[0.06] border border-white/10 rounded-full pl-12 pr-4 text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-all shadow-inner"
          />
        </div>

        <div className="hidden md:flex items-center gap-3 z-20">
          <button 
            onClick={() => setRooms({})}
            title="Refresh Parties"
            className="text-white/40 hover:text-white transition-colors p-2 flex items-center justify-center rounded-full hover:bg-white/10"
          >
            <span className="material-symbols-rounded">refresh</span>
          </button>
          <button 
            onClick={() => setShowCreate(true)}
            className="bg-white hover:bg-white/90 text-black px-6 py-2.5 rounded-full font-bold transition-colors items-center flex"
          >
            Host
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 z-10 flex flex-col">
        <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col relative mt-8">
          
          {isInitializing ? (
            <div className="flex flex-col items-center gap-2 pb-20 w-full animate-fade-in">
              {Array(3).fill(0).map((_, i) => (
                <React.Fragment key={i}>
                  <LobbyTileSkeleton />
                  {i < 2 && (
                    <div className="text-white/20 tracking-[0.3em] text-sm py-1">
                      •••
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-white/30 pb-20">
              <span className="material-symbols-rounded text-6xl mb-4 opacity-50">music_off</span>
              <p className="text-lg">No active public parties found.</p>
              <button 
                onClick={() => setShowCreate(true)}
                className="mt-6 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full font-bold transition-colors items-center flex"
              >
                Host
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 pb-20 w-full">
              {filteredRooms.map((room, index) => (
                <React.Fragment key={room.roomId}>
                  <div 
                    onClick={() => onJoin(room.roomId, room.pubkey)}
                    className="w-full max-w-xl bg-white/[0.03] hover:bg-white/[0.06] p-5 rounded-2xl cursor-pointer transition-all flex flex-col gap-3 group"
                  >
                    <div className="flex flex-col items-start w-full">
                      <h4 className="font-bold text-white tracking-wide text-lg flex items-center flex-wrap gap-2">
                        {room.roomName || room.roomId}
                        <span className="text-white/30">•</span>
                        <span className="font-bold tracking-wide text-white/70">{room.hostName || 'Unknown'}</span>
                        
                        {room.activePeers && (
                          <>
                            <span className="text-white/30">•</span>
                            <span className="bg-white/10 text-white/70 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                              <span className="material-symbols-rounded text-[12px]">headset</span>
                              {room.activePeers}
                            </span>
                          </>
                        )}
                      </h4>
                    </div>
                    
                    {room.currentTrack ? (
                      <div className="mt-2 w-full overflow-hidden mask-image-x relative flex">
                        <div className="flex w-max animate-marquee hover:[animation-play-state:paused] whitespace-nowrap">
                          {/* Half 1 */}
                          <div className="flex items-center gap-4 shrink-0 pr-4">
                            {Array(5).fill(0).map((_, i) => (
                              <React.Fragment key={`p1-${i}`}>
                                <span className="text-white text-sm group-hover:text-blue-400 transition-colors">{room.currentTrack.title}</span>
                                <span className="text-white/30 text-[10px]">•</span>
                              </React.Fragment>
                            ))}
                          </div>
                          {/* Half 2 */}
                          <div className="flex items-center gap-4 shrink-0 pr-4">
                            {Array(5).fill(0).map((_, i) => (
                              <React.Fragment key={`p2-${i}`}>
                                <span className="text-white text-sm group-hover:text-blue-400 transition-colors">{room.currentTrack.title}</span>
                                <span className="text-white/30 text-[10px]">•</span>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 w-full overflow-hidden mask-image-x relative flex">
                        <div className="flex w-max animate-marquee whitespace-nowrap">
                          {/* Half 1 */}
                          <div className="flex items-center gap-4 shrink-0 pr-4">
                            {Array(5).fill(0).map((_, i) => (
                              <React.Fragment key={`e1-${i}`}>
                                <span className="text-white/30 text-sm">Nothing playing right now</span>
                                <span className="text-white/10 text-[10px]">•</span>
                              </React.Fragment>
                            ))}
                          </div>
                          {/* Half 2 */}
                          <div className="flex items-center gap-4 shrink-0 pr-4">
                            {Array(5).fill(0).map((_, i) => (
                              <React.Fragment key={`e2-${i}`}>
                                <span className="text-white/30 text-sm">Nothing playing right now</span>
                                <span className="text-white/10 text-[10px]">•</span>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {index < filteredRooms.length - 1 && (
                    <div className="text-white/20 tracking-[0.3em] text-sm py-1">
                      •••
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
          
        </div>
      </div>

      <div className="fixed bottom-4 left-4 z-40 pointer-events-none">
        <p className="text-white/30 text-xs font-medium">Total live parties: {filteredRooms.length}</p>
      </div>

      {/* Mini Player when minimized */}
      {minimizedConfig && status === 'connected' && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-xl z-[150] flex flex-col gap-2">
          {/* Top: Room Details */}
          <div className="flex items-center justify-center gap-2 px-2 opacity-80 cursor-pointer" onClick={onRestore}>
            <span className="text-white/60 text-xs font-medium tracking-wide">Inside</span>
            <span className="text-[var(--color-primary)] text-[10px]">•</span>
            <span className="font-bold text-white text-xs tracking-wider">{roomName || minimizedConfig.roomId}</span>
            <span className="text-[var(--color-primary)] text-[10px]">•</span>
            <span className="text-white/60 text-xs font-medium tracking-widest">{peerNames[minimizedConfig.hostId] || 'Host'}</span>
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            <MiniProgressBar playerRef={playerRef} duration={duration} />

            <div 
              onClick={onRestore}
              className="w-full bg-black/60 rounded-2xl p-2 flex items-center justify-between cursor-pointer hover:bg-black/80 transition-colors shadow-2xl backdrop-blur-xl overflow-hidden"
            >
            {/* Left: Thumbnail */}
            <div className="shrink-0 w-[48px] h-[48px] rounded-lg overflow-hidden relative">
              {currentTrack?.thumbnail ? (
                <img src={currentTrack.thumbnail} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="material-symbols-rounded text-white/30 text-[20px]">music_note</span>
                </div>
              )}
            </div>

            {/* Middle: Marquee (Song Details) */}
            <div className="flex-1 overflow-hidden px-4 mask-image-x relative flex min-w-0">
              <div className="flex w-max animate-marquee hover:[animation-play-state:paused] whitespace-nowrap items-center">
                <div className="flex items-center gap-2 shrink-0 pr-12">
                  <span className="font-bold text-white text-sm tracking-wide">{currentTrack ? currentTrack.title : 'Nothing playing right now'}</span>
                  {currentTrack?.author && (
                    <>
                      <span className="text-white/30 text-sm">•</span>
                      <span className="text-white/70 text-sm">{currentTrack.author}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 pr-12">
                  <span className="font-bold text-white text-sm tracking-wide">{currentTrack ? currentTrack.title : 'Nothing playing right now'}</span>
                  {currentTrack?.author && (
                    <>
                      <span className="text-white/30 text-sm">•</span>
                      <span className="text-white/70 text-sm">{currentTrack.author}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-0 shrink-0 pr-1">
              <button
                onClick={(e) => { e.stopPropagation(); playPrev(); }}
                className="text-white/60 hover:text-white p-1 flex items-center justify-center rounded-full"
              >
                <span className="material-symbols-rounded text-[24px] leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>skip_previous</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="text-white p-1 flex items-center justify-center rounded-full hover:scale-105 transition-transform"
              >
                <span className="material-symbols-rounded text-[38px] leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {isPlaying ? 'pause_circle' : 'play_circle'}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); playNext(true); }}
                className="text-white/60 hover:text-white p-1 flex items-center justify-center rounded-full"
              >
                <span className="material-symbols-rounded text-[24px] leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>skip_next</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      <div className="fixed bottom-4 right-4 z-40 pointer-events-none text-right">
        <p className="text-white/30 text-xs font-medium tracking-wide">
          {locationCode} · {formatTimeDate(currentTime)}
        </p>
      </div>

      {showCreate && (
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] flex flex-col justify-end md:justify-center items-center p-4 sm:p-6 pb-6 md:pb-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false);
          }}
        >
          <div 
            className="w-full max-w-[420px] bg-[#0a0a0a] rounded-[32px] p-8 shadow-2xl relative"
            style={{ animation: 'slideUpModal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
          >
            {/* Bottom Sheet Handle (Mobile only) */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/10 rounded-full md:hidden"></div>
            
            <button 
              type="button"
              onClick={() => setShowCreate(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors z-10"
            >
              <span className="material-symbols-rounded text-[20px]">close</span>
            </button>

            <div className="mt-2 mb-8 text-center px-4">
              <h3 className="text-4xl text-white font-serif" style={{ fontFamily: '"Gloock", serif', letterSpacing: 'normal', fontWeight: 400 }}>Host a Party</h3>
              <p className="text-white/40 text-sm mt-2">Start a room and invite your friends.</p>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5 ml-2">Party Name (Optional)</label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g., chill vibes"
                  autoComplete="off"
                  className="w-full h-[48px] bg-white/[0.06] rounded-full px-6 text-lg text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors shadow-inner"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className="relative flex flex-col items-center justify-center p-5 rounded-3xl transition-all border border-transparent text-center bg-white/[0.03] hover:bg-white/[0.05]"
                >
                  {!isPublic && (
                    <span className="absolute top-3 right-3 material-symbols-rounded text-white text-[18px]">check_circle</span>
                  )}
                  <span className={`material-symbols-rounded text-2xl mb-3 transition-colors ${!isPublic ? 'text-white' : 'text-white/40'}`}>lock</span>
                  <span className={`font-bold text-base transition-colors ${!isPublic ? 'text-white' : 'text-white/60'}`}>Private Party</span>
                  <span className="text-white/40 text-[11px] mt-1 leading-tight">Link required</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className="relative flex flex-col items-center justify-center p-5 rounded-3xl transition-all border border-transparent text-center bg-white/[0.03] hover:bg-white/[0.05]"
                >
                  {isPublic && (
                    <span className="absolute top-3 right-3 material-symbols-rounded text-white text-[18px]">check_circle</span>
                  )}
                  <span className={`material-symbols-rounded text-2xl mb-3 transition-colors ${isPublic ? 'text-white' : 'text-white/40'}`}>lock_open</span>
                  <span className={`font-bold text-base transition-colors ${isPublic ? 'text-white' : 'text-white/60'}`}>Public Party</span>
                  <span className="text-white/40 text-[11px] mt-1 leading-tight">Global lobby</span>
                </button>
              </div>
              
              <div className="mt-20 pt-4">
                <button 
                  type="submit" 
                  className="w-full bg-white hover:bg-white/90 text-black font-bold rounded-full h-[48px] transition-colors flex items-center justify-center text-lg"
                >
                  Start Party
                </button>
              </div>
            </form>
          </div>
          <style>{`
            @keyframes slideUpModal {
              0% { opacity: 0; transform: translateY(40px) scale(0.96); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>
      )}

    </div>
  );
};

export default Lobby;
