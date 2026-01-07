export enum AppState {
  IDLE = 'IDLE',
  SELECTION = 'SELECTION', // New step: Select instruments
  PROCESSING = 'PROCESSING',
  STUDIO = 'STUDIO',
  ERROR = 'ERROR'
}

export interface EQBand {
  id: number;
  type: 'peaking' | 'lowpass' | 'highpass';
  frequency: number;
  gain: number; // -12 to 12 dB
  Q: number;
}

export interface TrackData {
  id: string;
  name: string;
  type: 'bass' | 'drums' | 'other' | 'vocals' | 'kick' | 'snare' | 'cymbals';
  volume: number; // 0 to 1.5
  pan: number; // -1 to 1
  muted: boolean;
  solo: boolean;
  // DSP Chains
  frequencyRange: [number, number]; // Legacy coarse separation
  eqEnabled: boolean;
  eqBands: EQBand[]; 
  isDecomposed?: boolean; // If true, this track was split from a parent
}

export interface ExportSettings {
  format: 'wav' | 'mp3';
  sampleRate: 44100 | 48000 | 96000 | 192000;
  bitDepth: 16 | 24 | 32;
  bitRate: 128 | 192 | 256 | 320; 
  standardPitch: boolean; 
}

export interface TrackAnalysis {
  genre: string;
  bpm: string;
  key: string;
  mood: string;
  technical_summary: string;
  ai_suggestions: string;
}

export const DEFAULT_EQ_BANDS: EQBand[] = [
  { id: 0, type: 'highpass', frequency: 30, gain: 0, Q: 0.7 },
  { id: 1, type: 'peaking', frequency: 60, gain: 0, Q: 1 },
  { id: 2, type: 'peaking', frequency: 125, gain: 0, Q: 1 },
  { id: 3, type: 'peaking', frequency: 250, gain: 0, Q: 1 },
  { id: 4, type: 'peaking', frequency: 500, gain: 0, Q: 1 },
  { id: 5, type: 'peaking', frequency: 1000, gain: 0, Q: 1 },
  { id: 6, type: 'peaking', frequency: 2000, gain: 0, Q: 1 },
  { id: 7, type: 'peaking', frequency: 4000, gain: 0, Q: 1 },
  { id: 8, type: 'peaking', frequency: 8000, gain: 0, Q: 1 },
  { id: 9, type: 'lowpass', frequency: 16000, gain: 0, Q: 0.7 },
];
