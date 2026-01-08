export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  STUDIO = 'STUDIO',
  RENDERING = 'RENDERING',
  ERROR = 'ERROR'
}

export type InstrumentCategory = 'AUTO' | 'DRUMS' | 'GUITAR_ACOUSTIC' | 'GUITAR_ELECTRIC' | 'VOCAL_MALE' | 'VOCAL_FEMALE' | 'BASS' | 'KEYS' | 'HORNS' | 'STRINGS' | 'FULL_MIX';

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
  detectedInstrument?: string; // AI Label based on PDF data
  pdfHint?: string; // Specific hint from PDF (e.g. "Caja Deep")
}

export interface EQBand {
  id: number;
  type: 'peaking' | 'lowpass' | 'highpass' | 'lowshelf' | 'highshelf';
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

// --- BASE DE DATOS MAESTRA DEL PDF ---
export const DETAILED_FREQUENCY_DICTIONARY = {
  VOCAL: {
    "7000": "Sibilance (Sibilancia)",
    "8000": "Big sound (Sonido grande)",
    "2000": "Shrill (Chillón) / Nasal",
    "3000": "Clarity (Claridad)",
    "200-400": "Body (Cuerpo)",
    "<80": "Popping P's (Popeo)"
  },
  PIANO: {
    "1000-2000": "Tinny (Metálico)",
    "5000": "More presence (Presencia)",
    "300": "Boomy (Retumbante)",
    "100": "Bottom end (Graves)"
  },
  GUITAR_ELECTRIC: {
    "1000-2000": "Shrill (Chillón)",
    "3000": "Clarity (Claridad)",
    "<80": "Muddy (Embarrado)",
    "125": "Bottom end (Graves)"
  },
  GUITAR_ACOUSTIC: {
    "2000-3000": "Tinny (Metálico)",
    ">5000": "Sparkle (Brillo)",
    "200": "Boomy (Retumbante)",
    "125": "Full (Lleno)"
  },
  BASS: {
    "1000": "Thin (Delgado)",
    "600": "Growl (Gruñido)",
    "125": "Boomy (Retumbante)",
    "<80": "Bottom end (Graves)"
  },
  SNARE: {
    "1000": "Annoying (Molesto)",
    "2000": "Crisp (Crujiente)",
    "150-200": "Full (Lleno)",
    "80": "Deep (Profundo)"
  },
  KICK: {
    "400": "Muddy (Embarrado)",
    "2000-5000": "Sharp attack (Ataque)",
    "<80": "Boomy (Retumbante)",
    "60-125": "Bottom end (Graves)"
  },
  TOMS: {
    "300": "Boomy (Retumbante)",
    "2000-5000": "Sharp attack (Ataque)",
    "80-200": "Bottom end (Graves)"
  },
  CYMBALS: {
    "1000": "Annoying (Molesto)",
    "7000-8000": "Sizzle (Ceceo)",
    "8000-12000": "Brilliance (Brillo)",
    "15000": "Air (Aire)"
  },
  HORNS: {
    "1000": "Honky (Nasal/Gangoso)",
    "8000-12000": "Big sound (Sonido grande)",
    "<120": "Muddy (Embarrado)",
    "2000": "Clarity (Claridad)"
  },
  STRINGS: {
    "3000": "Shrill (Chillón)",
    "2000": "Clarity (Claridad)",
    "<120": "Muddy (Embarrado)",
    "400-600": "Lush and full (Lleno)"
  }
};

export const INSTRUMENT_FREQUENCY_MAP: Record<InstrumentCategory, { name: string, description: string, dictionaryKey: keyof typeof DETAILED_FREQUENCY_DICTIONARY | 'ALL' }> = {
  AUTO: { name: "Auto-Detección", description: "Gemini detectará la fuente.", dictionaryKey: 'ALL' as any },
  DRUMS: { name: "Batería (Drum Kit)", description: "Kit completo (Kick, Snare, Toms, OH).", dictionaryKey: 'ALL' as any }, // Special handling
  GUITAR_ACOUSTIC: { name: "Guitarra Acústica", description: "Cuerpo y Brillo.", dictionaryKey: 'GUITAR_ACOUSTIC' },
  GUITAR_ELECTRIC: { name: "Guitarra Eléctrica", description: "Poder y Presencia.", dictionaryKey: 'GUITAR_ELECTRIC' },
  VOCAL_MALE: { name: "Voz Masculina", description: "Cuerpo y Presencia.", dictionaryKey: 'VOCAL' },
  VOCAL_FEMALE: { name: "Voz Femenina", description: "Cuerpo y Aire.", dictionaryKey: 'VOCAL' },
  BASS: { name: "Bajo", description: "Sub y Ataque.", dictionaryKey: 'BASS' },
  KEYS: { name: "Teclados/Piano", description: "Rango completo.", dictionaryKey: 'PIANO' },
  HORNS: { name: "Vientos (Metal)", description: "Nasalidad y Cuerpo.", dictionaryKey: 'HORNS' },
  STRINGS: { name: "Cuerdas", description: "Lleno y Chillón.", dictionaryKey: 'STRINGS' },
  FULL_MIX: { name: "Full Mix", description: "Mastering.", dictionaryKey: 'ALL' as any }
};

// Plantilla Base (8 Bandas Estándar)
export const SPECTRAL_BANDS_TEMPLATE: Omit<FrequencyBand, 'id' | 'gainL' | 'gainR' | 'muted' | 'solo' | 'color'>[] = [
  { label: 'SUB LOW', range: [20, 60], centerFreq: 40 },
  { label: 'BASS', range: [60, 250], centerFreq: 150 },
  { label: 'LOW MIDS', range: [250, 500], centerFreq: 375 },
  { label: 'MIDS', range: [500, 2000], centerFreq: 1250 },
  { label: 'UPPER MIDS', range: [2000, 4000], centerFreq: 3000 },
  { label: 'PRESENCE', range: [4000, 6000], centerFreq: 5000 },
  { label: 'BRILLIANCE', range: [6000, 10000], centerFreq: 8000 },
  { label: 'AIR / HISS', range: [10000, 20000], centerFreq: 15000 },
];

export const BAND_COLORS = [
  'text-purple-500', 'text-indigo-500', 'text-blue-500', 'text-green-500', 
  'text-yellow-500', 'text-orange-500', 'text-red-500', 'text-pink-500'
];