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

    // ─── Dynamic Auto-EQ via ScriptProcessorNode (CPU-Intensive) ───
    this.sourceNode = this.audioContext.createMediaElementSource(this.audio);

    this.lowEQ = this.audioContext.createBiquadFilter();
    this.lowEQ.type = 'lowshelf';
    this.lowEQ.frequency.value = 250;

    this.midEQ = this.audioContext.createBiquadFilter();
    this.midEQ.type = 'peaking';
    this.midEQ.frequency.value = 2000;
    this.midEQ.Q.value = 1;

    this.highEQ = this.audioContext.createBiquadFilter();
    this.highEQ.type = 'highshelf';
    this.highEQ.frequency.value = 6000;

    this.sourceNode.connect(this.lowEQ);
    this.lowEQ.connect(this.midEQ);
    this.midEQ.connect(this.highEQ);
    
    // Main signal to speakers
    this.highEQ.connect(this.audioContext.destination);

    // Analyser branch
    this.highEQ.connect(this.analyser);
    
    // Muted gain to terminate analyser and script processor quietly
    this.muteGain = this.audioContext.createGain();
    this.muteGain.gain.value = 0;
    this.analyser.connect(this.muteGain);

    // ScriptProcessor to dynamically analyze frames
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.analyser.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.muteGain);
    this.muteGain.connect(this.audioContext.destination);

    const TARGET_LOW = 180;
    const TARGET_MID = 130;
    const TARGET_HIGH = 140;

    this.scriptProcessor.onaudioprocess = () => {
      if (!this.isPlaying) return;

      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data); // 128 bins

      let lowEnergy = 0, midEnergy = 0, highEnergy = 0;
      
      // Bins 0-3 (0 - ~500Hz)
      for (let i = 0; i <= 3; i++) lowEnergy += data[i];
      lowEnergy /= 4;
      
      // Bins 4-25 (~500Hz - ~4300Hz)
      for (let i = 4; i <= 25; i++) midEnergy += data[i];
      midEnergy /= 22;

      // Bins 26-100 (~4300Hz - ~17200Hz)
      for (let i = 26; i <= 100; i++) highEnergy += data[i];
      highEnergy /= 75;

      const k = 0.05; // Smoothing factor
      
      // Calculate diff and restrict max boost/cut to +/- 10dB
      const lowDiff = (TARGET_LOW - lowEnergy) / 10; 
      this.lowEQ.gain.value += (Math.max(-10, Math.min(10, lowDiff)) - this.lowEQ.gain.value) * k;

      const midDiff = (TARGET_MID - midEnergy) / 10;
      this.midEQ.gain.value += (Math.max(-10, Math.min(10, midDiff)) - this.midEQ.gain.value) * k;

      const highDiff = (TARGET_HIGH - highEnergy) / 10;
      this.highEQ.gain.value += (Math.max(-10, Math.min(10, highDiff)) - this.highEQ.gain.value) * k;
    };

    this.volume = 1;
    this.isPlaying = false;
    this.isAborted = false;

    // Watchdog variables for stall recovery
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
      this.stallCount = 0;
    });

    this.audio.addEventListener('stalled', () => {
      this._attemptStallRecovery();
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      if (this.onPlayStateChange) this.onPlayStateChange(true);
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      this._startWatchdog();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
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
          this.audio.load();
          this.audio.currentTime = timeToRestore;
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
    this._stopWatchdog();
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
