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
  private masterCompressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
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

  private setupRealtimeGraph(bands: FrequencyBand[]) {
    if (!this.audioContext || !this.decodedBuffer) return;

    // Disconnect old
    if (this.sourceNode) { try { this.sourceNode.stop(); } catch {} }

    // Create Source (Buffer)
    this.masterCompressor = this.audioContext.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -10;
    this.masterCompressor.ratio.value = 12;
    this.masterGain = this.audioContext.createGain();

    // Analysis for Visualizer
    this.splitterNode = this.audioContext.createChannelSplitter(2);
    this.analyserL = this.audioContext.createAnalyser();
    this.analyserR = this.audioContext.createAnalyser();
    this.analyserL.fftSize = 2048; 
    this.analyserR.fftSize = 2048;
    
    this.masterGain.connect(this.masterCompressor);
    this.masterCompressor.connect(this.audioContext.destination);
    
    this.masterGain.connect(this.splitterNode);
    this.splitterNode.connect(this.analyserL, 0);
    this.splitterNode.connect(this.analyserR, 1);
  }

  // Called every time play() is triggered
  private buildAndConnectSource(bands: FrequencyBand[], offset: number) {
      if (!this.audioContext || !this.decodedBuffer || !this.masterGain) return;

      this.sourceNode = this.audioContext.createBufferSource();
      this.sourceNode.buffer = this.decodedBuffer;

      // We need a common input bus for the bands
      const inputSplitter = this.audioContext.createGain();
      this.sourceNode.connect(inputSplitter);

      bands.forEach(band => {
          this.createBandNodes(this.audioContext!, inputSplitter, this.masterGain!, band, true);
      });

      this.sourceNode.start(0, offset);
  }

  /**
   * Shared Logic for creating the EQ/Pan Graph.
   */
  private createBandNodes(
      ctx: BaseAudioContext, 
      inputNode: AudioNode, 
      outputNode: AudioNode, 
      band: FrequencyBand,
      isRealTime: boolean
  ) {
    // 1. Input Gain
    const inputGain = ctx.createGain();
    
    // 2. Filter Bank (Isolation)
    const lowCut1 = ctx.createBiquadFilter();
    lowCut1.type = 'highpass';
    lowCut1.frequency.value = band.range[0];
    lowCut1.Q.value = 0.7; 

    const lowCut2 = ctx.createBiquadFilter();
    lowCut2.type = 'highpass';
    lowCut2.frequency.value = band.range[0];
    lowCut2.Q.value = 0.7;

    const highCut1 = ctx.createBiquadFilter();
    highCut1.type = 'lowpass';
    highCut1.frequency.value = band.range[1];
    highCut1.Q.value = 0.7;

    const highCut2 = ctx.createBiquadFilter();
    highCut2.type = 'lowpass';
    highCut2.frequency.value = band.range[1];
    highCut2.Q.value = 0.7;

    // 3. Dual Gain Stage (L/R Independent Faders)
    const gainL = ctx.createGain();
    gainL.gain.value = band.muted ? 0 : band.gainL;

    const gainR = ctx.createGain();
    gainR.gain.value = band.muted ? 0 : band.gainR;

    // 4. Merger (Recombine to Stereo Bus)
    const merger = ctx.createChannelMerger(2);

    // Connections
    inputNode.connect(inputGain);
    inputGain.connect(lowCut1);
    lowCut1.connect(lowCut2);
    lowCut2.connect(highCut1);
    highCut1.connect(highCut2);
    
    highCut2.connect(gainL);
    gainL.connect(merger, 0, 0); // Connect to Left input of Merger

    highCut2.connect(gainR);
    gainR.connect(merger, 0, 1); // Connect to Right input of Merger

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

    if (band.muted) {
        targetGainL = 0;
        targetGainR = 0;
    }
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
      
      const inputSplitter = offlineCtx.createGain();
      const master = offlineCtx.createGain();
      
      const compressor = offlineCtx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.ratio.value = 12;

      source.connect(inputSplitter);
      master.connect(compressor);
      compressor.connect(offlineCtx.destination);

      bands.forEach(band => {
          this.createBandNodes(offlineCtx, inputSplitter, master, band, false);
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
    
    const inputSplitter = offlineCtx.createGain();
    const master = offlineCtx.createGain(); // Direct to master, no comp for stems? Or light comp? Let's keep consistent.
    
    source.connect(inputSplitter);
    master.connect(offlineCtx.destination);

    // Create ONLY the target band chain
    this.createBandNodes(offlineCtx, inputSplitter, master, targetBand, false);

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