import { GoogleGenAI, Type } from "@google/genai";
import { TrackAnalysis } from "../types";

const GEMINI_API_KEY = process.env.API_KEY || '';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g., "data:audio/wav;base64,")
      const base64Content = base64String.split(',')[1];
      resolve(base64Content);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const analyzeAudioContent = async (audioBlob: Blob): Promise<TrackAnalysis> => {
  if (!GEMINI_API_KEY) {
    throw new Error("API Key faltante. Configura process.env.API_KEY");
  }

  try {
    const base64Audio = await blobToBase64(audioBlob);

    const prompt = `
      Actúa como un ingeniero de mezcla y masterización experto.
      Analiza este fragmento de audio monofónico.
      1. Identifica el género y los instrumentos.
      2. Sugiere una configuración de mezcla estéreo simulada (panning) para separar frecuencias bajas, medias y altas.
      3. Dame feedback creativo.
      
      Responde SOLO con un objeto JSON.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-native-audio-preview-12-2025", // Using appropriate model for audio input
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type || 'audio/wav',
              data: base64Audio
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            genre: { type: Type.STRING },
            mood: { type: Type.STRING },
            instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedMix: {
              type: Type.OBJECT,
              properties: {
                bass: { type: Type.NUMBER, description: "Pan value -1 (L) to 1 (R) for low frequencies" },
                mids: { type: Type.NUMBER, description: "Pan value -1 (L) to 1 (R) for mid frequencies" },
                highs: { type: Type.NUMBER, description: "Pan value -1 (L) to 1 (R) for high frequencies" },
                width: { type: Type.NUMBER, description: "Stereo expansion factor 0 to 1" }
              }
            },
            feedback: { type: Type.STRING }
          }
        }
      }
    });

    if (response.text) {
        return JSON.parse(response.text) as TrackAnalysis;
    }
    
    throw new Error("No se pudo analizar el audio.");

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    // Fallback Mock data if API fails or model is overloaded/unavailable
    return {
      genre: "Desconocido",
      mood: "Experimental",
      instruments: ["Audio Detectado"],
      suggestedMix: { bass: 0, mids: -0.3, highs: 0.3, width: 0.8 },
      feedback: "No se pudo conectar con el motor de IA. Usando configuración predeterminada."
    };
  }
};
