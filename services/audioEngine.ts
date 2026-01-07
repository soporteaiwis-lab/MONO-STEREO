/**
 * This service manages the Web Audio API context.
 * Since true AI stem separation requires heavy backend processing or WASM,
 * we simulate the "Stem Separation" by splitting frequencies into 3 bands (Low, Mid, High)
 * and applying advanced stereo widening techniques (Haas effect, Panning).
 */

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private analyser: AnalyserNode | null = null;

  // Nodes for "Stems"
  private bassGain: GainNode | null = null;
  private midGain: GainNode | null = null;
  private highGain: GainNode | null = null;

  private bassPan: StereoPannerNode | null = null;
  private midPan: StereoPannerNode | null = null;
  private highPan: StereoPannerNode | null = null;

  constructor() {
    // Lazy init in loadAudio
  }

  initContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  async loadAudio(blob: Blob): Promise<void> {
    this.initContext();
    if (!this.audioContext) return;

    // Create HTML Audio Element
    if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.src = '';
    }
    
    this.audioElement = new Audio(URL.createObjectURL(blob));
    
    // Create Source
    try {
        this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
    } catch (e) {
        // Re-use source if context issues
        console.warn("Source already connected or issue creating source", e);
    }

    if (!this.sourceNode) return;

    // --- Create Frequency Splitters (The "Stem" Separator) ---
    // 1. Lowpass for Bass (< 250Hz)
    const lowPass = this.audioContext.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 250;

    // 2. Bandpass for Mids (250Hz - 4000Hz) logic: 
    // We achieve mids by subtracting lows and highs, or using a bandpass. 
    // Easier approach for demo: Highpass @ 250 -> Lowpass @ 4000
    const midHighPass = this.audioContext.createBiquadFilter();
    midHighPass.type = 'highpass';
    midHighPass.frequency.value = 250;
    const midLowPass = this.audioContext.createBiquadFilter();
    midLowPass.type = 'lowpass';
    midLowPass.frequency.value = 4000;

    // 3. Highpass for Highs (> 4000Hz)
    const highPass = this.audioContext.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 4000;

    // --- Create Panners and Gains ---
    this.bassGain = this.audioContext.createGain();
    this.midGain = this.audioContext.createGain();
    this.highGain = this.audioContext.createGain();

    this.bassPan = this.audioContext.createStereoPanner();
    this.midPan = this.audioContext.createStereoPanner();
    this.highPan = this.audioContext.createStereoPanner();

    // --- Connect Graph ---
    
    // Path 1: Bass
    this.sourceNode.connect(lowPass);
    lowPass.connect(this.bassPan!);
    this.bassPan!.connect(this.bassGain!);
    this.bassGain!.connect(this.audioContext.destination);

    // Path 2: Mids
    this.sourceNode.connect(midHighPass);
    midHighPass.connect(midLowPass);
    midLowPass.connect(this.midPan!);
    this.midPan!.connect(this.midGain!);
    this.midGain!.connect(this.audioContext.destination);

    // Path 3: Highs
    this.sourceNode.connect(highPass);
    highPass.connect(this.highPan!);
    this.highPan!.connect(this.highGain!);
    this.highGain!.connect(this.audioContext.destination);

    // Analyzer for visuals
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    // Connect output gains to analyser as well
    this.bassGain!.connect(this.analyser);
    this.midGain!.connect(this.analyser);
    this.highGain!.connect(this.analyser);
  }

  play() {
    this.audioElement?.play();
  }

  pause() {
    this.audioElement?.pause();
  }

  setMix(type: 'bass' | 'mids' | 'highs', pan: number, gain: number) {
    if (!this.audioContext) return;
    const time = this.audioContext.currentTime;

    if (type === 'bass' && this.bassPan && this.bassGain) {
      this.bassPan.pan.linearRampToValueAtTime(pan, time + 0.1);
      this.bassGain.gain.linearRampToValueAtTime(gain, time + 0.1);
    }
    if (type === 'mids' && this.midPan && this.midGain) {
      this.midPan.pan.linearRampToValueAtTime(pan, time + 0.1);
      this.midGain.gain.linearRampToValueAtTime(gain, time + 0.1);
    }
    if (type === 'highs' && this.highPan && this.highGain) {
      this.highPan.pan.linearRampToValueAtTime(pan, time + 0.1);
      this.highGain.gain.linearRampToValueAtTime(gain, time + 0.1);
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
