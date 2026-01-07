import { GoogleGenAI, Type } from "@google/genai";
import { TrackAnalysis, TrackData, ExportSettings } from "../types";

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

export const analyzeAudioSession = async (audioBlob: Blob): Promise<TrackAnalysis> => {
  if (!GEMINI_API_KEY) throw new Error("API Key requerida");

  const base64Audio = await blobToBase64(audioBlob);
  const prompt = `
    Analiza esta pista de audio para el estudio AIWIS.
    Identifica:
    1. Género Musical.
    2. BPM aproximado y Tonalidad (Key).
    3. Mood/Vibe.
    4. Un resumen técnico corto para ingenieros (rango dinámico, balance).
    5. Sugerencias de mezcla creativa.
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
            genre: { type: Type.STRING },
            bpm: { type: Type.STRING },
            key: { type: Type.STRING },
            mood: { type: Type.STRING },
            technical_summary: { type: Type.STRING },
            ai_suggestions: { type: Type.STRING },
          }
        }
      }
    });

    if (response.text) return JSON.parse(response.text) as TrackAnalysis;
    throw new Error("No response text");
  } catch (error) {
    console.error(error);
    return {
      genre: "Detectando...",
      bpm: "--",
      key: "--",
      mood: "Análisis pendiente",
      technical_summary: "El motor de IA está ocupado. Intenta nuevamente.",
      ai_suggestions: "Ajusta niveles manualmente."
    };
  }
};

export const generateSessionReport = async (
  analysis: TrackAnalysis | null, 
  tracks: TrackData[], 
  settings: ExportSettings
): Promise<string> => {
    const prompt = `
      Genera un informe técnico formal en formato Markdown para una sesión de estudio de grabación AIWIS.
      
      Detalles de la sesión:
      Visionario: Armin Salazar San Martin
      Género: ${analysis?.genre || 'N/A'}
      BPM/Key: ${analysis?.bpm} / ${analysis?.key}
      
      Pistas (Stems):
      ${tracks.map(t => `- ${t.name}: Vol ${(t.volume*100).toFixed(0)}%, Pan ${t.pan}, ${t.muted ? '(MUTE)' : ''}`).join('\n')}
      
      Configuración de Exportación:
      Formato: ${settings.format.toUpperCase()}
      Calidad: ${settings.sampleRate}Hz / ${settings.bitDepth}bit
      Ajuste 440Hz: ${settings.standardPitch ? 'Sí' : 'No'}
      
      Crea un resumen ejecutivo elegante y profesional.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });
        return response.text || "No se pudo generar el informe.";
    } catch (e) {
        return "Error conectando con Gemini para el informe.";
    }
};
