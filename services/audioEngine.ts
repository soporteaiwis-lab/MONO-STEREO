import { FrequencyBand } from '../types';

/**
 * AIWIS Spectral Engine
 * Core Function: Takes a mono signal, splits it into frequency bands, 
 * pans them individually, and sums them into a true stereo bus.
 */
export class AudioEngine {
  public audioContext: AudioContext | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  
  // Dual Channel Analysis
  private splitterNode: ChannelSplitterNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  
  // Band Nodes
  private bandNodes: Map<string, {
    inputGain: GainNode;
    filters: BiquadFilterNode[];
    panner: StereoPannerNode;
    outputGain: GainNode;
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

  async loadAudio(blob: Blob, bands: FrequencyBand[]): Promise<void> {
    this.initContext();
    if (!this.audioContext) return;

    this.stop();
    this.bandNodes.clear();
    
    // --- Master Chain Setup ---
    this.audioElement = new Audio(URL.createObjectURL(blob));
    this.audioElement.crossOrigin = "anonymous";
    this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
    
    // Dynamics to prevent clipping when summing bands
    this.masterCompressor = this.audioContext.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -10;
    this.masterCompressor.ratio.value = 12;

    this.masterGain = this.audioContext.createGain();
    
    // Splitter for Visualization (L vs R)
    this.splitterNode = this.audioContext.createChannelSplitter(2);
    this.analyserL = this.audioContext.createAnalyser();
    this.analyserR = this.audioContext.createAnalyser();
    this.analyserL.fftSize = 2048;
    this.analyserR.fftSize = 2048;

    // Connect Output Graph
    // MasterGain -> Compressor -> Destination
    //           |-> Splitter -> Analysers
    this.masterGain.connect(this.masterCompressor);
    this.masterCompressor.connect(this.audioContext.destination);
    
    this.masterGain.connect(this.splitterNode);
    this.splitterNode.connect(this.analyserL, 0);
    this.splitterNode.connect(this.analyserR, 1);

    // --- Spectral Slicing ---
    bands.forEach(band => {
      this.createBandChain(band);
    });

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

  private createBandChain(band: FrequencyBand) {
    if (!this.audioContext || !this.sourceNode || !this.masterGain) return;

    // 1. Input Gain
    const inputGain = this.audioContext.createGain();
    
    // 2. Filter Bank (High Pass + Low Pass to isolate range)
    // Using 4th order filters (2 nodes cascaded) for steeper slopes and cleaner isolation
    const lowCut1 = this.audioContext.createBiquadFilter();
    lowCut1.type = 'highpass';
    lowCut1.frequency.value = band.range[0];
    lowCut1.Q.value = 0.7; // Butterworth

    const lowCut2 = this.audioContext.createBiquadFilter();
    lowCut2.type = 'highpass';
    lowCut2.frequency.value = band.range[0];
    lowCut2.Q.value = 0.7;

    const highCut1 = this.audioContext.createBiquadFilter();
    highCut1.type = 'lowpass';
    highCut1.frequency.value = band.range[1];
    highCut1.Q.value = 0.7;

    const highCut2 = this.audioContext.createBiquadFilter();
    highCut2.type = 'lowpass';
    highCut2.frequency.value = band.range[1];
    highCut2.Q.value = 0.7;

    // 3. Panner (The Magic Maker)
    const panner = this.audioContext.createStereoPanner();
    panner.pan.value = band.pan;

    // 4. Output Volume
    const outputGain = this.audioContext.createGain();
    outputGain.gain.value = band.muted ? 0 : band.volume;

    // Connect Chain
    // Source -> InputGain -> LC1 -> LC2 -> HC1 -> HC2 -> Panner -> OutputGain -> Master
    this.sourceNode.connect(inputGain);
    inputGain.connect(lowCut1);
    lowCut1.connect(lowCut2);
    lowCut2.connect(highCut1);
    highCut1.connect(highCut2);
    highCut2.connect(panner);
    panner.connect(outputGain);
    outputGain.connect(this.masterGain);

    this.bandNodes.set(band.id, {
      inputGain,
      filters: [lowCut1, lowCut2, highCut1, highCut2],
      panner,
      outputGain
    });
  }

  updateBandParams(band: FrequencyBand, soloActive: boolean) {
    const nodes = this.bandNodes.get(band.id);
    if (!nodes || !this.audioContext) return;
    const time = this.audioContext.currentTime;

    // Pan (Immediate)
    nodes.panner.pan.setTargetAtTime(band.pan, time, 0.05);

    // Gain Logic (Mute/Solo)
    let targetGain = band.volume;
    if (band.muted) targetGain = 0;
    if (soloActive && !band.solo) targetGain = 0;
    
    nodes.outputGain.gain.setTargetAtTime(targetGain, time, 0.05);
  }

  // --- Transport ---
  play() {
    if (this.audioContext?.state === 'suspended') this.audioContext.resume();
    this.audioElement?.play().catch(console.error);
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
    if (this.audioElement) this.seek(this.audioElement.currentTime + seconds);
  }

  // Get Stereo Analysis
  getAnalysisData(): { left: Uint8Array, right: Uint8Array } {
    if (!this.analyserL || !this.analyserR) return { left: new Uint8Array(0), right: new Uint8Array(0) };
    
    const binCount = this.analyserL.frequencyBinCount;
    const leftData = new Uint8Array(binCount);
    const rightData = new Uint8Array(binCount);
    
    this.analyserL.getByteFrequencyData(leftData);
    this.analyserR.getByteFrequencyData(rightData);
    
    return { left: leftData, right: rightData };
  }
}

export const audioEngine = new AudioEngine();