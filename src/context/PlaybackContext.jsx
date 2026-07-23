import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useOrbit } from './OrbitContext';
import { CustomAudioPlayer } from '../services/CustomAudioPlayer';

const PlaybackContext = createContext(null);

export const PlaybackProvider = ({ children }) => {
  const { stateDb, chatDb, peerId, peerRoles, status } = useOrbit();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueueState] = useState([]);
  const [originalQueue, setOriginalQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [duration, setDuration] = useState(0);
  const [isShuffled, setIsShuffledState] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [isRepeat, setIsRepeat] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [networkIsPlaying, setNetworkIsPlaying] = useState(false);

  const playerRef = useRef(null);
  const loadingTrackId = useRef(null);
  const playNextRef = useRef(null);
  const queueRef = useRef([]);
  const networkIsPlayingRef = useRef(false);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    // Initialize WebAudio Player
    const player = new CustomAudioPlayer();
    playerRef.current = player;
    player.setVolume(volume);
    
    player.onDurationChange = (dur) => setDuration(dur);
    player.onError = (e) => {
      console.error('[CustomPlayer] Error:', e);
      const isInteractError = e.message?.toLowerCase().includes('interact') || e.name === 'NotAllowedError';
      setError(isInteractError ? 'autoplay-interact-blocked' : (e.message || 'Playback failed'));
      
      if (!isInteractError) {
        setIsPlaying(false);
        isPlayingRef.current = false;
      } else {
        // It's an autoplay block. Local UI should reflect it's paused.
        setIsPlaying(false);
        // But do NOT set isPlayingRef.current to false. 
        // This way, the global interaction listener knows we STILL intend to play.
      }
    };
    player.onEnded = () => {
      if (playNextRef.current) playNextRef.current(true);
    };
    player.onBuffering = (isBuffering) => {
      setIsLoading(isBuffering);
    };
    // Keep React isPlaying in sync with actual audio context state
    player.onPlayStateChange = (playing) => {
      setIsPlaying(playing);
      isPlayingRef.current = playing;
    };

    return () => {
      player.destroy();
    };
  }, []);

  const setVolume = useCallback((val) => {
    setVolumeState(val);
    if (playerRef.current) playerRef.current.setVolume(val);
  }, []);

  const loadTrack = useCallback(async (track, targetIndex = -1, startTime = 0, autoPlay = true, originator = null) => {
    console.log(`[Playback] loadTrack started: id=${track?.id}, targetIndex=${targetIndex}, autoPlay=${autoPlay}, originator=${originator}`);
    if (!playerRef.current || !track) {
      console.log(`[Playback] loadTrack aborted: playerRef or track missing`);
      return;
    }

    const isLocal = !originator || originator === peerId;
    if (isLocal && !canControl()) {
      console.warn("Only owners and admins can play tracks in this room.");
      return;
    }

      setError(null);
      setIsLoading(true);
      // Reset playing UI state immediately so button reflects loading, but preserve isPlayingRef 
      // so we know if we INTEND to play after load finishes.
      setIsPlaying(false);
      const currentLoadId = Symbol();
      loadingTrackId.current = currentLoadId;
      
      try {
      
      let streamUrl = track.downloadUrl;
      
      if (!streamUrl) {
        throw new Error('No audio stream URL found for this track');
      }

      console.log(`[Playback] Stream URL resolved: ${streamUrl}`);
      
      const updatedTrack = { ...track, audioQuality: track.audioQuality || 'AUDIO' };
      setCurrentTrack(updatedTrack);
      setCurrentIndex(targetIndex);
      console.log(`[Playback] setCurrentTrack to: ${updatedTrack.id}, targetIndex to: ${targetIndex}`);
      
      // Ensure player is ready before loading
      if (!playerRef.current) throw new Error('Player not initialized');

      await playerRef.current.load(streamUrl, null, startTime);
      console.log(`[Playback] player load finished for trackId: ${track.id}`);
      
      if (loadingTrackId.current !== currentLoadId) {
        console.log(`[Playback] loadTrack superseded for trackId: ${track.id}, aborting state update.`);
        return;
      }

      // Broadcast if local change
      if (isLocal && stateDb) {
        try {
          await stateDb.put('currentTrack', { track: updatedTrack, index: targetIndex, originator: peerId });
        } catch (err) {
          console.error("Failed to sync playback state:", err);
        }
      }

      // Send system message about song change (only when user explicitly loads a track)
      if (isLocal && chatDb) {
        const senderName = localStorage.getItem('bloom_name') || 'Someone';
        const systemMsg = {
          text: `${senderName} is now playing ${updatedTrack.title}`,
          type: 'system',
          sender: 'System',
          timestamp: Date.now()
        };
        // Dispatch a local event so Chat component picks it up immediately
        window.dispatchEvent(new CustomEvent('bloom:chat-message', { detail: systemMsg }));
        try {
          await chatDb.add(systemMsg);
        } catch (e) { /* silent — no peers */ }
      }

      setIsLoading(false);
      if (autoPlay || isPlayingRef.current) {
        await playerRef.current.play();
        if (isLocal && stateDb) {
          stateDb.put('isPlaying', { status: true, originator: peerId }).catch(e => console.warn(e));
        }
      }
    } catch (err) {
      console.error('[Playback] Load Track Error:', err);
      const isInteractError = err.message?.toLowerCase().includes('interact') || err.name === 'NotAllowedError';
      setError(isInteractError ? 'autoplay-interact-blocked' : (err.message || 'Failed to load track'));
      setIsLoading(false);
      
      if (!isInteractError) {
        setIsPlaying(false);
        isPlayingRef.current = false;
      } else {
        // It's an autoplay block. Keep isPlayingRef.current true if we intended to play,
        // so the Global Interact Listener can resume it on next click.
        setIsPlaying(false);
        if (autoPlay) {
          isPlayingRef.current = true;
        }
      }
    } finally {
      if (loadingTrackId.current === currentLoadId) {
        loadingTrackId.current = null;
      }
    }
  }, [peerId, stateDb, chatDb]);

  // Refs for state values needed in OrbitDB event listeners to avoid dependency cycles
  const currentTrackRef = useRef(null);
  const isPlayingRef = useRef(false);
  const isRepeatRef = useRef(false);
  const peerRolesRef = useRef({});
  const statusRef = useRef('disconnected');
  const mediaSessionSyncRef = useRef({ time: 0, isPlaying: false, duration: 0 });

  useEffect(() => {
    currentTrackRef.current = currentTrack;
    isPlayingRef.current = isPlaying;
    isRepeatRef.current = isRepeat;
    peerRolesRef.current = peerRoles;
    statusRef.current = status;
  }, [currentTrack, isPlaying, isRepeat, peerRoles, status]);

  // Global Interaction Listener for Autoplay Fix
  useEffect(() => {
    const handleGlobalInteract = async () => {
      if (playerRef.current && isPlayingRef.current && !isPlaying) {
        // We intend to play, but we are currently paused locally (likely blocked)
        if (playerRef.current.audio.paused) {
          try {
            await playerRef.current.play();
            // Clear the interact error once successfully started
            if (error && (error.toLowerCase().includes('interact') || error.includes('NotAllowedError'))) {
              setError(null);
            }
          } catch (e) {
            // Still blocked or another error
          }
        }
      }
    };

    window.addEventListener('click', handleGlobalInteract, { capture: true });
    window.addEventListener('touchstart', handleGlobalInteract, { capture: true });
    window.addEventListener('keydown', handleGlobalInteract, { capture: true });

    return () => {
      window.removeEventListener('click', handleGlobalInteract, { capture: true });
      window.removeEventListener('touchstart', handleGlobalInteract, { capture: true });
      window.removeEventListener('keydown', handleGlobalInteract, { capture: true });
    };
  }, [isPlaying, error]);

  const canControl = useCallback(() => {
    if (statusRef.current !== 'connected') return true;
    const role = peerRolesRef.current[peerId];
    return role === 'owner' || role === 'admin';
  }, [peerId]);

  // Initial Sync from OrbitDB
  useEffect(() => {
    if (!stateDb) return;
    const sync = async () => {
      try {
        const syncedTrack = await stateDb.get('currentTrack');
        if (syncedTrack) {
          const track = syncedTrack.track || syncedTrack;
          const index = syncedTrack.index !== undefined ? syncedTrack.index : -1;
          
          let liveTime = 0;
          const ct = await stateDb.get('currentTime');
          if (ct && typeof ct === 'object') {
             liveTime = ct.time;
          }
          
          const isPlayingState = await stateDb.get('isPlaying');
          const isPlaying = isPlayingState ? (typeof isPlayingState === 'object' ? isPlayingState.status : isPlayingState) : false;
          networkIsPlayingRef.current = isPlaying;
          setNetworkIsPlaying(isPlaying);
          
          loadTrack(track, index, liveTime, isPlaying, 'initial-sync');
        }
        const syncedQueue = await stateDb.get('queue');
        if (syncedQueue) setQueueState(syncedQueue);
        
        const syncedOrigQueue = await stateDb.get('originalQueue');
        if (syncedOrigQueue) setOriginalQueue(syncedOrigQueue);
      } catch (e) {
        // Ignore initial sync errors
      }
    };
    sync();
  }, [stateDb]);

  const stopPlayback = useCallback(() => {
    if (playerRef.current) {
      if (playerRef.current.audio) {
        playerRef.current.audio.pause();
        playerRef.current.audio.currentTime = 0;
      }
      setIsPlaying(false);
      isPlayingRef.current = false;
      setCurrentTrack(null);
      setQueueState([]);
      setOriginalQueue([]);
      setCurrentIndex(-1);
    }
  }, []);

  // Listen to OrbitDB updates
  useEffect(() => {
    if (!stateDb) return;

    const handleUpdate = async (entry) => {
      try {
        const { key, value } = entry.payload;
        const originator = value?.originator || null;

        // Security check: Only Owner and Admin can change playback state
        const role = originator ? peerRolesRef.current[originator] : null;
        const isAuthorized = role === 'owner' || role === 'admin';

        // Standard Deduplication is handled by OrbitContext deep-equality checks.
        
        // Ignore unauthorized playback changes
        if (!isAuthorized && originator) return;

        if (key === 'currentTrack') {
          const track = value.track || value;
          const index = value.index !== undefined ? value.index : -1;
          const liveTime = value.liveTime || 0;
          console.log(`[Orbit Sync] Received currentTrack update: id=${track?.id}, index=${index}, liveTime=${liveTime}`);
          if (track?.id !== currentTrackRef.current?.id) {
             console.log(`[Orbit Sync] Loading synced track...`);
             loadTrack(track, index, liveTime, networkIsPlayingRef.current, originator);
          } else {
             console.log(`[Orbit Sync] Ignored currentTrack update (already playing)`);
          }
        } else if (key === 'isPlaying') {
          const status = typeof value === 'object' ? value.status : value;
          networkIsPlayingRef.current = status;
          setNetworkIsPlaying(status);
          console.log(`[Orbit Sync] Received isPlaying update: ${status}`);
          if (status) {
            playerRef.current?.play().catch(e => console.warn(e));
          } else {
            playerRef.current?.pause();
          }
          setIsPlaying(status);
        } else if (key === 'currentTime') {
          const time = typeof value === 'object' ? value.time : value;
          if (Math.abs(playerRef.current?.getCurrentTime() - time) > 3) {
            playerRef.current?.seek(time);
          }
        } else if (key === 'queue') {
          setQueueState(value);
        } else if (key === 'originalQueue') {
          setOriginalQueue(value);
        }
      } catch (e) {
        console.error('OrbitDB Sync Error:', e);
      }
    };

    stateDb.events.on('update', handleUpdate);
    return () => stateDb.events.off('update', handleUpdate);
  }, [stateDb, loadTrack]);

  const seek = useCallback((time) => {
    if (!canControl()) return;
    if (playerRef.current) {
      playerRef.current.seek(time);
    }
    if (stateDb) {
      stateDb.put('currentTime', { time, originator: peerId }).catch(e => console.warn('Sync Failed:', e.message));
    }
  }, [stateDb, peerId]);

  const togglePlay = useCallback(async (forceLocal = false) => {
    if (!forceLocal && !canControl()) return;
    
    if (forceLocal && isPlayingRef.current) {
      setError(null);
      await playerRef.current?.play().catch(e => console.warn('Still blocked', e));
      return;
    }

    console.log(`[Playback] togglePlay called. currentTrack: ${currentTrackRef.current?.id}`);
    if (!currentTrackRef.current) {
      if (queue.length > 0) {
        console.log(`[Playback] togglePlay: no track, playing queue[0]`);
        setCurrentIndex(0);
        loadTrack(queue[0], 0, 0, true, peerId);
      }
      return;
    }
    // Read from ref to always get latest value and avoid stale closure issues
    const newState = !isPlayingRef.current;
    console.log(`[Playback] togglePlay: toggling to ${newState}`);
    if (newState) {
      setError(null);
      await playerRef.current?.play();
    } else {
      playerRef.current?.pause();
    }
    setIsPlaying(newState);
    isPlayingRef.current = newState;
    if (canControl() && stateDb) stateDb.put('isPlaying', { status: newState, originator: peerId }).catch(e => console.warn('Sync Failed', e));
  }, [stateDb, peerId, queue, loadTrack, canControl]);

  const playNext = useCallback((autoPlay = true) => {
    if (!canControl()) return;
    if (isRepeatRef.current && currentTrackRef.current) {
      seek(0);
      if (autoPlay) {
         playerRef.current?.play();
         setIsPlaying(true);
      }
      return;
    }
    
    if (queue.length === 0) { setIsPlaying(false); return; }
    
    let nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      nextIndex = 0; // Loop back
    }
    setCurrentIndex(nextIndex);
    loadTrack(queue[nextIndex], nextIndex, 0, autoPlay, peerId);
  }, [queue, currentIndex, loadTrack, seek, peerId]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const playPrev = useCallback(() => {
    if (!canControl()) return;
    const cTime = playerRef.current?.getCurrentTime() || 0;
    if (cTime > 3) {
      seek(0);
      return;
    }
    if (queue.length === 0) return;
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = queue.length - 1;
    }
    setCurrentIndex(prevIndex);
    loadTrack(queue[prevIndex], prevIndex, 0, true, peerId);
  }, [queue, currentIndex, seek, loadTrack, peerId]);

  const addToQueue = useCallback((track) => {
    if (!canControl()) return;
    setOriginalQueue(prev => {
      const newQ = [...prev, track];
      if (stateDb) stateDb.put('originalQueue', newQ).catch(e => console.warn(e));
      return newQ;
    });
    setQueueState(prev => {
      const newQ = [...prev, track];
      if (stateDb) stateDb.put('queue', newQ).catch(e => console.warn(e));
      return newQ;
    });
  }, [canControl, stateDb]);

  const removeFromQueue = useCallback((indexToRemove) => {
    if (!canControl()) return;
    setQueueState(prev => {
      const newQ = prev.filter((_, idx) => idx !== indexToRemove);
      if (stateDb) stateDb.put('queue', newQ).catch(e => console.warn(e));
      return newQ;
    });
    // Approximate removal from original queue if needed, though active queue matters more
    const trackToRemove = queue[indexToRemove];
    setOriginalQueue(prev => {
      const idx = prev.findIndex(t => t.id === trackToRemove.id);
      if (idx !== -1) {
        const newOrigQ = prev.filter((_, i) => i !== idx);
        if (stateDb) stateDb.put('originalQueue', newOrigQ).catch(e => console.warn(e));
        return newOrigQ;
      }
      return prev;
    });
    // Adjust index if we removed something before the current track
    if (indexToRemove < currentIndex) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [queue, currentIndex, canControl, stateDb]);

  const setIsShuffled = useCallback((shuffle) => {
    if (!canControl()) return;
    setIsShuffledState(shuffle);
    if (stateDb) stateDb.put('isShuffled', shuffle).catch(e => console.warn(e));

    if (shuffle) {
      setQueueState(prevQueue => {
        if (prevQueue.length <= 1) return prevQueue;
        
        let currentIdx = currentIndex;
        if (currentTrackRef.current) {
           const actualIdx = prevQueue.findIndex(t => t.id === currentTrackRef.current.id);
           if (actualIdx !== -1) currentIdx = actualIdx;
        }

        const current = currentIdx !== -1 ? prevQueue[currentIdx] : null;
        const rest = prevQueue.filter((_, idx) => idx !== currentIdx);
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        setCurrentIndex(current ? 0 : -1);
        const newQ = current ? [current, ...rest] : rest;
        if (stateDb) stateDb.put('queue', newQ).catch(e => console.warn(e));
        return newQ;
      });
    } else {
      // Restore from originalQueue
      setQueueState(originalQueue);
      if (stateDb) stateDb.put('queue', originalQueue).catch(e => console.warn(e));
      if (currentTrackRef.current) {
        const idx = originalQueue.findIndex(t => t.id === currentTrackRef.current.id);
        setCurrentIndex(idx !== -1 ? idx : -1);
      } else {
        setCurrentIndex(-1);
      }
    }
  }, [currentIndex, originalQueue, canControl, stateDb]);

  // Media Session API for mobile notifications and OS lock screen
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      // Use higher res thumbnail if possible
      const hdThumbnail = currentTrack.thumbnail ? currentTrack.thumbnail.replace('w120-h120', 'w1080-h1080').replace('hqdefault', 'maxresdefault') : './assets/Bloom.svg';
      
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: currentTrack.title || 'Unknown Title',
        artist: currentTrack.author || 'Unknown Artist',
        album: 'Bloom',
        artwork: [
          { src: currentTrack.thumbnail || './assets/Bloom.svg', sizes: '96x96', type: 'image/jpeg' },
          { src: currentTrack.thumbnail || './assets/Bloom.svg', sizes: '128x128', type: 'image/jpeg' },
          { src: hdThumbnail, sizes: '256x256', type: 'image/jpeg' },
          { src: hdThumbnail, sizes: '512x512', type: 'image/jpeg' },
        ]
      });
    }
  }, [currentTrack]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          if (!isPlayingRef.current) togglePlay();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          if (isPlayingRef.current) togglePlay();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
        navigator.mediaSession.setActionHandler('nexttrack', () => playNext(true));
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) {
            seek(details.seekTime);
          }
        });
      } catch (err) {
        console.warn("MediaSession action handlers not supported", err);
      }
    }
  }, [togglePlay, playPrev, playNext, seek]);

  // Sync Media Session Position State (Progress Bar) — throttled to avoid per-frame calls
  useEffect(() => {
    if ('mediaSession' in navigator && duration > 0) {
      const syncMediaSession = (cTime) => {
        const lastSync = mediaSessionSyncRef.current;
        // Only update on significant time jump (seek) or play/pause state change
        const isSignificantJump = Math.abs(cTime - lastSync.time) > 5;
        const stateChanged = lastSync.isPlaying !== isPlaying || lastSync.duration !== duration;

        if (isSignificantJump || stateChanged) {
          try {
            navigator.mediaSession.setPositionState({
              duration: Math.max(0, duration),
              playbackRate: 1, // playbackRate cannot be 0 in Chrome
              position: Math.max(0, Math.min(cTime, duration))
            });
            mediaSessionSyncRef.current = { time: cTime, isPlaying, duration };
          } catch (e) {
            console.warn("MediaSession setPositionState error:", e);
            // Ensure ref updates even on error to prevent infinite error loops
            mediaSessionSyncRef.current = { time: cTime, isPlaying, duration };
          }
        }
      };

      if (playerRef.current) {
        playerRef.current.addTimeListener(syncMediaSession);
        // Initial sync
        syncMediaSession(playerRef.current.getCurrentTime());
        return () => {
          if (playerRef.current) playerRef.current.removeTimeListener(syncMediaSession);
        };
      }
    }
  }, [isPlaying, duration, playerRef.current]);

  const value = React.useMemo(() => ({
      isPlaying, isLoading, currentTrack, queue, originalQueue, addToQueue, removeFromQueue, currentIndex, setCurrentIndex,
      duration, loadTrack, togglePlay, stopPlayback, seek,
      volume, setVolume, isShuffled, setIsShuffled, isRepeat, setIsRepeat,
      playNext, playPrev, error, setError, isExpanded, setIsExpanded,
      playerRef, networkIsPlaying
  }), [isPlaying, isLoading, currentTrack, queue, originalQueue, addToQueue, removeFromQueue, currentIndex, duration, loadTrack, togglePlay, stopPlayback, seek, volume, setVolume, isShuffled, setIsShuffled, isRepeat, setIsRepeat, playNext, playPrev, error, setError, isExpanded, setIsExpanded, networkIsPlaying]);

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
};

export const usePlayback = () => useContext(PlaybackContext);
