import { FrequencyBand } from '../types';

/**
 * AIWIS Spectral Engine
 * Core Function: Takes a mono signal, splits it into frequency bands, 
 * allows independent L/R gain control, and sums to stereo.
 */
export class AudioEngine {
  public audioContext: AudioContext | null = null;
  public decodedBuffer: AudioBuffer | null = null; // Store the original raw buffer

  // Real-time nodes
  private sourceNode: AudioBufferSourceNode | null = null;
  private inputGainNode: GainNode | null = null; // Input Volume
  private masterGainNode: GainNode | null = null; // Output Volume
  private masterCompressor: DynamicsCompressorNode | null = null;
  
  private splitterNode: ChannelSplitterNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  
  // Real-time Band Nodes
  private bandNodes: Map<string, {
    gainL: GainNode;
    gainR: GainNode;
  }> = new Map();

  private startTime: number = 0;
  private pauseTime: number = 0;
  private isPlaying: boolean = false;
  
  // Volume States (0-1.5)
  private inputVolume: number = 1.0;
  private outputVolume: number = 1.0;

  initContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  get duration() {
    return this.decodedBuffer?.duration || 0;
  }
  
  get isStereo() {
      return this.decodedBuffer ? this.decodedBuffer.numberOfChannels > 1 : false;
  }

  get currentTime() {
    if (!this.audioContext || !this.isPlaying) return this.pauseTime;
    return Math.min(this.audioContext.currentTime - this.startTime, this.duration);
  }

  async loadAudio(blob: Blob, bands: FrequencyBand[]): Promise<void> {
    this.initContext();
    if (!this.audioContext) return;

    this.stop();
    this.bandNodes.clear();

    // 1. Decode Buffer Once
    const arrayBuffer = await blob.arrayBuffer();
    this.decodedBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    
    // 2. Setup Graph
    this.setupRealtimeGraph(bands);
  }
  
  setInputVolume(val: number) {
      this.inputVolume = val;
      if (this.inputGainNode) this.inputGainNode.gain.setTargetAtTime(val, this.audioContext!.currentTime, 0.05);
  }
  
  setOutputVolume(val: number) {
      this.outputVolume = val;
      if (this.masterGainNode) this.masterGainNode.gain.setTargetAtTime(val, this.audioContext!.currentTime, 0.05);
  }

  private setupRealtimeGraph(bands: FrequencyBand[]) {
    if (!this.audioContext || !this.decodedBuffer) return;

    // Disconnect old
    if (this.sourceNode) { try { this.sourceNode.stop(); } catch {} }

    // Create Chain: Source -> InputGain -> [Bands] -> MasterGain -> Compressor -> Destination
    this.inputGainNode = this.audioContext.createGain();
    this.inputGainNode.gain.value = this.inputVolume;
    
    this.masterGainNode = this.audioContext.createGain();
    this.masterGainNode.gain.value = this.outputVolume;

    this.masterCompressor = this.audioContext.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -10;
    this.masterCompressor.ratio.value = 12;

    // Analysis for Visualizer (Post Master)
    this.splitterNode = this.audioContext.createChannelSplitter(2);
    this.analyserL = this.audioContext.createAnalyser();
    this.analyserR = this.audioContext.createAnalyser();
    this.analyserL.fftSize = 2048; 
    this.analyserR.fftSize = 2048;
    
    // Connect End of Chain
    this.masterGainNode.connect(this.masterCompressor);
    this.masterCompressor.connect(this.audioContext.destination);
    
    // Visualize Output
    this.masterGainNode.connect(this.splitterNode);
    this.splitterNode.connect(this.analyserL, 0);
    this.splitterNode.connect(this.analyserR, 1);
  }

  // Called every time play() is triggered
  private buildAndConnectSource(bands: FrequencyBand[], offset: number) {
      if (!this.audioContext || !this.decodedBuffer || !this.inputGainNode || !this.masterGainNode) return;

      this.sourceNode = this.audioContext.createBufferSource();
      this.sourceNode.buffer = this.decodedBuffer;

      this.sourceNode.connect(this.inputGainNode);

      // We need a common input bus for the bands
      // The Bands take InputGain, process, and connect to MasterGain
      bands.forEach(band => {
          this.createBandNodes(this.audioContext!, this.inputGainNode!, this.masterGainNode!, band, true);
      });

      this.sourceNode.start(0, offset);
  }

  /**
   * Shared Logic for creating the EQ/Pan Graph.
   * IMPROVED: Uses 3 cascaded filters per side for steeper slopes (High precision isolation)
   */
  private createBandNodes(
      ctx: BaseAudioContext, 
      inputNode: AudioNode, 
      outputNode: AudioNode, 
      band: FrequencyBand,
      isRealTime: boolean
  ) {
    // 1. Filter Bank (Isolation) - High Order (Steep Slope)
    // Cascading 3 filters creates an 18dB/octave slope minimum, much sharper than before.
    
    const createFilter = (type: BiquadFilterType, freq: number, q: number) => {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        return f;
    };

    // Low Cut Chain (Highpass)
    const hp1 = createFilter('highpass', band.range[0], 0.707);
    const hp2 = createFilter('highpass', band.range[0], 0.707);
    const hp3 = createFilter('highpass', band.range[0], 0.707);

    // High Cut Chain (Lowpass)
    const lp1 = createFilter('lowpass', band.range[1], 0.707);
    const lp2 = createFilter('lowpass', band.range[1], 0.707);
    const lp3 = createFilter('lowpass', band.range[1], 0.707);

    // 2. Dual Gain Stage (L/R Independent Faders)
    const gainL = ctx.createGain();
    gainL.gain.value = band.muted ? 0 : band.gainL;

    const gainR = ctx.createGain();
    gainR.gain.value = band.muted ? 0 : band.gainR;

    // 3. Merger (Recombine to Stereo Bus)
    const merger = ctx.createChannelMerger(2);

    // Connections: Input -> HP Chain -> LP Chain -> Split to Gains
    inputNode.connect(hp1);
    hp1.connect(hp2);
    hp2.connect(hp3);
    
    hp3.connect(lp1);
    lp1.connect(lp2);
    lp2.connect(lp3);
    
    // Split to L/R Gains
    lp3.connect(gainL);
    lp3.connect(gainR);
    
    // Connect to Merger
    gainL.connect(merger, 0, 0); // L
    gainR.connect(merger, 0, 1); // R

    merger.connect(outputNode);

    // Store references for real-time updates
    if (isRealTime) {
        this.bandNodes.set(band.id, { gainL, gainR });
    }
  }

