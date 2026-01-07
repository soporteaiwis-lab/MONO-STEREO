import { TrackData } from '../types';

/**
 * Advanced Audio Engine for AIWIS Studio.
 * Simulates multitrack behavior using Web Audio API filtering.
 */

export class AudioEngine {
  public audioContext: AudioContext | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  
  // Track specific nodes (mapped by Track ID)
  private trackNodes: Map<string, {
    filterLow: BiquadFilterNode;
    filterHigh: BiquadFilterNode;
    panner: StereoPannerNode;
    gain: GainNode;
  }> = new Map();

  private _duration: number = 0;

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

    // Reset previous session
    if (this.audioElement) {
      this.audioElement.pause();
      this.sourceNode?.disconnect();
    }

    this.audioElement = new Audio(URL.createObjectURL(blob));
    this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
    this.masterGain = this.audioContext.createGain();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;

    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);

    // Initialize Tracks (Stems)
    tracks.forEach(track => {
      this.createTrackChain(track);
    });

    // Wait for metadata to get duration
    return new Promise((resolve) => {
      this.audioElement!.onloadedmetadata = () => {
        resolve();
      };
    });
  }

  private createTrackChain(track: TrackData) {
    if (!this.audioContext || !this.sourceNode || !this.masterGain) return;

    // 1. Filters for frequency separation
    const lowCut = this.audioContext.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.value = track.frequencyRange[0];

    const highCut = this.audioContext.createBiquadFilter();
    highCut.type = 'lowpass';
    highCut.frequency.value = track.frequencyRange[1];

    // 2. Panner
    const panner = this.audioContext.createStereoPanner();
    panner.pan.value = track.pan;

    // 3. Gain (Volume + Mute logic)
    const gain = this.audioContext.createGain();
    gain.gain.value = track.muted ? 0 : track.volume;

    // Connect Chain
    // Source -> LowCut -> HighCut -> Panner -> Gain -> Master
    this.sourceNode.connect(lowCut);
    lowCut.connect(highCut);
    highCut.connect(panner);
    panner.connect(gain);
    gain.connect(this.masterGain);

    this.trackNodes.set(track.id, {
      filterLow: lowCut,
      filterHigh: highCut,
      panner: panner,
      gain: gain
    });
  }

  // --- Transport Controls ---

  play() {
    this.audioElement?.play();
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

  // --- Mixer Controls ---

  updateTrack(track: TrackData, soloActive: boolean) {
    const nodes = this.trackNodes.get(track.id);
    if (!nodes || !this.audioContext) return;
    const time = this.audioContext.currentTime;

    // Pan
    nodes.panner.pan.linearRampToValueAtTime(track.pan, time + 0.1);

    // Volume / Mute / Solo Logic
    let targetGain = track.volume;
    
    if (track.muted) {
      targetGain = 0;
    }

    if (soloActive && !track.solo) {
      targetGain = 0; // Mute if another track is soloed and this one isn't
    }

    nodes.gain.gain.setTargetAtTime(targetGain, time, 0.05);
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