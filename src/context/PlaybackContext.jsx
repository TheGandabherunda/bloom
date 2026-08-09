/* eslint-disable react-hooks/exhaustive-deps */  
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useOrbit } from './OrbitContext';
import { CustomAudioPlayer } from '../services/CustomAudioPlayer';
import { decodeHtml, resolveTrackStream } from '../services/musicApi';

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
  const originalQueueRef = useRef([]);
  const currentIndexRef = useRef(-1);
  const networkIsPlayingRef = useRef(false);
  const peerIdRef = useRef(peerId);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    originalQueueRef.current = originalQueue;
  }, [originalQueue]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    peerIdRef.current = peerId;
  }, [peerId]);

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
      // ONLY the Host is allowed to automatically advance the queue
      if (peerRolesRef.current[peerIdRef.current] === 'owner') {
        if (playNextRef.current) playNextRef.current(true);
      } else {
        console.log('[Playback] Local audio ended. Waiting for Host to sync next track.');
      }
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
    
    const isOwner = peerRolesRef.current[peerId] === 'owner';
    if (isLocal && !isOwner) {
       console.log(`[Playback] Admin intent dispatched to Host for track: ${track.id}`);
       if (stateDb) {
           const updatedTrack = { 
            ...track, 
            title: decodeHtml(track.title || ''),
            author: decodeHtml(track.author || ''),
            audioQuality: track.audioQuality || 'AUDIO' 
          };
          const resolvedIndex = targetIndex !== -1 ? targetIndex : (queueRef.current ? queueRef.current.findIndex(t => t.id === track.id) : -1);
          
          try {
            await stateDb.put('currentTrack', { 
              track: updatedTrack, 
              index: resolvedIndex, 
              originator: peerId,
              startTime: startTime || 0,
              timestamp: Date.now(),
              autoPlay: autoPlay
            });
            if (autoPlay) {
              await stateDb.put('isPlaying', { status: true, originator: peerId });
            }
          } catch (err) {
            console.error("Failed to sync playback intent:", err);
          }
       }
       // Optimistic UI for loading state
       setIsLoading(true);
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
      
      const updatedTrack = { 
        ...track, 
        title: decodeHtml(track.title || ''),
        author: decodeHtml(track.author || ''),
        audioQuality: track.audioQuality || 'AUDIO' 
      };
      const resolvedIndex = targetIndex !== -1 
        ? targetIndex 
        : (queueRef.current ? queueRef.current.findIndex(t => t.id === track.id) : -1);

      setCurrentTrack(updatedTrack);
      setCurrentIndex(resolvedIndex);
      currentIndexRef.current = resolvedIndex;
      console.log(`[Playback] setCurrentTrack to: ${updatedTrack.id}, resolvedIndex to: ${resolvedIndex}`);
      
      // Ensure player is ready before loading
      if (!playerRef.current) throw new Error('Player not initialized');

      await playerRef.current.load(streamUrl, autoPlay, startTime);
      console.log(`[Playback] player load finished for trackId: ${track.id}`);
      
      if (loadingTrackId.current !== currentLoadId) {
        console.log(`[Playback] loadTrack superseded for trackId: ${track.id}, aborting state update.`);
        return;
      }

      // Broadcast if local change
      if (isLocal && stateDb) {
        try {
          await stateDb.put('currentTrack', { 
            track: updatedTrack, 
            index: targetIndex, 
            originator: peerId,
            startTime: startTime || 0,
            timestamp: Date.now()
          });
        } catch (err) {
          console.error("Failed to sync playback state:", err);
        }
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
      
      // If we failed to load due to a 403 (e.g. JioSaavn stream URL expired), re-resolve it once
      if (err.message && err.message.includes('403') && !track._resolved) {
         console.log(`[Playback] Track stream likely expired. Attempting to resolve fresh URL for ${track.id}...`);
         const freshUrl = await resolveTrackStream(track.id);
         if (freshUrl) {
           const freshTrack = { ...track, downloadUrl: freshUrl, _resolved: true };
           // Don't change index or time, just reload silently
           return loadTrack(freshTrack, targetIndex, startTime, autoPlay, originator);
         }
      }

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

  // ONLY Host (Room Owner) periodically syncs real audio playhead position to stateDb
  useEffect(() => {
    const isOwner = peerRolesRef.current[peerId] === 'owner';
    if (!isPlaying || !isOwner || !stateDb) return;
    
    const interval = setInterval(() => {
      if (playerRef.current && isPlaying) {
        const curTime = playerRef.current.getCurrentTime();
        if (curTime > 0) {
          stateDb.put('currentTime', { time: curTime, trackId: currentTrackRef.current?.id, originator: peerId, timestamp: Date.now() }).catch(() => {});
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isPlaying, stateDb, peerId, peerRoles]);

  // Initial Sync from OrbitDB
  useEffect(() => {
    if (!stateDb) return;
    const sync = async () => {
      try {
        const syncedTrack = await stateDb.get('currentTrack');
        if (syncedTrack) {
          const track = syncedTrack.track || syncedTrack;
          const index = syncedTrack.index !== undefined ? syncedTrack.index : -1;
          
          const isPlayingState = await stateDb.get('isPlaying');
          const isPlaying = isPlayingState ? (typeof isPlayingState === 'object' ? isPlayingState.status : isPlayingState) : false;
          networkIsPlayingRef.current = isPlaying;
          setNetworkIsPlaying(isPlaying);
          
          let computedLiveTime = 0;
          const ct = await stateDb.get('currentTime');
          if (ct && typeof ct === 'object' && isPlaying) {
             if (ct.trackId === track?.id) {
               computedLiveTime = ct.time;
             } else {
               computedLiveTime = syncedTrack.startTime || 0;
             }
          } else if (isPlaying) {
             computedLiveTime = syncedTrack.startTime || 0;
          }
          
          loadTrack(track, index, computedLiveTime, isPlaying, 'initial-sync');
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
        let role = originator ? peerRolesRef.current[originator] : null;
        if (!role && originator && stateDb) {
           role = await stateDb.get(`peer_role_${originator}`);
        }
        const isAuthorized = role === 'owner' || role === 'admin';

        // Standard Deduplication is handled by OrbitContext deep-equality checks.
        
        // Ignore unauthorized playback changes
        if (!isAuthorized && originator) return;

        if (key === 'currentTrack') {
          const track = value.track || value;
          let index = value.index !== undefined ? value.index : -1;
          
          if (track?.id && queueRef.current?.length > 0) {
            const actualQueueIdx = queueRef.current.findIndex(t => t.id === track.id);
            if (actualQueueIdx !== -1) {
              index = actualQueueIdx;
            }
          }

          let computedLiveTime = value.startTime || 0;
          const ct = stateDb ? await stateDb.get('currentTime') : null;
          const isPlayingState = stateDb ? await stateDb.get('isPlaying') : false;
          const isPlaying = isPlayingState ? (typeof isPlayingState === 'object' ? isPlayingState.status : isPlayingState) : false;

          if (ct && typeof ct === 'object' && isPlaying && ct.trackId === track?.id) {
             computedLiveTime = ct.time;
          } else if (value.liveTime !== undefined) {
             computedLiveTime = value.liveTime;
          }
          
          const shouldPlay = value.autoPlay !== undefined ? value.autoPlay : networkIsPlayingRef.current;
          
          if (track?.duration) {
             computedLiveTime = Math.min(computedLiveTime, track.duration - 1);
          }

          console.log(`[Orbit Sync] Received currentTrack update: id=${track?.id}, index=${index}, computedLiveTime=${computedLiveTime}`);
          if (track?.id !== currentTrackRef.current?.id) {
             console.log(`[Orbit Sync] Loading synced track...`);
             loadTrack(track, index, computedLiveTime, shouldPlay, 'network-sync');
          } else {
             if (index !== -1) {
               setCurrentIndex(index);
               currentIndexRef.current = index;
             }
             console.log(`[Orbit Sync] Updated index for currently playing track: ${index}`);
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
        } else if (key === 'currentTime') {
          if (originator === peerId) return; // Prevent Host jitter from self-echoed time
          const time = typeof value === 'object' ? value.time : value;
          const timestamp = typeof value === 'object' ? value.timestamp : null;
          const trackId = typeof value === 'object' ? value.trackId : null;
          
          if (trackId && currentTrackRef.current?.id !== trackId) return; // Ignore stale time updates
          
          let targetTime = time;
          if (Math.abs(playerRef.current?.getCurrentTime() - targetTime) > 3) {
            playerRef.current?.seek(targetTime);
          }
        } else if (key === 'queue') {
          const newQueue = value || [];
          setQueueState(newQueue);
          queueRef.current = newQueue;

          // Re-index currentTrack in the new queue so peers stay on the right track & index
          if (currentTrackRef.current) {
            const newIndex = newQueue.findIndex(t => t.id === currentTrackRef.current.id);
            if (newIndex !== -1) {
              console.log(`[Queue Sync] Re-indexed currentTrack "${currentTrackRef.current.title}" to ${newIndex}`);
              setCurrentIndex(newIndex);
              currentIndexRef.current = newIndex;
            }
          }
        } else if (key === 'originalQueue') {
          setOriginalQueue(value);
        } else if (key === 'isShuffled') {
          setIsShuffledState(value);
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
    
    const isOwner = peerRolesRef.current[peerId] === 'owner';
    if (isOwner) {
      if (playerRef.current) playerRef.current.seek(time);
    }
    
    if (stateDb) {
      stateDb.put('currentTime', { time, trackId: currentTrackRef.current?.id, originator: peerId, timestamp: Date.now() }).catch(e => console.warn('Sync Failed:', e.message));
    }
  }, [stateDb, peerId, canControl]);

  const togglePlay = useCallback(async (forceLocal = false) => {
    if (!forceLocal && !canControl()) return;
    
    if (forceLocal) {
      setError(null);
      await playerRef.current?.play().catch(e => console.warn('Still blocked', e));
      setIsPlaying(true);
      isPlayingRef.current = true;
      if (stateDb) {
        try {
          const isPlayingState = await stateDb.get('isPlaying');
          const isPlaying = isPlayingState ? (typeof isPlayingState === 'object' ? isPlayingState.status : isPlayingState) : false;
          
          if (isPlaying) {
            let currentPos = 0;
            const ct = await stateDb.get('currentTime');
            if (ct && typeof ct === 'object') {
              currentPos = ct.time;
            } else {
              const syncedTrack = await stateDb.get('currentTrack');
              currentPos = syncedTrack?.startTime || 0;
            }
            if (playerRef.current && currentPos > 0) {
               console.log(`[Playback] Force resyncing audio seek position to ${currentPos.toFixed(1)}s on user unblock.`);
               playerRef.current.seek(currentPos);
            }
          }
        } catch (e) {
          console.error('[Playback] Force resync error:', e);
        }
      }
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
    
    const isOwner = peerRolesRef.current[peerId] === 'owner';
    if (isOwner) {
      if (newState) {
        setError(null);
        await playerRef.current?.play();
      } else {
        playerRef.current?.pause();
      }
      setIsPlaying(newState);
      isPlayingRef.current = newState;
    } else {
      // Optimistic UI update for Play/Pause button
      setIsPlaying(newState);
    }
    
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
    
    const activeQueue = queueRef.current;
    if (activeQueue.length === 0) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      return;
    }
    
    let activeIdx = currentIndexRef.current;
    if (currentTrackRef.current && !loadingTrackId.current) {
      const actualIdx = activeQueue.findIndex(t => t.id === currentTrackRef.current.id);
      if (actualIdx !== -1) activeIdx = actualIdx;
    }

    let nextIndex = activeIdx + 1;
    if (nextIndex >= activeQueue.length) {
      // Reached the end of the queue: stop playback instead of looping back to the beginning
      console.log('[Playback] End of queue reached. Stopping playback.');
      setIsPlaying(false);
      isPlayingRef.current = false;
      const isOwner = peerRolesRef.current[peerId] === 'owner';
      if (isOwner) {
        playerRef.current?.pause();
      }
      if (canControl() && stateDb) {
        stateDb.put('isPlaying', { status: false, originator: peerId }).catch(e => console.warn('Sync Failed', e));
      }
      return;
    }

    const isOwner = peerRolesRef.current[peerId] === 'owner';
    if (!isOwner) {
      // Optimistic UI updates
      setCurrentIndex(nextIndex);
      currentIndexRef.current = nextIndex;
      setIsLoading(true);
      // Just dispatch intent by calling loadTrack, which we modified to handle intent dispatch when isOwner=false
      loadTrack(activeQueue[nextIndex], nextIndex, 0, autoPlay, peerId);
      return;
    }

    setCurrentIndex(nextIndex);
    currentIndexRef.current = nextIndex;
    loadTrack(activeQueue[nextIndex], nextIndex, 0, autoPlay, peerId);
  }, [loadTrack, seek, peerId, canControl, stateDb]);

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
    const activeQueue = queueRef.current;
    if (activeQueue.length === 0) return;

    let activeIdx = currentIndexRef.current;
    if (currentTrackRef.current && !loadingTrackId.current) {
      const actualIdx = activeQueue.findIndex(t => t.id === currentTrackRef.current.id);
      if (actualIdx !== -1) activeIdx = actualIdx;
    }

    let prevIndex = Math.max(0, activeIdx - 1);
    
    const isOwner = peerRolesRef.current[peerId] === 'owner';
    if (!isOwner) {
      // Optimistic UI updates
      setCurrentIndex(prevIndex);
      currentIndexRef.current = prevIndex;
      setIsLoading(true);
      loadTrack(activeQueue[prevIndex], prevIndex, 0, true, peerId);
      return;
    }

    setCurrentIndex(prevIndex);
    currentIndexRef.current = prevIndex;
    loadTrack(activeQueue[prevIndex], prevIndex, 0, true, peerId);
  }, [seek, loadTrack, peerId, canControl]);

  const addToQueue = useCallback((track) => {
    if (!canControl()) return;
    if (originalQueueRef.current.some(t => t.id === track.id)) return;

    const newOrig = [...originalQueueRef.current, track];
    const newQ = [...queueRef.current, track];

    originalQueueRef.current = newOrig;
    setOriginalQueue(newOrig);

    queueRef.current = newQ;
    setQueueState(newQ);

    if (stateDb) {
      stateDb.put('originalQueue', newOrig).catch(e => console.warn(e));
      stateDb.put('queue', newQ).catch(e => console.warn(e));
    }
  }, [canControl, stateDb]);

  const addMultipleToQueue = useCallback((tracks) => {
    if (!canControl() || !tracks || tracks.length === 0) return;

    const uniqueTracks = tracks.filter(track => !originalQueueRef.current.some(t => t.id === track.id));
    if (uniqueTracks.length === 0) return;

    const newOrig = [...originalQueueRef.current, ...uniqueTracks];
    const newQ = [...queueRef.current, ...uniqueTracks];

    originalQueueRef.current = newOrig;
    setOriginalQueue(newOrig);

    queueRef.current = newQ;
    setQueueState(newQ);

    if (stateDb) {
      stateDb.put('originalQueue', newOrig).catch(e => console.warn(e));
      stateDb.put('queue', newQ).catch(e => console.warn(e));
    }
  }, [canControl, stateDb]);

  const removeFromQueue = useCallback((indexToRemove) => {
    if (!canControl()) return;
    
    const newQ = queueRef.current.filter((_, idx) => idx !== indexToRemove);
    queueRef.current = newQ;
    setQueueState(newQ);
    
    if (stateDb) stateDb.put('queue', newQ).catch(e => console.warn(e));

    // Approximate removal from original queue if needed, though active queue matters more
    const trackToRemove = queueRef.current[indexToRemove];
    if (trackToRemove) {
      const idx = originalQueueRef.current.findIndex(t => t.id === trackToRemove.id);
      if (idx !== -1) {
        const newOrigQ = originalQueueRef.current.filter((_, i) => i !== idx);
        originalQueueRef.current = newOrigQ;
        setOriginalQueue(newOrigQ);
        if (stateDb) stateDb.put('originalQueue', newOrigQ).catch(e => console.warn(e));
      }
    }

    // Adjust index if we removed something before the current track
    if (indexToRemove < currentIndexRef.current) {
      const newIndex = currentIndexRef.current - 1;
      currentIndexRef.current = newIndex;
      setCurrentIndex(newIndex);
    }
  }, [canControl, stateDb]);

  const reorderQueue = useCallback((fromIndex, toIndex) => {
    if (!canControl()) return;
    const prev = queueRef.current;
    
    if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length || fromIndex === toIndex) {
      return;
    }

    const newQ = [...prev];
    const [movedItem] = newQ.splice(fromIndex, 1);
    newQ.splice(toIndex, 0, movedItem);

    queueRef.current = newQ;
    setQueueState(newQ);

    let newCurrentIndex = currentIndexRef.current;
    if (currentTrackRef.current) {
      const foundIdx = newQ.findIndex(t => t.id === currentTrackRef.current.id);
      if (foundIdx !== -1) {
        newCurrentIndex = foundIdx;
      }
    } else {
      if (currentIndexRef.current === fromIndex) {
        newCurrentIndex = toIndex;
      } else if (fromIndex < currentIndexRef.current && toIndex >= currentIndexRef.current) {
        newCurrentIndex = currentIndexRef.current - 1;
      } else if (fromIndex > currentIndexRef.current && toIndex <= currentIndexRef.current) {
        newCurrentIndex = currentIndexRef.current + 1;
      }
    }

    setCurrentIndex(newCurrentIndex);
    currentIndexRef.current = newCurrentIndex;

    if (stateDb) {
      stateDb.put('queue', newQ).catch(e => console.warn('Failed to sync reordered queue:', e));
      if (currentTrackRef.current && newCurrentIndex !== -1) {
        stateDb.put('currentTrack', {
          track: currentTrackRef.current,
          index: newCurrentIndex,
          originator: peerId,
          timestamp: Date.now()
        }).catch(e => console.warn(e));
      }
    }
  }, [canControl, stateDb, peerId]);

  const moveQueueItem = useCallback((index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    reorderQueue(index, targetIndex);
  }, [reorderQueue]);

  const setIsShuffled = useCallback((shuffle) => {
    if (!canControl()) return;
    setIsShuffledState(shuffle);
    if (stateDb) stateDb.put('isShuffled', shuffle).catch(e => console.warn(e));

    if (shuffle) {
      const prevQueue = queueRef.current;
      if (prevQueue.length <= 1) return;
      
      let currentIdx = currentIndexRef.current;
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
      
      const newQ = current ? [current, ...rest] : rest;
      const newIdx = current ? 0 : -1;
      
      setCurrentIndex(newIdx);
      currentIndexRef.current = newIdx;
      setQueueState(newQ);
      queueRef.current = newQ;
      
      if (stateDb) stateDb.put('queue', newQ).catch(e => console.warn(e));
    } else {
      // Restore from originalQueue
      const orig = originalQueueRef.current;
      setQueueState(orig);
      queueRef.current = orig;
      
      if (stateDb) stateDb.put('queue', orig).catch(e => console.warn(e));
      if (currentTrackRef.current) {
        const idx = orig.findIndex(t => t.id === currentTrackRef.current.id);
        setCurrentIndex(idx !== -1 ? idx : -1);
        currentIndexRef.current = idx !== -1 ? idx : -1;
      } else {
        setCurrentIndex(-1);
        currentIndexRef.current = -1;
      }
    }
  }, [canControl, stateDb]);

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
      isPlaying, isLoading, currentTrack, queue, originalQueue, addToQueue, addMultipleToQueue, removeFromQueue, reorderQueue, moveQueueItem, currentIndex, setCurrentIndex,
      duration, loadTrack, togglePlay, stopPlayback, seek,
      volume, setVolume, isShuffled, setIsShuffled, isRepeat, setIsRepeat,
      playNext, playPrev, error, setError, isExpanded, setIsExpanded,
      playerRef, networkIsPlaying
  }), [isPlaying, isLoading, currentTrack, queue, originalQueue, addToQueue, addMultipleToQueue, removeFromQueue, reorderQueue, moveQueueItem, currentIndex, duration, loadTrack, togglePlay, stopPlayback, seek, volume, setVolume, isShuffled, setIsShuffled, isRepeat, setIsRepeat, playNext, playPrev, error, setError, isExpanded, setIsExpanded, networkIsPlaying]);

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
};

export const usePlayback = () => useContext(PlaybackContext);
