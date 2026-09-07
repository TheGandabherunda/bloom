/* eslint-disable no-empty, no-unused-vars */  
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

    this.sourceNode = this.audioContext.createMediaElementSource(this.audio);

    this.muteGain = this.audioContext.createGain();
    this.muteGain.gain.value = 0;

    // ─── Sound Engine / DSP Chain ───
    this.headroomGain = this.audioContext.createGain();
    this.headroomGain.gain.value = 1;

    // 10-Band Parametric EQ Pool (Dynamically Reconfigured per Profile)
    this.eqBands = Array.from({ length: 10 }).map(() => {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = 1000;
      filter.gain.value = 0;
      filter.Q.value = 1.0; 
      return filter;
    });

    this.compressor = this.audioContext.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 1;
    // Professional Master Bus Settings: Slow attack preserves the kick drum punch, fast release keeps energy high
    this.compressor.attack.value = 0.03;  // 30ms 
    this.compressor.release.value = 0.1;  // 100ms

    this.finalGain = this.audioContext.createGain();
    this.finalGain.gain.value = 1;

    // Connect DSP Chain
    this.sourceNode.connect(this.headroomGain);
    
    let currentLastNode = this.headroomGain;
    for (const filter of this.eqBands) {
      currentLastNode.connect(filter);
      currentLastNode = filter;
    }
    
    currentLastNode.connect(this.compressor);
    this.compressor.connect(this.finalGain);

    this.finalGain.connect(this.audioContext.destination);
    
    // Connect to Visualizer
    this.finalGain.connect(this.analyser);
    this.analyser.connect(this.muteGain);
    this.muteGain.connect(this.audioContext.destination);


    this.audioContext.addEventListener('statechange', () => {
      console.log(`[DEBUG] AudioContext state changed to: ${this.audioContext.state}`);
    });

    this.volume = 1;
    this.isPlaying = false;
    this.isAborted = false;

    this.watchdogInterval = null;
    this.lastTime = -1;
    this.stallCount = 0;
    
    // 🚨 CORS BYPASS DETECTOR 🚨
    // Runs globally every 2 seconds to check if WebAudio is actually receiving data
    setInterval(() => {
      if (this.isPlaying && this.audioContext.state === 'running') {
        const testArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(testArray);
        let isDead = true;
        for (let i = 0; i < 20; i++) {
          if (testArray[i] > 0) {
            isDead = false;
            break;
          }
        }
        if (isDead) {
          console.error("🚨 CORS BYPASS DETECTED 🚨: The music server (saavncdn) is not sending CORS headers. Your browser has completely disabled the Equalizer to prevent data theft. You are hearing the RAW, un-EQ'd audio straight from the browser.");
        }
      }
    }, 2000);

    // Centralized Visualizer Engine
    this.visualizers = [];
    this.visualizerFrameId = null;
    // Centralized Time Engine
    this.timeListeners = [];

    // Track active load rejection
    this.rejectActiveLoad = null;

    // Callbacks
    this.onDurationChange = null;
    this.onError = null;
    this.onEnded = null;
    this.onBuffering = null;
    this.onPlayStateChange = null;

    // ─── Events ───
    let lastTimeUpdate = performance.now();
    let lastAudioTime = 0;

    this.audio.addEventListener('timeupdate', () => {
      const now = performance.now();
      const deltaReal = now - lastTimeUpdate;
      const deltaAudio = (this.audio.currentTime - lastAudioTime) * 1000;
      
      if (deltaReal > 500 && this.isPlaying) {
        console.warn(`[DEBUG] timeupdate delayed! Real time passed: ${deltaReal.toFixed(1)}ms, Audio advanced: ${deltaAudio.toFixed(1)}ms`);
      }
      
      lastTimeUpdate = now;
      lastAudioTime = this.audio.currentTime;

      // Dispatch single read to all subscribers
      for (const callback of this.timeListeners) {
        callback(this.audio.currentTime);
      }
      
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
      // We don't trigger onEnded here to avoid infinite skip loops on broken URLs
      if (this.onError) this.onError(new Error(msg));
    });

    this.audio.addEventListener('waiting', () => {
      console.log(`[DEBUG] 'waiting' event fired - stream is buffering. Current time: ${this.audio.currentTime}`);
      if (this.onBuffering) this.onBuffering(true);
    });

    this.audio.addEventListener('stalled', () => {
      console.warn(`[DEBUG] 'stalled' event fired - network is not sending data.`);
    });

    this.audio.addEventListener('suspend', () => {
      console.log(`[DEBUG] 'suspend' event fired - browser stopped fetching (buffer full).`);
    });

    this.audio.addEventListener('progress', () => {
      if (this.audio.buffered.length > 0) {
        const bufferedEnd = this.audio.buffered.end(this.audio.buffered.length - 1);
        // console.log(`[DEBUG] 'progress' - Buffer end at: ${bufferedEnd.toFixed(2)}s`);
      }
    });

    this.audio.addEventListener('playing', () => {
      console.log(`[DEBUG] 'playing' event fired - buffer recovered. Current time: ${this.audio.currentTime}`);
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

  addTimeListener(callback) {
    if (!this.timeListeners.includes(callback)) {
      this.timeListeners.push(callback);
    }
  }

  removeTimeListener(callback) {
    this.timeListeners = this.timeListeners.filter(cb => cb !== callback);
  }

  _startVisualizerLoop() {
    if (this.visualizerFrameId || !this.isPlaying || this.visualizers.length === 0) return;
    
    const fps = 30; // Hard cap at 30fps to prevent mobile CPU thermal throttling
    const frameInterval = 1000 / fps;
    
    this.visualizerLastTime = performance.now();

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
    
    // Debugging: Check if graph is bypassed (CORS issue)
    if (this.isPlaying && this.audioContext.state === 'running') {
      let isDead = true;
      // Only check the first few bins which should definitely have energy if music is playing
      for (let i = 0; i < 20; i++) {
        if (this.frequencyDataArray[i] > 0) {
          isDead = false;
          break;
        }
      }
      if (isDead && !this._corsWarned) {
        console.error("[DEBUG-AUDIO] 🚨 CRITICAL ERROR 🚨: The Web Audio Engine is receiving NO DATA (all zeros). Your browser is playing the music directly to the speakers but BYPASSING the Equalizer entirely because of a CORS security restriction on the audio stream URL. The EQ cannot work until the stream URL provides an 'Access-Control-Allow-Origin: *' header.");
        this._corsWarned = true;
      } else if (!isDead && this._corsWarned) {
        console.log("[DEBUG-AUDIO] Audio data is flowing through the DSP chain successfully.");
        this._corsWarned = false; // reset if it recovers
      }
    }
    
    return this.frequencyDataArray;
  }

  setSoundEngineMode(mode) {
    this.soundMode = mode;
    const now = this.audioContext.currentTime;
    console.log(`[SoundEngine] Switching mode to: ${mode} at context time: ${now}`);
    
    
    // Smooth transition time
    const t = 0.5; 

    // Helper to instantly set value to avoid any browser AudioContext scheduling bugs
    const setVal = (param, val) => {
      // Set instantly instead of using setTargetAtTime
      param.value = val;
    };

    switch (mode) {
      case 'off':
        // TRUE BYPASS
        setVal(this.headroomGain.gain, 1.0);
        this.eqBands.forEach(band => {
          band.type = 'peaking';
          setVal(band.frequency, 1000);
          setVal(band.gain, 0);
          setVal(band.Q, 1.0);
        });
        setVal(this.compressor.threshold, -24);
        setVal(this.compressor.ratio, 1.0);
        setVal(this.compressor.attack, 0.03);
        setVal(this.compressor.release, 0.1);
        break;

      case 'natural':
        // Profile 1: Natural (Studio Reference) - Oratory1990 Optimum HiFi
        setVal(this.headroomGain.gain, 0.708); // -3.0 dB
        const natConfig = [
          { type: 'lowshelf', f: 105, gain: 1.5, Q: 0.71 },
          { type: 'peaking', f: 2000, gain: 1.0, Q: 1.41 },
          { type: 'highshelf', f: 10000, gain: 1.5, Q: 0.71 }
        ];
        this.eqBands.forEach((band, i) => {
          if (i < natConfig.length) {
            band.type = natConfig[i].type;
            setVal(band.frequency, natConfig[i].f);
            setVal(band.gain, natConfig[i].gain);
            setVal(band.Q, natConfig[i].Q);
          } else {
            band.type = 'peaking';
            setVal(band.frequency, 1000);
            setVal(band.gain, 0);
            setVal(band.Q, 1.0);
          }
        });
        setVal(this.compressor.threshold, -24);
        setVal(this.compressor.ratio, 1.0);
        setVal(this.compressor.attack, 0.03);
        setVal(this.compressor.release, 0.1);
        break;

      case 'enhanced': 
        // Profile 2: Enhanced (Pristine Studio Separation) - Oratory1990 DT990 Mix Target
        setVal(this.headroomGain.gain, 0.543); // -5.3 dB
        const enhConfig = [
          { type: 'peaking', f: 63, gain: -3.8, Q: 0.70 },
          { type: 'lowshelf', f: 105, gain: 5.5, Q: 0.67 },
          { type: 'peaking', f: 160, gain: -2.6, Q: 0.80 },
          { type: 'peaking', f: 680, gain: 3.5, Q: 0.70 },
          { type: 'peaking', f: 1170, gain: -2.1, Q: 1.20 },
          { type: 'peaking', f: 2000, gain: 1.0, Q: 1.00 },
          { type: 'peaking', f: 2900, gain: -1.5, Q: 3.00 },
          { type: 'peaking', f: 5950, gain: -6.4, Q: 3.50 },
          { type: 'peaking', f: 8300, gain: -6.5, Q: 7.00 },
          { type: 'highshelf', f: 11000, gain: -6.0, Q: 0.67 }
        ];
        this.eqBands.forEach((band, i) => {
          if (i < enhConfig.length) {
            band.type = enhConfig[i].type;
            setVal(band.frequency, enhConfig[i].f);
            setVal(band.gain, enhConfig[i].gain);
            setVal(band.Q, enhConfig[i].Q);
          } else {
            band.type = 'peaking';
            setVal(band.frequency, 1000);
            setVal(band.gain, 0);
            setVal(band.Q, 1.0);
          }
        });
        setVal(this.compressor.threshold, -24);
        setVal(this.compressor.ratio, 1.0); 
        setVal(this.compressor.attack, 0.03);
        setVal(this.compressor.release, 0.1);
        break;

      case 'bassboosted': 
        // Profile 3: Bass Boosted (Professional Basshead) - AutoEQ Sub-Bass Target
        setVal(this.headroomGain.gain, 0.251); // -12.0 dB
        const bassConfig = [
          { type: 'lowshelf', f: 40, gain: 12.0, Q: 1.00 },
          { type: 'lowshelf', f: 75, gain: 8.0, Q: 1.00 }
        ];
        this.eqBands.forEach((band, i) => {
          if (i < bassConfig.length) {
            band.type = bassConfig[i].type;
            setVal(band.frequency, bassConfig[i].f);
            setVal(band.gain, bassConfig[i].gain);
            setVal(band.Q, bassConfig[i].Q);
          } else {
            band.type = 'peaking';
            setVal(band.frequency, 1000);
            setVal(band.gain, 0);
            setVal(band.Q, 1.0);
          }
        });
        // Limit extreme low frequency peaks to protect output
        setVal(this.compressor.threshold, -2);
        setVal(this.compressor.ratio, 20.0);
        setVal(this.compressor.attack, 0.005);
        setVal(this.compressor.release, 0.05);
        break;
        
      default:
        break;
    }
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

  load(manifestUrl, autoPlay = false, startTime = 0) {
    console.log(`[AudioPlayer] load called with URL: ${manifestUrl}, startTime: ${startTime}, autoPlay: ${autoPlay}`);
    this.isAborted = false;

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    if (this.rejectActiveLoad) {
      this.rejectActiveLoad(new Error('Load aborted by a new load call'));
      this.rejectActiveLoad = null;
    }

    const currentLoadId = Symbol();
    this.activeLoadId = currentLoadId;

    return new Promise((resolve, reject) => {
      this.rejectActiveLoad = reject;
      this.audio.src = manifestUrl;
      
      if (autoPlay) {
        // Unlock audio element synchronously during user gesture!
        this.audio.play().catch(e => console.warn('[AudioPlayer] Unlock play failed (expected if blocked):', e));
      }
      
      let timeoutId;

      const cleanup = () => {
        clearTimeout(timeoutId);
        this.audio.removeEventListener('canplay', onCanPlay);
        this.audio.removeEventListener('error', onError);
      };

      const onCanPlay = () => {
        cleanup();
        if (this.activeLoadId !== currentLoadId) return;
        this.rejectActiveLoad = null;
        if (startTime > 0 && !isNaN(this.audio.duration) && startTime < this.audio.duration) {
          try {
            this.audio.currentTime = startTime;
          } catch (e) {
            console.warn('[AudioPlayer] Failed to set startTime in onCanPlay:', e);
          }
        }
        resolve();
      };

      const onError = () => {
        cleanup();
        if (this.activeLoadId !== currentLoadId) return;
        this.rejectActiveLoad = null;
        const err = this.audio.error;
        reject(new Error(err ? `Error ${err.code}: ${err.message}` : 'Failed to load audio stream'));
      };

      this.audio.addEventListener('canplay', onCanPlay);
      this.audio.addEventListener('error', onError);

      this.audio.load();

      // Protect against infinite hangs if the network drops but browser doesn't fire error
      timeoutId = setTimeout(() => {
        if (this.activeLoadId === currentLoadId) {
          cleanup();
          this.rejectActiveLoad = null;
          reject(new Error('Audio stream buffering timed out after 30 seconds'));
        }
      }, 30000);
    });
  }

  play() {
    if (this.isAborted) return Promise.resolve();
    
    // Fire off audioContext.resume() without awaiting it to avoid breaking the synchronous user gesture chain
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(e => console.warn('[AudioPlayer] Failed to resume AudioContext:', e));
    }

    // Call audio.play() synchronously in the call stack
    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      return playPromise.catch(e => {
        if (e.name !== 'AbortError') {
          console.error('[AudioPlayer] play error:', e);
          this.pause();
          if (this.onError) this.onError(e);
        }
        throw e;
      });
    }
    return Promise.resolve();
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
