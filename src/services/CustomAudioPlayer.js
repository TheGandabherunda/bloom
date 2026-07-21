export class CustomAudioPlayer {
  constructor() {
    // ─── Single Audio element (plays to speakers AND feeds the analyser) ───
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous'; // Required for MediaElementSource CORS

    // ─── WebAudio: single MediaElementSource → split to speakers + analyser ───
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioCtx({ latencyHint: 'playback' });

    // Lower fftSize: 256 gives 128 bins — more than enough for 48 visualizer bars
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.frequencyDataArray = new Uint8Array(this.analyser.frequencyBinCount);

    // Use captureStream if available to bypass the Chromium MediaElementSource buffering stall bug
    try {
      const stream = this.audio.captureStream ? this.audio.captureStream() : this.audio.mozCaptureStream ? this.audio.mozCaptureStream() : null;
      if (stream) {
        this.sourceNode = this.audioContext.createMediaStreamSource(stream);
        // Connect ONLY to analyser. Do NOT connect to destination to avoid echoing native audio.
        this.sourceNode.connect(this.analyser);
      } else {
        throw new Error('captureStream not supported');
      }
    } catch (e) {
      console.warn("[CustomAudioPlayer] captureStream failed/unsupported. Falling back to MediaElementSource.", e);
      this.sourceNode = this.audioContext.createMediaElementSource(this.audio);
      
      this.muteGain = this.audioContext.createGain();
      this.muteGain.gain.value = 0;
      
      this.sourceNode.connect(this.audioContext.destination);
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.muteGain);
      this.muteGain.connect(this.audioContext.destination);
    }

    this.volume = 1;
    this.isPlaying = false;
    this.isAborted = false;

    // Watchdog variables for stall recovery
    this.watchdogInterval = null;
    this.lastTime = -1;
    this.stallCount = 0;

    // Centralized Visualizer Engine
    this.visualizers = [];
    this.visualizerFrameId = null;
    this.visualizerLastTime = 0;

    // Callbacks
    this.onTimeUpdate = null;
    this.onDurationChange = null;
    this.onError = null;
    this.onEnded = null;
    this.onBuffering = null;
    this.onPlayStateChange = null;

    // ─── Events ───
    this.audio.addEventListener('timeupdate', () => {
      if (this.onTimeUpdate) this.onTimeUpdate(this.audio.currentTime);
      // Auto-recover AudioContext suspended in background
      if (this.isPlaying && this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
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
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      if (this.onPlayStateChange) this.onPlayStateChange(true);
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      this._startVisualizerLoop();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      if (this.onPlayStateChange) this.onPlayStateChange(false);
      this._stopVisualizerLoop();
    });
  }

  addVisualizer(callback) {
    if (!this.visualizers.includes(callback)) {
      this.visualizers.push(callback);
      this._startVisualizerLoop();
    }
  }

  removeVisualizer(callback) {
    this.visualizers = this.visualizers.filter(cb => cb !== callback);
    if (this.visualizers.length === 0) this._stopVisualizerLoop();
  }

  _startVisualizerLoop() {
    if (this.visualizerFrameId || !this.isPlaying || this.visualizers.length === 0) return;
    
    const fps = 30; // Hard cap at 30fps to prevent mobile CPU thermal throttling
    const frameInterval = 1000 / fps;
    
    const loop = (time) => {
      this.visualizerFrameId = requestAnimationFrame(loop);
      
      if (!time) time = performance.now();
      const elapsed = time - this.visualizerLastTime;
      if (elapsed < frameInterval) return;
      this.visualizerLastTime = time - (elapsed % frameInterval);

      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(this.frequencyDataArray);
      
      // Dispatch single read to all subscribers
      for (const callback of this.visualizers) {
        callback(this.frequencyDataArray);
      }
    };
    this.visualizerFrameId = requestAnimationFrame(loop);
  }

  _stopVisualizerLoop() {
    if (this.visualizerFrameId) {
      cancelAnimationFrame(this.visualizerFrameId);
      this.visualizerFrameId = null;
    }
  }

  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(0);
    this.analyser.getByteFrequencyData(this.frequencyDataArray);
    return this.frequencyDataArray;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.audio) {
      this.audio.volume = this.volume;
    }
  }



  getCurrentTime() {
    return this.audio ? this.audio.currentTime : 0;
  }

  async load(manifestUrl, unused = null, startTime = 0) {
    console.log(`[AudioPlayer] load called with URL: ${manifestUrl}, startTime: ${startTime}`);
    this.isAborted = false;

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    this.audio.src = manifestUrl;
    this.audio.currentTime = startTime;
    this.audio.load();
  }

  async play() {
    if (this.isAborted) return;
    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      await this.audio.play();
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
    }
  }

  destroy() {
    this.isAborted = true;
    this._stopVisualizerLoop();
    this.visualizers = [];
    this.pause();
    if (this.audio) {
      this.audio.removeAttribute('src');
      this.audio.load();
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
