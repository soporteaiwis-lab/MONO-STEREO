export enum AppState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  ANALYZING = 'ANALYZING',
  STUDIO = 'STUDIO',
}

export interface TrackData {
  id: string;
  name: string;
  type: 'bass' | 'drums' | 'other' | 'vocals';
  volume: number; // 0 to 1.5
  pan: number; // -1 to 1
  muted: boolean;
  solo: boolean;
  frequencyRange: [number, number]; // Low, High cutoff
}

export interface ExportSettings {
  format: 'wav' | 'mp3';
  sampleRate: 44100 | 48000 | 96000 | 192000;
  bitDepth: 16 | 24 | 32;
  bitRate: 128 | 192 | 256 | 320; // For MP3
  standardPitch: boolean; // 440hz check
}

export interface TrackAnalysis {
  genre: string;
  bpm: string;
  key: string;
  mood: string;
  technical_summary: string;
  ai_suggestions: string;
}
