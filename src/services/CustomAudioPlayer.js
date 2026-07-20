export class CustomAudioPlayer {
  constructor() {
    // ─── Main Audio (Plays natively to speakers, NO WebAudio distortion) ───
    this.audio = new Audio();
    this.audio.preload = 'auto'; // Maximize buffering
    
    // ─── Visualizer Audio (Cloned stream, muted, routes to WebAudio) ───
    this.visualizerAudio = new Audio();
    this.visualizerAudio.crossOrigin = 'anonymous';
    this.visualizerAudio.preload = 'auto';

    // Set up WebAudio for the visualizer
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioCtx({ latencyHint: 'playback' });
    
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048; // High resolution: 1024 bins, ~21.5 Hz per bin
    this.analyser.smoothingTimeConstant = 0.8; // Professional decay rate
    
    // Mute the visualizer audio output so we don't hear the WebAudio crackle bug
    this.muteGain = this.audioContext.createGain();
    this.muteGain.gain.value = 0; 
    
    // Connect visualizer audio -> analyser -> muted gain -> destination
    this.sourceNode = this.audioContext.createMediaElementSource(this.visualizerAudio);
    this.sourceNode.connect(this.analyser);
    this.analyser.connect(this.muteGain);
    this.muteGain.connect(this.audioContext.destination);
    
    this.volume = 1;
    this.isPlaying = false;
    this.isAborted = false;
    
    // Watchdog variables for stall recovery (monitoring main audio)
    this.watchdogInterval = null;
    this.lastTime = -1;
    this.stallCount = 0;

    // Callbacks
    this.onTimeUpdate = null;
    this.onDurationChange = null;
    this.onError = null;
    this.onEnded = null;
    this.onBuffering = null;
    this.onPlayStateChange = null;

    // ─── Sync Events ───
    this.audio.addEventListener('timeupdate', () => {
      if (this.onTimeUpdate) this.onTimeUpdate(this.audio.currentTime);
      // Auto-recover AudioContext if it suspended in the background
      if (this.isPlaying && this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      
      // Keep visualizer audio strictly in sync with main audio
      if (Math.abs(this.audio.currentTime - this.visualizerAudio.currentTime) > 0.5) {
        this.visualizerAudio.currentTime = this.audio.currentTime;
      }
    });

    this.audio.addEventListener('durationchange', () => {
      if (this.onDurationChange && !isNaN(this.audio.duration)) {
        this.onDurationChange(this.audio.duration);
      }
    });

    this.audio.addEventListener('ended', () => {
      if (this.onEnded) this.onEnded();
    });

    this.audio.addEventListener('error', (e) => {
      const error = this.audio.error;
      const msg = error ? `Error ${error.code}: ${error.message}` : 'Unknown audio error';
      console.error('[AudioPlayer] Native error:', msg);
      if (this.onError) this.onError(new Error(msg));
    });

    this.audio.addEventListener('waiting', () => {
      if (this.onBuffering) this.onBuffering(true);
    });

    this.audio.addEventListener('playing', () => {
      if (this.onBuffering) this.onBuffering(false);
      this.stallCount = 0;
    });
    
    this.audio.addEventListener('stalled', () => {
      this._attemptStallRecovery();
    });
    
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.visualizerAudio.play().catch(() => {}); // Sync clone
      if (this.onPlayStateChange) this.onPlayStateChange(true);
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      this._startWatchdog();
    });
    
    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.visualizerAudio.pause(); // Sync clone
      if (this.onPlayStateChange) this.onPlayStateChange(false);
      this._stopWatchdog();
    });
  }

  _startWatchdog() {
    this._stopWatchdog();
    this.lastTime = this.audio.currentTime;
    this.watchdogInterval = setInterval(() => {
      if (!this.isPlaying) return;

      const currentTime = this.audio.currentTime;
      if (currentTime === this.lastTime && !this.audio.ended && this.audio.readyState < 3) {
        this.stallCount++;
        if (this.stallCount === 2) {
          this.audio.currentTime = currentTime + 0.001;
        } else if (this.stallCount >= 5) {
          const currentSrc = this.audio.src;
          const timeToRestore = this.audio.currentTime;
          
          this.audio.src = currentSrc;
          this.visualizerAudio.src = currentSrc;
          
          this.audio.load();
          this.visualizerAudio.load();
          
          this.audio.currentTime = timeToRestore;
          this.visualizerAudio.currentTime = timeToRestore;
          
          this.audio.play().catch(() => {});
          this.stallCount = 0;
        }
      } else {
        this.stallCount = 0;
      }
      this.lastTime = currentTime;
    }, 1000);
  }

  _stopWatchdog() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    this.stallCount = 0;
  }

  _attemptStallRecovery() {
    if (this.isPlaying && this.audio.readyState < 3) {
      const time = this.audio.currentTime;
      if (time > 0) this.audio.currentTime = time + 0.0001;
    }
  }

  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(0);
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.audio) {
      this.audio.volume = this.volume;
      // Note: We don't change visualizerAudio volume because it's fully muted via GainNode anyway
    }
  }

  getCurrentTime() {
    return this.audio ? this.audio.currentTime : 0;
  }

  async load(manifestUrl, unused = null, startTime = 0) {
    console.log(`[AudioPlayer] load called with URL: ${manifestUrl}, startTime: ${startTime}`);
    this.isAborted = false;
    this._stopWatchdog();
    
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const blob = await response.blob();
      if (this.isAborted) return; 
      
      this.currentObjectUrl = URL.createObjectURL(blob);
      
      // Feed both players the local RAM blob
      this.audio.src = this.currentObjectUrl;
      this.visualizerAudio.src = this.currentObjectUrl;
    } catch (err) {
      console.warn('[AudioPlayer] Pre-buffer failed, falling back to direct stream:', err);
      if (this.isAborted) return;
      this.audio.src = manifestUrl;
      this.visualizerAudio.src = manifestUrl;
    }

    this.audio.currentTime = startTime;
    this.visualizerAudio.currentTime = startTime;
    
    this.audio.load();
    this.visualizerAudio.load();
  }

  async play() {
    if (this.isAborted) return;
    try {
      if (this.audioContext.state === 'suspended') {
         await this.audioContext.resume();
      }
      await this.audio.play();
      // visualizerAudio.play() is handled in the 'play' event listener
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('[AudioPlayer] play error:', e);
        if (this.onError) this.onError(e);
      }
    }
  }

  pause() {
    if (this.audio) {
      this.audio.pause();
    }
  }

  seek(time) {
    if (this.audio) {
      this.audio.currentTime = time;
      this.visualizerAudio.currentTime = time;
    }
  }

  destroy() {
    this.isAborted = true;
    this._stopWatchdog();
    this.pause();
    if (this.audio) {
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    if (this.visualizerAudio) {
      this.visualizerAudio.removeAttribute('src');
      this.visualizerAudio.load();
    }
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {}
    }
  }
}
