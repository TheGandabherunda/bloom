import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useOrbit } from './OrbitContext';
import { CustomAudioPlayer } from '../services/CustomAudioPlayer';

const PlaybackContext = createContext(null);

export const PlaybackProvider = ({ children }) => {
  const { stateDb, chatDb, peerId, peerRoles } = useOrbit();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueueState] = useState([]);
  const [originalQueue, setOriginalQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isShuffled, setIsShuffledState] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [isRepeat, setIsRepeat] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const playerRef = useRef(null);
  const loadingTrackId = useRef(null);
  const playNextRef = useRef(null);
  const queueRef = useRef([]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    // Initialize WebAudio Player
    const player = new CustomAudioPlayer();
    playerRef.current = player;
    player.setVolume(volume);
    
    player.onTimeUpdate = (time) => setCurrentTime(time);
    player.onDurationChange = (dur) => setDuration(dur);
    player.onError = (e) => {
      console.error('[CustomPlayer] Error:', e);
      setError(e.message || 'Playback failed');
      setIsPlaying(false);
      isPlayingRef.current = false;
    };
    player.onEnded = () => {
      if (playNextRef.current) playNextRef.current(true);
    };
    player.onBuffering = (isBuffering) => {};
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

    try {
      setError(null);
      setIsLoading(true);
      // Reset playing state immediately so button reflects loading
      setIsPlaying(false);
      isPlayingRef.current = false;
      const currentLoadId = Symbol();
      loadingTrackId.current = currentLoadId;
      
      let streamUrl = track.downloadUrl;
      
      if (!streamUrl) {
        throw new Error('No audio stream URL found for this track');
      }

      console.log(`[Playback] Stream URL resolved: ${streamUrl}`);
      
      // Ensure player is ready before loading
      if (!playerRef.current) throw new Error('Player not initialized');

      await playerRef.current.load(streamUrl, null, startTime);
      console.log(`[Playback] player load finished for trackId: ${track.id}`);
      
      if (loadingTrackId.current !== currentLoadId) {
        console.log(`[Playback] loadTrack superseded for trackId: ${track.id}, aborting state update.`);
        return;
      }
      
      const updatedTrack = { ...track, audioQuality: track.audioQuality || 'AUDIO' };
      setCurrentTrack(updatedTrack);
      console.log(`[Playback] setCurrentTrack to: ${updatedTrack.id}, targetIndex to: ${targetIndex}`);
      
      setCurrentIndex(targetIndex);

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
      if (autoPlay) {
        // play() will fire onPlayStateChange(true) which updates isPlaying + ref
        await playerRef.current.play();
      }
    } catch (err) {
      console.error('[Playback] Load Track Error:', err);
      setError(err.message || 'Failed to load track');
      setIsLoading(false);
      setIsPlaying(false);
      isPlayingRef.current = false;
    } finally {
      if (loadingTrackId.current === track.id) {
        loadingTrackId.current = null;
      }
    }
  }, [peerId, stateDb, chatDb]);

  // Refs for state values needed in OrbitDB event listeners to avoid dependency cycles
  const currentTrackRef = useRef(null);
  const isPlayingRef = useRef(false);
  const isRepeatRef = useRef(false);
  const peerRolesRef = useRef({});

  useEffect(() => {
    currentTrackRef.current = currentTrack;
    isPlayingRef.current = isPlaying;
    isRepeatRef.current = isRepeat;
    peerRolesRef.current = peerRoles;
  }, [currentTrack, isPlaying, isRepeat, peerRoles]);

  // Initial Sync from OrbitDB
  useEffect(() => {
    if (!stateDb) return;
    const sync = async () => {
      try {
        const trackData = await stateDb.get('currentTrack');
        if (trackData) {
          const track = trackData.track || trackData;
          const index = trackData.index !== undefined ? trackData.index : -1;
          loadTrack(track, index, 0, false, 'initial-sync');
        }
      } catch (e) {
        // Ignore initial sync errors
      }
    };
    sync();
  }, [stateDb, loadTrack]);

  // Listen to OrbitDB updates
  useEffect(() => {
    if (!stateDb || !peerId) return;

    const handleUpdate = async (entry) => {
      try {
        const { key, value } = entry.payload;
        const originator = value?.originator || null;

        // Security check: Only Owner and Admin can change playback state
        const role = originator ? peerRolesRef.current[originator] : null;
        const isAuthorized = role === 'owner' || role === 'admin';

        // Standard Deduplication: Ignore updates originated by this peer
        if (originator === peerId) return;
        
        // Ignore unauthorized playback changes
        if (!isAuthorized && originator) return;

        if (key === 'currentTrack') {
          const track = value.track || value;
          const index = value.index !== undefined ? value.index : -1;
          console.log(`[Orbit Sync] Received currentTrack update: id=${track?.id}, index=${index}`);
          if (track?.id !== currentTrackRef.current?.id) {
             console.log(`[Orbit Sync] Loading synced track...`);
             loadTrack(track, index, 0, isPlayingRef.current, originator);
          } else {
             console.log(`[Orbit Sync] Ignored currentTrack update (already playing)`);
          }
        } else if (key === 'isPlaying') {
          const status = typeof value === 'object' ? value.status : value;
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
        }
      } catch (e) {
        console.error('OrbitDB Sync Error:', e);
      }
    };

    stateDb.events.on('update', handleUpdate);
    return () => stateDb.events.off('update', handleUpdate);
  }, [stateDb, peerId, loadTrack]);

  const seek = useCallback((time) => {
    if (playerRef.current) {
      playerRef.current.seek(time);
    }
    if (stateDb) {
      stateDb.put('currentTime', { time, originator: peerId }).catch(e => console.warn('Sync Failed:', e.message));
    }
  }, [stateDb, peerId]);

  const togglePlay = useCallback(async () => {
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
      await playerRef.current?.play();
    } else {
      playerRef.current?.pause();
    }
    setIsPlaying(newState);
    isPlayingRef.current = newState;
    if (stateDb) stateDb.put('isPlaying', { status: newState, originator: peerId }).catch(e => console.warn('Sync Failed', e));
  }, [stateDb, peerId, queue, loadTrack]);

  const playNext = useCallback((autoPlay = true) => {
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
    if (currentTime > 3) {
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
  }, [queue, currentIndex, currentTime, seek, loadTrack, peerId]);

  const addToQueue = useCallback((track) => {
    setOriginalQueue(prev => [...prev, track]);
    setQueueState(prev => [...prev, track]);
  }, []);

  const removeFromQueue = useCallback((indexToRemove) => {
    setQueueState(prev => prev.filter((_, idx) => idx !== indexToRemove));
    // Approximate removal from original queue if needed, though active queue matters more
    const trackToRemove = queue[indexToRemove];
    setOriginalQueue(prev => {
      const idx = prev.findIndex(t => t.id === trackToRemove.id);
      if (idx !== -1) return prev.filter((_, i) => i !== idx);
      return prev;
    });
    // Adjust index if we removed something before the current track
    if (indexToRemove < currentIndex) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [queue, currentIndex]);

  const setIsShuffled = useCallback((shuffle) => {
    setIsShuffledState(shuffle);
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
        return current ? [current, ...rest] : rest;
      });
    } else {
      // Restore from originalQueue
      setQueueState(originalQueue);
      if (currentTrackRef.current) {
        const idx = originalQueue.findIndex(t => t.id === currentTrackRef.current.id);
        setCurrentIndex(idx !== -1 ? idx : -1);
      } else {
        setCurrentIndex(-1);
      }
    }
  }, [currentIndex, originalQueue]);

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

  const value = {
      isPlaying, isLoading, currentTrack, queue, originalQueue, addToQueue, removeFromQueue, currentIndex, setCurrentIndex,
      currentTime, duration, loadTrack, togglePlay, seek,
      volume, setVolume, isShuffled, setIsShuffled, isRepeat, setIsRepeat,
      playNext, playPrev, error, setError, isExpanded, setIsExpanded,
      playerRef
  };

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
};

export const usePlayback = () => useContext(PlaybackContext);
