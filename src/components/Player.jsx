import React, { useState, useRef, useEffect } from 'react';
import { useOrbit } from '../context/OrbitContext';
import { usePlayback } from '../context/PlaybackContext';
import Lyrics from './Lyrics';
import { PlayerTrackSkeleton } from './Skeleton';

const Visualizer = ({ playerRef, isExpanded, isFullscreen }) => {
  const barsRef = useRef([]);

  useEffect(() => {
    if (!isExpanded) return; // Prevent heavy JS loop when visualizer is hidden!

    let animationFrameId;
    
    const renderLoop = () => {
      let data = new Uint8Array(0);
      if (playerRef?.current) {
        data = playerRef.current.getFrequencyData();
      }
      
      const numBars = 48;
      
      // We use 128 bins (from fftSize 256) and visualize the first 75% of them (0 to ~16kHz)
      // This perfectly captures all musical energy while ignoring empty ultra-high frequencies.
      const usableBins = data.length > 0 ? Math.floor(data.length * 0.75) : 0;
      
      for (let i = 0; i < numBars; i++) {
        if (barsRef.current[i]) {
           let val = 0;
           if (usableBins > 0) {
             // A smooth quadratic curve (1.5) spreads the bass out beautifully 
             // without compressing the high-end too much.
             const ratio = i / (numBars - 1);
             const binIndex = Math.floor(Math.pow(ratio, 1.5) * (usableBins - 1));
             
             val = data[binIndex] || 0;
             
             // Gentle treble boost to keep the right side active and dancing
             val = val * (1 + (ratio * 0.5));
           }
           
           // Exponent 1.3 provides a snappy, rhythmic bounce to the bars.
           // Multiplier 1.25 lets them hit the top of the container gracefully on loud beats.
           const normalized = Math.min(1, Math.pow(val / 255, 1.3) * 1.25);
           
           // Use transform scaleY instead of height to prevent layout thrashing
           barsRef.current[i].style.transform = `scaleY(${Math.max(0.01, normalized)})`;
        }
      }
      
      animationFrameId = requestAnimationFrame(renderLoop);
    };
    
    renderLoop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isExpanded, playerRef]);

  return (
    <div className={`absolute left-0 right-0 h-[45vh] z-0 flex items-end justify-between px-1 gap-[2px] md:gap-1 transition-opacity duration-1000 pointer-events-none ${isExpanded ? 'opacity-100' : 'opacity-0'} ${isFullscreen ? 'bottom-0' : 'bottom-0 lg:bottom-[82px]'}`}>
      {Array.from({ length: 48 }).map((_, i) => (
        <div 
          key={i} 
          ref={el => barsRef.current[i] = el}
          className="flex-1 backdrop-blur-2xl rounded-t-md origin-bottom will-change-transform"
          style={{ 
            height: '100%', 
            transform: 'scaleY(0.01)',
            backgroundColor: 'color-mix(in srgb, var(--color-1) 25%, transparent)' 
          }}
        />
      ))}
    </div>
  );
};

