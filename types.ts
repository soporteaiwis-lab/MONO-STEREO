export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  STUDIO = 'STUDIO',
  ERROR = 'ERROR'
}

export interface FrequencyBand {
  id: string;
  label: string;
  range: [number, number]; // Min Hz - Max Hz
  centerFreq: number; // For label display
  volume: number; // 0 to 1.5
  pan: number; // -1 to 1
  muted: boolean;
  solo: boolean;
  color: string;
}

export interface EQBand {
  id: number;
  type: 'lowpass' | 'highpass' | 'peaking' | 'lowshelf' | 'highshelf';
  frequency: number;
  gain: number;
  Q: number;
}

export interface ExportSettings {
  format: 'wav' | 'mp3';
  sampleRate: 44100 | 48000 | 96000 | 192000;
  bitDepth: 16 | 24 | 32;
  bitRate: 128 | 192 | 256 | 320; 
  standardPitch: boolean; 
}

export interface SpectralAnalysis {
  dominant_frequencies: string;
  stereo_width_suggestion: string;
  vibe: string;
  technical_recommendation: string;
}

// Bandas de frecuencia estándar para ingeniería de audio
export const SPECTRAL_BANDS_TEMPLATE: Omit<FrequencyBand, 'id' | 'volume' | 'pan' | 'muted' | 'solo'>[] = [
  { label: 'SUB LOW', range: [20, 60], centerFreq: 40, color: 'text-purple-500' },
  { label: 'BASS', range: [60, 250], centerFreq: 150, color: 'text-indigo-500' },
  { label: 'LOW MIDS', range: [250, 500], centerFreq: 375, color: 'text-blue-500' },
  { label: 'MIDS', range: [500, 2000], centerFreq: 1250, color: 'text-green-500' },
  { label: 'UPPER MIDS', range: [2000, 4000], centerFreq: 3000, color: 'text-yellow-500' },
  { label: 'PRESENCE', range: [4000, 6000], centerFreq: 5000, color: 'text-orange-500' },
  { label: 'BRILLIANCE', range: [6000, 10000], centerFreq: 8000, color: 'text-red-500' },
  { label: 'AIR / HISS', range: [10000, 20000], centerFreq: 15000, color: 'text-pink-500' },
];