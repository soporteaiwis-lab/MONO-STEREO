import { GoogleGenAI, Type } from "@google/genai";
import { SpectralAnalysis, FrequencyBand, ExportSettings, InstrumentCategory, INSTRUMENT_FREQUENCY_MAP, DETAILED_FREQUENCY_DICTIONARY } from "../types";

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

  // Convert PDF Data to String for the prompt
  const technicalData = JSON.stringify(DETAILED_FREQUENCY_DICTIONARY, null, 2);

  const prompt = `
    Eres un Ingeniero de Audio Experto.
    
    CONOCIMIENTO EXPERTO (TABLA DE FRECUENCIAS):
    ${technicalData}
    
    AUDIO DE ENTRADA: ${instrumentCategory === 'AUTO' ? 'Detectar Automáticamente' : instrumentInfo.name}
    DESCRIPCIÓN: ${instrumentInfo.description}
    
    OBJETIVO:
    Analiza este audio Mono.
    Cruza la información con la Tabla de Frecuencias provista.
    
    Para las 8 bandas (Sub 20-60, Bass 60-250, LowMids 250-500, Mids 500-2k, UpMids 2k-4k, Pres 4k-6k, Brill 6k-10k, Air 10k+):
    1. Identifica qué componente específico reside ahí (ej: "Caja Deep" en 80Hz, "Voz Aire" en 12kHz).
    2. Usa EXACTAMENTE los términos de la tabla si aplican (ej: "Muddy", "Boomy", "Crisp").
    
    SALIDA JSON:
    - "detected_instruments_per_band": Mapeo de ID de banda (0 a 7) a la descripción exacta del componente detectado.
    - "technical_recommendation": Consejo de mezcla basado en la tabla (ej: "Cortar 400Hz en el Bombo para quitar Muddy").
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
            detected_instruments_per_band: { type: Type.OBJECT }
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
      detected_instruments_per_band: {}
    };
  }
};

export const generateSessionReport = async (
  analysis: SpectralAnalysis | null, 
  bands: FrequencyBand[], 
  settings: ExportSettings,
  instrumentCategory: InstrumentCategory
): Promise<string> => {
    const instrumentName = INSTRUMENT_FREQUENCY_MAP[instrumentCategory].name;
    
    const prompt = `
      Genera un informe HTML para AIWIS Spectral Stereoizer.
      
      Instrumento: ${instrumentName}
      
      Análisis Técnico (Basado en Tabla PDF):
      ${analysis?.technical_recommendation}
      
      Configuración de Stems Exportados:
      ${bands.map(b => `- ${b.label} [${b.detectedInstrument || b.pdfHint || 'Generico'}]: L:${(b.gainL*100).toFixed(0)}% / R:${(b.gainR*100).toFixed(0)}%`).join('\n')}
      
      INSTRUCCIONES:
      HTML profesional, fondo oscuro, texto claro.
      Incluye una tabla detallando qué frecuencias se realzaron o cortaron según los "Problemas" y "Efectos" del conocimiento experto (Muddy, Boxy, Presence, etc).
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