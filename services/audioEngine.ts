import { TrackData, EQBand } from '../types';

/**
 * Professional DSP Audio Engine
 * Features: Multi-band EQ, Spectral Isolation for Stem Simulation, Async Safety.
 */
export class AudioEngine {
  public audioContext: AudioContext | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  
  // Track specific nodes (mapped by Track ID)
  private trackNodes: Map<string, {
    inputGain: GainNode; // Pre-FX gain
    filters: BiquadFilterNode[]; // EQ Chain
    panner: StereoPannerNode;
    outputGain: GainNode; // Fader
  }> = new Map();

  initContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  get duration() {
    return this.audioElement?.duration || 0;
  }

  get currentTime() {
    return this.audioElement?.currentTime || 0;
  }

  async loadAudio(blob: Blob, tracks: TrackData[]): Promise<void> {
    this.initContext();
    if (!this.audioContext) return;

    // 1. Cleanup old graph
    this.stop();
    this.trackNodes.clear();
    
    // 2. Setup Source
    this.audioElement = new Audio(URL.createObjectURL(blob));
    this.audioElement.crossOrigin = "anonymous";
    this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
    this.masterGain = this.audioContext.createGain();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 4096; // Higher resolution for professional look

    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);

    // 3. Build DSP Graph per Track
    tracks.forEach(track => {
      this.createTrackChain(track);
    });

    // 4. Safe Metadata Wait
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject("Timeout loading audio"), 10000);
      this.audioElement!.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve();
      };
      this.audioElement!.onerror = (e) => {
        clearTimeout(timeout);
        reject(e);
      }
    });
  }

  private createTrackChain(track: TrackData) {
    if (!this.audioContext || !this.sourceNode || !this.masterGain) return;

    // Chain Start
    const inputGain = this.audioContext.createGain();
    inputGain.gain.value = 1.0; 

    // --- FREQUENCY ISOLATION (The "Stem" Separator) ---
    // In a browser-only environment without backend inference, 
    // we use steep filters to isolate the "essence" of the instrument.
    const isolationLow = this.audioContext.createBiquadFilter();
    isolationLow.type = 'highpass';
    isolationLow.frequency.value = track.frequencyRange[0];
    isolationLow.Q.value = 0.7;

    const isolationHigh = this.audioContext.createBiquadFilter();
    isolationHigh.type = 'lowpass';
    isolationHigh.frequency.value = track.frequencyRange[1];
    isolationHigh.Q.value = 0.7;

    // --- EQ SECTION ---
    const eqFilters: BiquadFilterNode[] = [];
    let previousNode: AudioNode = isolationHigh;

    track.eqBands.forEach(band => {
      const filter = this.audioContext!.createBiquadFilter();
      filter.type = band.type;
      filter.frequency.value = band.frequency;
      filter.Q.value = band.Q;
      filter.gain.value = band.gain;
      
      // Connect chain
      previousNode.connect(filter);
      previousNode = filter;
      eqFilters.push(filter);
    });

    // --- PANNER & VOLUME ---
    const panner = this.audioContext.createStereoPanner();
    panner.pan.value = track.pan;

    const outputGain = this.audioContext.createGain();
    outputGain.gain.value = track.muted ? 0 : track.volume;

    // --- CONNECT THE GRAPH ---
    this.sourceNode.connect(inputGain);
    inputGain.connect(isolationLow);
    isolationLow.connect(isolationHigh);
    // isolationHigh is already connected to the first EQ node in the loop above
    // Or if eq is empty, we need to handle connection
    if (eqFilters.length > 0) {
        // The last EQ node connects to Panner
        eqFilters[eqFilters.length - 1].connect(panner);
    } else {
        isolationHigh.connect(panner);
    }
    
    panner.connect(outputGain);
    outputGain.connect(this.masterGain);

    // Store references for updates
    this.trackNodes.set(track.id, {
      inputGain,
      filters: eqFilters,
      panner,
      outputGain
    });
  }

  // --- Real-time Updates ---

  updateTrackParams(track: TrackData, soloActive: boolean) {
    const nodes = this.trackNodes.get(track.id);
    if (!nodes || !this.audioContext) return;
    const time = this.audioContext.currentTime;

    // 1. Pan
    nodes.panner.pan.setTargetAtTime(track.pan, time, 0.05);

    // 2. Volume / Mute / Solo Logic
    let targetGain = track.volume;
    if (track.muted) targetGain = 0;
    if (soloActive && !track.solo) targetGain = 0;
    
    nodes.outputGain.gain.setTargetAtTime(targetGain, time, 0.05);

    // 3. EQ Updates (Iterate bands)
    if (track.eqEnabled) {
        track.eqBands.forEach((band, index) => {
            if (nodes.filters[index]) {
                const f = nodes.filters[index];
                f.frequency.setTargetAtTime(band.frequency, time, 0.1);
                f.gain.setTargetAtTime(band.gain, time, 0.1);
                f.Q.setTargetAtTime(band.Q, time, 0.1);
            }
        });
    } else {
        // Flatten EQ if disabled
        nodes.filters.forEach(f => {
            f.gain.setTargetAtTime(0, time, 0.1);
        });
    }
  }

  // --- Transport ---

  play() {
    if (this.audioContext?.state === 'suspended') this.audioContext.resume();
    this.audioElement?.play().catch(e => console.error("Playback failed", e));
  }

  pause() {
    this.audioElement?.pause();
  }

  stop() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
  }

  seek(time: number) {
    if (this.audioElement) {
      const newTime = Math.max(0, Math.min(time, this.duration));
      this.audioElement.currentTime = newTime;
    }
  }

  skip(seconds: number) {
    if (this.audioElement) {
      this.seek(this.audioElement.currentTime + seconds);
    }
  }

  getAnalysisData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(0);
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }
}

export const audioEngine = new AudioEngine();
