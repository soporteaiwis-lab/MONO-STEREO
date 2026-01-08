export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  STUDIO = 'STUDIO',
  RENDERING = 'RENDERING',
  ERROR = 'ERROR'
}

export type InstrumentCategory = 'AUTO' | 'DRUMS' | 'GUITAR_ACOUSTIC' | 'GUITAR_ELECTRIC' | 'VOCAL_MALE' | 'VOCAL_FEMALE' | 'BASS' | 'KEYS' | 'FULL_MIX';

export interface InstrumentRangeDetail {
  fundamental: string;
  harmonics: string;
  character: string;
}

// --- BASE DE DATOS DE FRECUENCIAS POR INSTRUMENTO ---
export const INSTRUMENT_FREQUENCY_MAP: Record<InstrumentCategory, { name: string, description: string, critical_bands: string[] }> = {
  AUTO: { 
    name: "Auto-Detección AI", 
    description: "Gemini analizará el espectro para identificar la fuente.",
    critical_bands: [] 
  },
  DRUMS: {
    name: "Batería (Drum Kit)",
    description: "Split por piezas: Bombo, Caja, Toms, Platillos.",
    critical_bands: ["SUB LOW (Kick)", "BASS (Kick/Floor)", "MIDS (Snare)", "BRILLIANCE (Cymbals)"]
  },
  GUITAR_ACOUSTIC: {
    name: "Guitarra Acústica",
    description: "Cuerpo en 80-200Hz, Brillo en 5kHz+.",
    critical_bands: ["BASS", "UPPER MIDS", "AIR"]
  },
  GUITAR_ELECTRIC: {
    name: "Guitarra Eléctrica",
    description: "Poder en 200-500Hz, Presencia en 2-4kHz.",
    critical_bands: ["LOW MIDS", "MIDS", "PRESENCE"]
  },
  VOCAL_MALE: {
    name: "Voz Masculina",
    description: "Cuerpo 100-300Hz, Presencia 2-5kHz.",
    critical_bands: ["BASS", "LOW MIDS", "PRESENCE"]
  },
  VOCAL_FEMALE: {
    name: "Voz Femenina",
    description: "Cuerpo 200-400Hz, Aire 10kHz+.",
    critical_bands: ["LOW MIDS", "UPPER MIDS", "AIR"]
  },
  BASS: {
    name: "Bajo Eléctrico/Synth",
    description: "Sub 40-80Hz, Ataque 700Hz-1kHz.",
    critical_bands: ["SUB LOW", "BASS", "MIDS"]
  },
  KEYS: {
    name: "Teclados / Piano",
    description: "Rango completo, gran amplitud estéreo natural.",
    critical_bands: ["LOW MIDS", "MIDS", "BRILLIANCE"]
  },
  FULL_MIX: {
    name: "Mix Completo (Mastering)",
    description: "Tratamiento de bus estéreo final.",
    critical_bands: ["SUB LOW", "AIR"]
  }
};

export interface FrequencyBand {
  id: string;
  label: string;
  range: [number, number]; // Min Hz - Max Hz
  centerFreq: number; // For label display
  gainL: number; // 0 to 1.5
  gainR: number; // 0 to 1.5
  muted: boolean;
  solo: boolean;
  color: string;
  detectedInstrument?: string; // New: AI Label for what is in this band
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
  detected_instruments_per_band?: Record<string, string>; // Band ID -> Instrument Name
}

// Plantilla Base (Se modifica dinámicamente según el instrumento seleccionado)
export const SPECTRAL_BANDS_TEMPLATE: Omit<FrequencyBand, 'id' | 'gainL' | 'gainR' | 'muted' | 'solo'>[] = [
  { label: 'SUB LOW', range: [20, 60], centerFreq: 40, color: 'text-purple-500' },
  { label: 'BASS', range: [60, 250], centerFreq: 150, color: 'text-indigo-500' },
  { label: 'LOW MIDS', range: [250, 500], centerFreq: 375, color: 'text-blue-500' },
  { label: 'MIDS', range: [500, 2000], centerFreq: 1250, color: 'text-green-500' },
  { label: 'UPPER MIDS', range: [2000, 4000], centerFreq: 3000, color: 'text-yellow-500' },
  { label: 'PRESENCE', range: [4000, 6000], centerFreq: 5000, color: 'text-orange-500' },
  { label: 'BRILLIANCE', range: [6000, 10000], centerFreq: 8000, color: 'text-red-500' },
  { label: 'AIR / HISS', range: [10000, 20000], centerFreq: 15000, color: 'text-pink-500' },
];