const Player = () => {
  const {
    isPlaying,
    isLoading,
    currentTrack,
    currentTime,
    duration,
    togglePlay,
    seek,
    volume,
    setVolume,
    isShuffled,
    setIsShuffled,
    isRepeat,
    setIsRepeat,
    playNext,
    playPrev,
    error,
    isExpanded,
    setIsExpanded,
    playerRef
  } = usePlayback();
  const { peerId, peerRoles } = useOrbit();
  
  const role = peerRoles[peerId] || 'peer';
  const canControl = role === 'owner' || role === 'admin';

  const [showPlayAnim, setShowPlayAnim] = useState(false);
  const animTimeout = useRef(null);
  
  // Fullscreen states
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFsControls, setShowFsControls] = useState(true);
  const [showLyrics, setShowLyrics] = useState(false);
  const fsTimeoutRef = useRef(null);

  // Sync fullscreen exit via Escape key or browser back
  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [isFullscreen]);

  const handleMouseMove = () => {
    if (!isFullscreen) return;
    setShowFsControls(true);
    if (fsTimeoutRef.current) clearTimeout(fsTimeoutRef.current);
    fsTimeoutRef.current = setTimeout(() => setShowFsControls(false), 2500);
  };

  const toggleFullscreen = (e) => {
    e.stopPropagation();
    if (!isFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
      setShowFsControls(true);
      if (fsTimeoutRef.current) clearTimeout(fsTimeoutRef.current);
      fsTimeoutRef.current = setTimeout(() => setShowFsControls(false), 2500);
    } else {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
      setShowFsControls(true);
    }
  };

  const handleExpandedClick = (e) => {
    e.stopPropagation();
    togglePlay();
    setShowPlayAnim(!isPlaying ? 'play_arrow' : 'pause');
    if (animTimeout.current) clearTimeout(animTimeout.current);
    animTimeout.current = setTimeout(() => setShowPlayAnim(null), 700);
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progress = (currentTime / duration) * 100 || 0;

  return (
    <>
      {/* Expanded View */}
      {currentTrack && (
        <div 
          className={`bg-black flex flex-col items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isExpanded ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'} ${isFullscreen ? 'fixed inset-0 z-[9999] pb-0' : 'absolute inset-0 bottom-[60px] lg:bottom-0 lg:right-[400px] z-[45] pb-[80px] lg:pb-24'}`}
          onClick={handleExpandedClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => isFullscreen && setShowFsControls(false)}
        >
          {/* Background blur */}
          <div 
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 blur-[40px] lg:blur-[100px] scale-150 pointer-events-none opacity-70 transform-gpu"
            style={{ backgroundImage: `url(${currentTrack.thumbnail})` }} 
          />
          
          {/* Top Right Buttons (Lyrics and Minimize) */}
          <div className="absolute top-8 right-8 z-20 flex gap-2">
              <button 
                className={`flex w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full items-center justify-center transition-colors ${showLyrics ? 'text-[var(--color-primary)] bg-white/20' : 'text-white/70 hover:text-white'}`}
                onClick={(e) => { e.stopPropagation(); setShowLyrics(!showLyrics); }}
                title="Lyrics"
              >
                <span className="material-symbols-rounded text-[24px] leading-none">lyrics</span>
              </button>
              
              {!isFullscreen && (
                <button 
                  className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setIsExpanded(false); 
                  }}
                  title="Minimize"
                >
                  <span className="material-symbols-rounded text-[32px] leading-none">keyboard_arrow_down</span>
                </button>
              )}
          </div>
          
          {/* Bottom Right Fullscreen Button (Desktop Only) */}
          <div className={`hidden lg:flex absolute right-8 justify-end gap-4 z-20 transition-all duration-500 ${isFullscreen ? 'bottom-8' : 'bottom-[100px]'} ${isFullscreen && !showFsControls ? 'opacity-0' : 'opacity-100'}`}>
            <button 
              className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              <span className="material-symbols-rounded text-[26px] leading-none">
                {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
              </span>
            </button>
          </div>
          
          {!showLyrics ? (
            <div className="relative flex flex-col items-center w-full mt-8 lg:mt-0">
              <div className="relative">
                <img 
                  src={currentTrack.thumbnail.replace('w120-h120', 'w1080-h1080').replace('hqdefault', 'maxresdefault')}
                  className={`w-[90vw] max-w-[600px] aspect-square object-cover rounded-3xl border border-white/10 z-10 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${!isExpanded ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`} 
                  alt=""
                />

                {showPlayAnim && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 backdrop-blur-md rounded-full w-24 h-24 flex items-center justify-center animate-play-pause-pop">
                      <span className="material-symbols-rounded text-white text-5xl icon-fill">
                        {showPlayAnim}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Mobile Title and Artist (Below Cover Art) */}
              <div className="lg:hidden w-full flex flex-col items-center mt-6 px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
                <h2 className="text-xl font-bold text-white w-full truncate">{currentTrack.title}</h2>
                <p className="text-sm font-medium text-white/50 w-full truncate mt-1">{currentTrack.author}</p>
              </div>
            </div>
          ) : (
            <Lyrics currentTrack={currentTrack} currentTime={currentTime} />
          )}
          
          <Visualizer playerRef={playerRef} isExpanded={isExpanded} isFullscreen={isFullscreen} />

          {/* Mobile Expanded Bottom Sheet Controls */}
          <div className="lg:hidden absolute bottom-12 left-0 right-0 px-8 flex flex-col z-30" onClick={(e) => e.stopPropagation()}>
            {/* Progress Bar & Time */}
            <div className="w-full flex flex-col mb-6">
              <div 
                className={`w-full h-1.5 bg-white/20 rounded-full mb-3 ${canControl ? 'cursor-pointer' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canControl) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos = (e.clientX - rect.left) / rect.width;
                  seek(pos * duration);
                }}
              >
                <div className="h-full bg-[var(--color-primary)] rounded-full relative" style={{ width: `${progress}%` }}>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-white rounded-full"></div>
                </div>
              </div>
              <div className="flex justify-between text-[11px] font-mono text-white/50 tracking-wider">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Controls Row */}
            <div className={`w-full flex items-center justify-between ${!canControl ? 'opacity-50 pointer-events-none' : ''}`}>
              <button 
                onClick={(e) => { e.stopPropagation(); setIsShuffled(!isShuffled); }} 
                className={`w-10 h-10 flex items-center justify-center transition-colors ${isShuffled ? 'text-[var(--color-primary)]' : 'text-white/40 hover:text-white'}`}
              >
                <span className="material-symbols-rounded text-[26px] leading-none">shuffle</span>
              </button>

              <div className="flex items-center gap-4">
                <button onClick={(e) => { e.stopPropagation(); playPrev(); }} className="text-white/70 hover:text-white flex items-center justify-center">
                  <span className="material-symbols-rounded text-[36px] icon-fill leading-none">skip_previous</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                  className="w-16 h-16 bg-white text-slate-900 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl"
                >
                  <span className="material-symbols-rounded text-[42px] icon-fill leading-none">
                    {isPlaying ? 'pause' : 'play_arrow'}
                  </span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); playNext(true); }} className="text-white/70 hover:text-white flex items-center justify-center">
                  <span className="material-symbols-rounded text-[36px] icon-fill leading-none">skip_next</span>
                </button>
              </div>

              <button 
                onClick={(e) => { e.stopPropagation(); setIsRepeat(!isRepeat); }} 
                className={`w-10 h-10 flex items-center justify-center transition-colors ${isRepeat ? 'text-[var(--color-primary)]' : 'text-white/40 hover:text-white'}`}
              >
                <span className="material-symbols-rounded text-[26px] leading-none">{isRepeat ? 'repeat_on' : 'repeat'}</span>
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Main Player Bar (Collapsed Miniplayer & Desktop Expanded) */}
      <div 
        className={`absolute bottom-[60px] lg:bottom-0 left-0 right-0 lg:right-[400px] z-[90] bg-black/60 backdrop-blur-3xl border-t border-white/10 transition-transform duration-500 cursor-pointer h-[77px] ${isFullscreen ? 'translate-y-full' : 'translate-y-0 animate-in slide-in-from-bottom'} ${isExpanded ? 'hidden lg:block' : 'block'}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
      
      {/* Progress Bar (Top Edge) */}
      <div 
        className={`absolute top-0 left-0 right-0 h-1 bg-white/10 group ${canControl ? 'cursor-pointer' : ''}`} 
        onClick={(e) => {
          e.stopPropagation();
          if (!canControl) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const pos = (e.clientX - rect.left) / rect.width;
          seek(pos * duration);
        }}
      >
        <div
          className="absolute top-0 left-0 h-full bg-[var(--color-primary)] transition-all duration-100"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg scale-0 group-hover:scale-100 transition-transform"></div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto hidden lg:flex items-center justify-between px-6 h-full pt-1">
        
        {/* Left Side: Controls & Duration */}
        <div className="flex items-center gap-6 w-1/3">
          <div className={`flex items-center gap-4 ${!canControl ? 'opacity-50 pointer-events-none' : ''}`}>
            <button onClick={(e) => { e.stopPropagation(); playPrev(); }} className="text-white/40 hover:text-white transition-colors flex items-center justify-center">
              <span className="material-symbols-rounded text-[30px] icon-fill leading-none">skip_previous</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="w-14 h-14 bg-white text-slate-900 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl"
            >
              <span className="material-symbols-rounded text-[38px] icon-fill leading-none">
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>
            <button onClick={(e) => { e.stopPropagation(); playNext(true); }} className="text-white/40 hover:text-white transition-colors flex items-center justify-center">
              <span className="material-symbols-rounded text-[30px] icon-fill leading-none">skip_next</span>
            </button>
          </div>
          
          <div className="text-[11px] font-mono text-white/40 flex items-center gap-1 tracking-wider">
            <span className="text-white/80">{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Middle: Track Info */}
        <div className="flex items-center justify-center gap-4 w-1/3 min-w-0">
          {isLoading ? (
            <PlayerTrackSkeleton />
          ) : error ? (
            <div className="flex items-center gap-3 text-red-400 bg-red-900/20 px-4 py-2 rounded-xl border border-red-500/20 max-w-sm animate-in fade-in">
              <span className="material-symbols-rounded text-2xl">error</span>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold uppercase tracking-widest truncate">Playback Error</h4>
                <p className="text-[10px] opacity-80 truncate" title={error}>{error}</p>
              </div>
            </div>
          ) : currentTrack ? (
            <div className="flex items-center gap-4 text-left w-full justify-center">
              <img src={currentTrack.thumbnail} className="w-12 h-12 rounded-lg object-cover shadow-2xl border border-white/5 shrink-0" alt="" />
              <div className="min-w-0 flex flex-col justify-center">
                <h4 className="text-[13px] font-bold text-white truncate max-w-[200px]">{currentTrack.title}</h4>
                <p className="text-[11px] text-white/50 font-medium truncate mt-[2px] max-w-[200px]">{currentTrack.author}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-4 opacity-30">
              <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center">
                 <span className="material-symbols-rounded text-white/40 text-xl leading-none">music_note</span>
              </div>
              <div className="text-left">
                 <h4 className="text-[13px] font-bold text-white">Not Playing</h4>
                 <p className="text-[11px] text-white/50 font-medium mt-[2px]">Select a track</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Shuffle, Repeat, Volume */}
        <div className="flex items-center justify-end gap-6 w-1/3">
          <div className={`flex items-center gap-4 ${!canControl ? 'opacity-50 pointer-events-none' : ''}`}>
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (!isExpanded) {
                  setIsExpanded(true);
                  setShowLyrics(true);
                } else {
                  setShowLyrics(!showLyrics);
                }
              }} 
              className={`transition-colors flex items-center justify-center ${showLyrics && isExpanded ? 'text-[var(--color-primary)]' : 'text-white/40 hover:text-white'}`}
              title="Lyrics"
            >
              <span className="material-symbols-rounded text-[24px] leading-none">lyrics</span>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsShuffled(!isShuffled); }} 
              className={`transition-colors flex items-center justify-center ${isShuffled ? 'text-[var(--color-primary)]' : 'text-white/40 hover:text-white'}`}
            >
              <span className="material-symbols-rounded text-[26px] leading-none">shuffle</span>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsRepeat(!isRepeat); }} 
              className={`transition-colors flex items-center justify-center ${isRepeat ? 'text-[var(--color-primary)]' : 'text-white/40 hover:text-white'}`}
            >
              <span className="material-symbols-rounded text-[26px] leading-none">{isRepeat ? 'repeat_on' : 'repeat'}</span>
            </button>
          </div>

          <div className="flex items-center gap-3 group/vol" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setVolume(volume === 0 ? 1 : 0)} className="text-white/40 hover:text-white transition-colors flex items-center justify-center">
               <span className="material-symbols-rounded text-[26px] leading-none">
                 {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
               </span>
            </button>
            <div className="w-24 h-1 bg-white/10 rounded-full relative flex items-center opacity-50 group-hover/vol:opacity-100 transition-opacity">
              <div className="absolute inset-0 bg-[var(--color-primary)]/20 rounded-full pointer-events-none"></div>
              <div className="absolute top-0 left-0 h-full bg-[var(--color-primary)] rounded-full pointer-events-none" style={{ width: `${volume * 100}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2.5 h-2.5 bg-white rounded-full pointer-events-none"></div>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0 p-0"
              />
            </div>
          </div>
        </div>

      </div>

      {/* Mobile Collapsed Miniplayer */}
      <div className="max-w-screen-2xl mx-auto flex lg:hidden items-center justify-between px-4 h-full pt-1">
        
        {/* Left: Track Info */}
        <div className="flex items-center gap-3 w-2/3 min-w-0 pointer-events-none">
          {isLoading ? (
            <PlayerTrackSkeleton />
          ) : error ? (
            <div className="flex items-center gap-2 text-red-400 min-w-0">
              <span className="material-symbols-rounded text-xl">error</span>
              <div className="min-w-0 flex-1">
                <h4 className="text-[11px] font-bold uppercase truncate">Error</h4>
              </div>
            </div>
          ) : currentTrack ? (
            <div className="flex items-center gap-3 w-full">
              <img src={currentTrack.thumbnail} className="w-10 h-10 rounded-md object-cover shadow-lg border border-white/5 shrink-0" alt="" />
              <div className="min-w-0 flex flex-col justify-center">
                <h4 className="text-[12px] font-bold text-white truncate">{currentTrack.title}</h4>
                <p className="text-[10px] text-white/50 font-medium truncate">{currentTrack.author}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 opacity-30">
              <div className="w-10 h-10 bg-white/10 rounded-md flex items-center justify-center">
                 <span className="material-symbols-rounded text-white/40 text-lg leading-none">music_note</span>
              </div>
              <div className="text-left">
                 <h4 className="text-[12px] font-bold text-white">Not Playing</h4>
              </div>
            </div>
          )}
        </div>

        {/* Right: Controls */}
        <div className={`flex items-center gap-2 shrink-0 ${!canControl ? 'opacity-50 pointer-events-none' : ''}`} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => playPrev()} className="w-10 h-10 text-white/70 hover:text-white flex items-center justify-center">
            <span className="material-symbols-rounded text-[26px] icon-fill leading-none">skip_previous</span>
          </button>
          <button
            onClick={() => togglePlay()}
            className="w-11 h-11 bg-white text-slate-900 rounded-full flex items-center justify-center active:scale-95 transition-all shadow-md"
          >
            <span className="material-symbols-rounded text-[28px] icon-fill leading-none">
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <button onClick={() => playNext(true)} className="w-10 h-10 text-white/70 hover:text-white flex items-center justify-center">
            <span className="material-symbols-rounded text-[26px] icon-fill leading-none">skip_next</span>
          </button>
        </div>

      </div>
    </div>
    </>
  );
};

export default Player;
