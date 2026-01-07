import { GoogleGenAI, Type } from "@google/genai";
import { SpectralAnalysis, FrequencyBand, ExportSettings } from "../types";

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

export const analyzeAudioSession = async (audioBlob: Blob): Promise<SpectralAnalysis> => {
  if (!GEMINI_API_KEY) throw new Error("API Key requerida");

  const base64Audio = await blobToBase64(audioBlob);
  const prompt = `
    Actúa como un Ingeniero de Mastering de clase mundial.
    Analiza este audio Mono.
    Tu objetivo es sugerir una estrategia para convertirlo en STEREO usando separación por bandas de frecuencia.
    
    Provee:
    1. Frecuencias dominantes detectadas (dónde está la energía principal).
    2. Sugerencia de Ancho Estéreo (ej: "Mantener bajos centrados, abrir medios-agudos al 40%").
    3. Vibe/Estilo detectado.
    4. Recomendación técnica breve para la conversión.
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
          }
        }
      }
    });

    if (response.text) return JSON.parse(response.text) as SpectralAnalysis;
    throw new Error("No response text");
  } catch (error) {
    console.error(error);
    return {
      dominant_frequencies: "Análisis no disponible",
      stereo_width_suggestion: "Prueba manual sugerida",
      vibe: "Desconocido",
      technical_recommendation: "Ajusta el paneo de frecuencias altas para dar amplitud."
    };
  }
};

export const generateSessionReport = async (
  analysis: SpectralAnalysis | null, 
  bands: FrequencyBand[], 
  settings: ExportSettings
): Promise<string> => {
    const prompt = `
      Genera un informe técnico de Mastering Espectral para AIWIS.
      
      Análisis IA:
      - Dominante: ${analysis?.dominant_frequencies}
      - Sugerencia Stereo: ${analysis?.stereo_width_suggestion}
      
      Configuración de Bandas (Spectral Map):
      ${bands.map(b => `- ${b.label} (${b.range[0]}-${b.range[1]}Hz): Pan ${b.pan}, Vol ${b.volume}`).join('\n')}
      
      Formato Salida: ${settings.format.toUpperCase()} ${settings.sampleRate}Hz
      
      Crea un resumen de cómo se ha expandido la imagen estéreo de esta grabación.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt
        });
        return response.text || "No se pudo generar el informe.";
    } catch (e) {
        return "Error conectando con Gemini para el informe.";
    }
};