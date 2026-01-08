import { GoogleGenAI, Type } from "@google/genai";
import { SpectralAnalysis, InstrumentCategory, INSTRUMENT_FREQUENCY_MAP, DETAILED_FREQUENCY_DICTIONARY, FrequencyBand, ExportSettings } from "../types";

const GEMINI_API_KEY = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Content = base64String.split(',')[1];
      resolve(base64Content);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const analyzeAudioSession = async (
    audioBlob: Blob, 
    instrumentCategory: InstrumentCategory
): Promise<SpectralAnalysis> => {
  if (!GEMINI_API_KEY) throw new Error("API Key requerida");

  const base64Audio = await blobToBase64(audioBlob);
  const instrumentInfo = INSTRUMENT_FREQUENCY_MAP[instrumentCategory];

  const technicalData = JSON.stringify(DETAILED_FREQUENCY_DICTIONARY, null, 2);
  const availableCategories = Object.keys(INSTRUMENT_FREQUENCY_MAP).filter(k => k !== 'AUTO').join(', ');

  const prompt = `
    Eres un Ingeniero de Audio Experto (AIWIS).
    
    CONOCIMIENTO EXPERTO (TABLA DE FRECUENCIAS):
    ${technicalData}
    
    MODO ACTUAL: ${instrumentCategory}
    
    TAREA 1: CLASIFICACIÓN
    Si el modo es 'AUTO' o 'FULL_MIX', escucha atentamente y determina cuál de estas categorías describe mejor el audio: [${availableCategories}]. 
    Si es una mezcla compleja, mantén 'FULL_MIX'. Si es claramente una batería aislada, sugiere 'DRUMS'.
    
    TAREA 2: MAPEO DE FRECUENCIAS (8 BANDAS)
    Analiza las 8 bandas (Sub 20-60, Bass 60-250, LowMids 250-500, Mids 500-2k, UpMids 2k-4k, Pres 4k-6k, Brill 6k-10k, Air 10k+).
    Para cada banda:
    - Si es 'FULL_MIX': Identifica qué instrumento predomina ahí (ej: "Kick/Bass", "Vocal Body", "Snare/Gtr").
    - Si es Instrumento Único: Identifica características (ej: "Cuerda", "Ataque", "Resonancia").
    - Usa términos de la tabla (Muddy, Boomy, Crisp) si aplican.
    
    SALIDA JSON:
    - "detected_instruments_per_band": Objeto { "0": "Kick Sub", "1": "Bass Body", ... } mapeando cada banda.
    - "suggested_mode": La categoría detectada (ej: "DRUMS", "VOCAL_FEMALE").
    - "technical_recommendation": Consejo de mezcla.
    - "dominant_frequencies": Rangos dominantes.
    - "stereo_width_suggestion": Sugerencia de paneo.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-native-audio-preview-12-2025",
      contents: {
        parts: [
          { inlineData: { mimeType: audioBlob.type || 'audio/wav', data: base64Audio } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            dominant_frequencies: { type: Type.STRING },
            stereo_width_suggestion: { type: Type.STRING },
            vibe: { type: Type.STRING },
            technical_recommendation: { type: Type.STRING },
            detected_instruments_per_band: { type: Type.OBJECT },
            suggested_mode: { type: Type.STRING } // New field
          }
        }
      }
    });

    if (response.text) return JSON.parse(response.text) as SpectralAnalysis;
    throw new Error("No response text");
  } catch (error) {
    console.error(error);
    return {
      dominant_frequencies: "N/A",
      stereo_width_suggestion: "Manual",
      vibe: "Unknown",
      technical_recommendation: "Check Levels",
      detected_instruments_per_band: {},
      suggested_mode: instrumentCategory
    };
  }
};

export const generateSessionReport = async (
  analysis: SpectralAnalysis | null, 
  bands: FrequencyBand[], 
  settings: ExportSettings, // kept for interface compat
  instrumentCategory: InstrumentCategory
): Promise<string> => {
    const instrumentName = INSTRUMENT_FREQUENCY_MAP[instrumentCategory].name;
    
    const prompt = `
      Genera un informe HTML para AIWIS Spectral Stereoizer.
      
      Instrumento Analizado: ${instrumentName}
      Modo Sugerido por IA: ${analysis?.suggested_mode || 'N/A'}
      
      Análisis Técnico (Basado en Tabla PDF):
      ${analysis?.technical_recommendation}
      
      Detalle de Bandas y Stems:
      ${bands.map(b => `- ${b.label}: ${b.detectedInstrument} (${b.range[0]}-${b.range[1]}Hz)`).join('\n')}
      
      INSTRUCCIONES:
      HTML profesional, fondo oscuro #121214, texto claro.
      Tabla comparativa de problemas detectados vs solucionados.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt
        });
        return response.text || "<p>Error generando reporte.</p>";
    } catch (e) {
        return "<p>Error de conexión.</p>";
    }
};