  // --- Real-time Parameter Updates ---
  updateBandParams(band: FrequencyBand, soloActive: boolean) {
    const nodes = this.bandNodes.get(band.id);
    if (!nodes || !this.audioContext) return;
    const time = this.audioContext.currentTime;

    let targetGainL = band.gainL;
    let targetGainR = band.gainR;

    // Apply Mute logic
    if (band.muted) {
        targetGainL = 0;
        targetGainR = 0;
    }
    // Apply Solo Logic (if any solo is active, mute non-soloed)
    if (soloActive && !band.solo) {
        targetGainL = 0;
        targetGainR = 0;
    }
    
    nodes.gainL.gain.setTargetAtTime(targetGainL, time, 0.05);
    nodes.gainR.gain.setTargetAtTime(targetGainR, time, 0.05);
  }

  // --- Transport ---

  play(bands?: FrequencyBand[]) {
    if (!this.audioContext || !bands) return;
    if (this.audioContext.state === 'suspended') this.audioContext.resume();
    
    if (this.isPlaying) return; // Already playing

    this.buildAndConnectSource(bands, this.pauseTime);
    this.startTime = this.audioContext.currentTime - this.pauseTime;
    this.isPlaying = true;
  }

  pause() {
    if (!this.sourceNode || !this.isPlaying) return;
    this.sourceNode.stop();
    this.pauseTime = this.audioContext!.currentTime - this.startTime;
    this.isPlaying = false;
  }

  stop() {
    if (this.sourceNode) {
        try { this.sourceNode.stop(); } catch {}
    }
    this.pauseTime = 0;
    this.isPlaying = false;
  }

  seek(time: number, bands: FrequencyBand[]) {
      const wasPlaying = this.isPlaying;
      if (wasPlaying) this.pause();
      this.pauseTime = Math.max(0, Math.min(time, this.duration));
      if (wasPlaying) this.play(bands);
  }

  skip(seconds: number, bands: FrequencyBand[]) {
     this.seek(this.currentTime + seconds, bands);
  }

  // --- Offline Rendering (Full Mix) ---

  async renderOffline(bands: FrequencyBand[]): Promise<AudioBuffer> {
      if (!this.decodedBuffer) throw new Error("No audio loaded");

      const offlineCtx = new OfflineAudioContext(
          2, 
          this.decodedBuffer.length,
          this.decodedBuffer.sampleRate
      );

      const source = offlineCtx.createBufferSource();
      source.buffer = this.decodedBuffer;
      
      const inputGain = offlineCtx.createGain();
      inputGain.gain.value = this.inputVolume;

      const masterGain = offlineCtx.createGain();
      masterGain.gain.value = this.outputVolume;
      
      const compressor = offlineCtx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.ratio.value = 12;

      source.connect(inputGain);
      masterGain.connect(compressor);
      compressor.connect(offlineCtx.destination);

      // Important: Use filter chain logic. 
      // The createBandNodes function respects the 'muted' and 'gain' properties of the band object passed.
      // We must ensure 'solo' logic is applied to the bands passed here before calling.
      const anySolo = bands.some(b => b.solo);
      const renderBands = bands.map(b => {
          // Clone to avoid mutating state
          const rb = {...b};
          if (anySolo && !rb.solo) {
              rb.gainL = 0;
              rb.gainR = 0;
          }
          return rb;
      });

      renderBands.forEach(band => {
          this.createBandNodes(offlineCtx, inputGain, masterGain, band, false);
      });

      source.start(0);
      return await offlineCtx.startRendering();
  }

  // --- Stem Rendering (Single Band) ---
  async renderSingleBand(targetBand: FrequencyBand): Promise<AudioBuffer> {
    if (!this.decodedBuffer) throw new Error("No audio loaded");

    const offlineCtx = new OfflineAudioContext(
        2, 
        this.decodedBuffer.length,
        this.decodedBuffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = this.decodedBuffer;
    
    // Apply gains for export
    const inputGain = offlineCtx.createGain();
    inputGain.gain.value = this.inputVolume;

    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = this.outputVolume;

    source.connect(inputGain);
    masterGain.connect(offlineCtx.destination);

    // Create ONLY the target band chain
    this.createBandNodes(offlineCtx, inputGain, masterGain, targetBand, false);

    source.start(0);
    return await offlineCtx.startRendering();
  }

  // --- Visualization Data (Waveform) ---
  getAnalysisData(): { left: Uint8Array, right: Uint8Array } {
    if (!this.analyserL || !this.analyserR) return { left: new Uint8Array(0), right: new Uint8Array(0) };
    
    const binCount = this.analyserL.frequencyBinCount;
    const leftData = new Uint8Array(binCount);
    const rightData = new Uint8Array(binCount);
    
    this.analyserL.getByteTimeDomainData(leftData);
    this.analyserR.getByteTimeDomainData(rightData);
    
    return { left: leftData, right: rightData };
  }
}

export const audioEngine = new AudioEngine();