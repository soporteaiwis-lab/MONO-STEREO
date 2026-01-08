import { GoogleGenAI, Type } from "@google/genai";
import { SpectralAnalysis, FrequencyBand, ExportSettings, InstrumentCategory, INSTRUMENT_FREQUENCY_MAP } from "../types";

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

  // Prompt enriquecido con la tabla de frecuencias
  const prompt = `
    Actúa como un Ingeniero de Mezcla y Mastering experto en análisis espectral.
    
    CONTEXTO DE ENTRADA:
    - Audio proporcionado: ${instrumentCategory === 'AUTO' ? 'Detectar Automáticamente' : instrumentInfo.name}
    - Descripción esperada: ${instrumentInfo.description}
    
    TAREA:
    Analiza este audio Mono para convertirlo a Stereo.
    Identifica qué instrumentos o componentes residen en cada una de las 8 bandas de frecuencia estándar (Sub, Bass, LowMids, Mids, UpperMids, Presence, Brilliance, Air).

    ${instrumentCategory === 'DRUMS' ? 'MODO BATERÍA ACTIVO: Identifica específicamente dónde está el Bombo (Kick), Caja (Snare), Toms y Platillos para sugerir un paneo "Drummer Perspective".' : ''}

    Salida JSON requerida:
    1. Frecuencias dominantes.
    2. Sugerencia de Ancho Estéreo específica para este instrumento.
    3. Estilo/Vibe.
    4. Recomendación técnica.
    5. "detected_instruments_per_band": Un objeto mapeando las bandas (0 a 7) con el contenido detectado (ej: "Bombo Cuerpo", "Voz Aire", "Cuerda Guitarra").
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
      dominant_frequencies: "Análisis no disponible",
      stereo_width_suggestion: "Ajuste manual requerido",
      vibe: "Desconocido",
      technical_recommendation: "Verificar niveles de entrada.",
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
      Genera un informe HTML de Ingeniería de Audio para AIWIS Spectral Stereoizer.
      
      Fuente de Audio: ${instrumentName}
      
      Análisis Espectral IA:
      - Dominante: ${analysis?.dominant_frequencies}
      - Sugerencia: ${analysis?.stereo_width_suggestion}
      
      Mapa de Paneo (L/R) por Banda:
      ${bands.map(b => `- ${b.label} [${b.detectedInstrument || 'Generico'}]: L ${(b.gainL*100).toFixed(0)}% / R ${(b.gainR*100).toFixed(0)}%`).join('\n')}
      
      INSTRUCCIONES:
      Genera un reporte HTML profesional con estilos oscuros/minimalistas. 
      Incluye una sección de "Análisis de Instrumento" detallando cómo se trataron las frecuencias críticas de ${instrumentName}.
      Si es Batería, menciona la separación de piezas (Bombo, Caja, etc.).
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