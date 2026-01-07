import React, { useState, useRef, useEffect } from 'react';
import { Upload, Activity, Zap, Layers, Server, Settings, Download, FileText, AlertCircle, RefreshCw } from 'lucide-react';
import { audioEngine } from './services/audioEngine';
import { analyzeAudioSession, generateSessionReport } from './services/geminiService';
import { AppState, SpectralAnalysis, FrequencyBand, ExportSettings, SPECTRAL_BANDS_TEMPLATE } from './types';
import Visualizer from './components/Visualizer';
import Knob from './components/Knob';
import Fader from './components/Fader';
import Transport from './components/Transport';

const App: React.FC = () => {
  // State
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bands, setBands] = useState<FrequencyBand[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [analysis, setAnalysis] = useState<SpectralAnalysis | null>(null);
  
  // Studio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Modals
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: 'wav', sampleRate: 44100, bitDepth: 24, bitRate: 192, standardPitch: true
  });
  const [report, setReport] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<number>(0);

  // --- Time Loop ---
  useEffect(() => {
    const updateTime = () => {
      if (audioEngine.audioContext && isPlaying) {
        setCurrentTime(audioEngine.currentTime);
        setDuration(audioEngine.duration);
        timeRef.current = requestAnimationFrame(updateTime);
      }
    };
    if (isPlaying) {
      updateTime();
    } else {
      cancelAnimationFrame(timeRef.current);
    }
    return () => cancelAnimationFrame(timeRef.current);
  }, [isPlaying]);

  // --- Handlers ---

  const handleError = (msg: string) => {
    setErrorMessage(msg);
    setState(AppState.ERROR);
    setTimeout(() => {
      setErrorMessage(null);
      setState(AppState.IDLE);
    }, 4000);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAudioBlob(file);
      startSpectralProcessing(file);
    }
  };

  const startSpectralProcessing = async (blob: Blob) => {
    setState(AppState.ANALYZING);

    // 1. Initialize Bands from Template
    const initialBands: FrequencyBand[] = SPECTRAL_BANDS_TEMPLATE.map((t, idx) => ({
      ...t,
      id: `band_${idx}`,
      volume: 1.0,
      pan: 0, // Start centered
      muted: false,
      solo: false
    }));
    
    setBands(initialBands);

    try {
      // 2. Load into Audio Engine (This creates the filters)
      await audioEngine.loadAudio(blob, initialBands);
      setDuration(audioEngine.duration);

      // 3. AI Analysis
      analyzeAudioSession(blob).then(setAnalysis).catch(console.error);

      setState(AppState.STUDIO);
    } catch (e) {
      console.error(e);
      handleError("Error al inicializar el motor espectral.");
    }
  };

  const updateBand = (id: string, updates: Partial<FrequencyBand>) => {
    setBands(prev => {
      const newBands = prev.map(b => b.id === id ? { ...b, ...updates } : b);
      const activeSolo = newBands.some(b => b.solo);
      
      const band = newBands.find(b => b.id === id);
      if (band) audioEngine.updateBandParams(band, activeSolo);
      
      // Refresh mutes if solo changed
      if ('solo' in updates || 'muted' in updates) {
          newBands.forEach(b => audioEngine.updateBandParams(b, activeSolo));
      }

      return newBands;
    });
  };

  const handleExport = () => {
    if (!audioBlob) return;
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AIWIS_Stereo_Remaster_${exportSettings.sampleRate}Hz.${exportSettings.format}`;
    a.click();
    setShowExportModal(false);
  };

  return (
    <div className="min-h-screen bg-daw-bg text-daw-text font-sans selection:bg-daw-accent selection:text-black pb-20 overflow-x-hidden">
      
      {/* Navbar */}
      <nav className="border-b border-daw-surface bg-daw-panel/90 backdrop-blur-md sticky top-0 z-50 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-daw-accent" />
          <div className="leading-tight">
            <h1 className="text-xl font-bold tracking-widest text-white">AIWIS <span className="text-daw-accent font-light">SPECTRAL</span></h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em]">Armin Salazar San Martin</p>
          </div>
        </div>
        {state === AppState.STUDIO && (
          <div className="flex gap-4">
            <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-daw-surface hover:bg-daw-accent hover:text-black rounded transition">
              <Download className="h-4 w-4" /> EXPORTAR STEREO
            </button>
            <button onClick={async () => setReport(await generateSessionReport(analysis, bands, exportSettings))} className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-daw-surface hover:text-white rounded transition text-gray-400">
              <FileText className="h-4 w-4" /> INFORME
            </button>
          </div>
        )}
      </nav>

      <main className="max-w-[1800px] mx-auto p-4 md:p-6 space-y-6">

        {/* --- ERROR STATE --- */}
        {state === AppState.ERROR && (
           <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-daw-secondary text-white px-6 py-4 rounded-lg shadow-xl flex items-center gap-3 z-50 animate-bounce">
              <AlertCircle className="h-6 w-6" />
              <span className="font-bold">{errorMessage}</span>
           </div>
        )}

        {/* --- IDLE STATE --- */}
        {state === AppState.IDLE && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-12 animate-fade-in-up">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-black text-white tracking-tighter">SPECTRAL <span className="text-daw-accent">STEREOIZER</span></h2>
              <p className="text-xl text-daw-muted max-w-2xl mx-auto">
                Convierte audio Mono en Stereo Real mediante la manipulación quirúrgica de 8 bandas de frecuencia.
              </p>
            </div>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-80 h-48 bg-daw-panel border-2 border-dashed border-daw-surface hover:border-daw-accent hover:bg-daw-surface/50 rounded-2xl flex flex-col items-center justify-center gap-4 cursor-pointer transition group"
            >
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="audio/*" />
              <div className="p-4 bg-daw-bg rounded-full group-hover:scale-110 transition">
                 <Upload className="h-8 w-8 text-daw-accent" />
              </div>
              <span className="text-sm font-bold text-gray-300">CARGAR AUDIO MONO</span>
            </div>
          </div>
        )}

        {/* --- ANALYZING STATE --- */}
        {state === AppState.ANALYZING && (
          <div className="flex flex-col items-center justify-center h-[60vh] space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-daw-accent blur-xl opacity-20 animate-pulse-slow"></div>
              <RefreshCw className="h-16 w-16 text-daw-accent animate-spin relative z-10" />
            </div>
            <h2 className="text-2xl font-mono text-white">DIVIDIENDO ESPECTRO...</h2>
            <p className="text-daw-muted text-sm">Creando crossovers de frecuencia y asignando filtros.</p>
          </div>
        )}

        {/* --- STUDIO STATE --- */}
        {state === AppState.STUDIO && (
          <div className="space-y-6">
            
            {/* Visualizer & Info Rack */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[320px]">
              <div className="xl:col-span-2 bg-daw-panel border border-daw-surface rounded-lg p-1 relative shadow-2xl overflow-hidden">
                 <Visualizer isPlaying={isPlaying} />
                 {/* Legend */}
                 <div className="absolute bottom-2 right-2 flex gap-4 text-[10px] font-mono bg-black/50 p-2 rounded">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#00f0ff]"></div> CANAL L (Left)</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#ff003c]"></div> CANAL R (Right)</div>
                 </div>
              </div>
              
              <div className="flex flex-col gap-4 h-full">
                 {/* AI Info */}
                 <div className="flex-1 bg-daw-panel border border-daw-surface rounded-lg p-4 custom-scrollbar overflow-y-auto">
                    <h3 className="flex items-center gap-2 text-white font-bold text-sm mb-3"><Server className="h-4 w-4 text-daw-accent"/> ANÁLISIS ESPECTRAL IA</h3>
                    {analysis ? (
                        <div className="space-y-3 text-xs text-gray-400">
                            <div>
                                <span className="text-daw-muted block mb-1">FRECUENCIAS DOMINANTES</span>
                                <span className="text-white font-mono">{analysis.dominant_frequencies}</span>
                            </div>
                             <div>
                                <span className="text-daw-muted block mb-1">SUGERENCIA STEREO</span>
                                <span className="text-daw-accent">{analysis.stereo_width_suggestion}</span>
                            </div>
                            <p className="italic border-l-2 border-daw-secondary pl-2 text-[10px]">{analysis.technical_recommendation}</p>
                        </div>
                    ) : <span className="text-xs text-daw-muted animate-pulse">Consultando a Gemini...</span>}
                 </div>
                 
                 {/* Transport */}
                 <div className="">
                     <Transport 
                        isPlaying={isPlaying} 
                        onPlay={() => { audioEngine.play(); setIsPlaying(true); }}
                        onPause={() => { audioEngine.pause(); setIsPlaying(false); }}
                        onStop={() => { audioEngine.stop(); setIsPlaying(false); }}
                        onSkip={(sec) => audioEngine.skip(sec)}
                        onSeekStart={() => audioEngine.seek(0)}
                        onSeekEnd={() => audioEngine.seek(duration)}
                     />
                 </div>
              </div>
            </div>

            {/* SPECTRAL MIXER CONSOLE */}
            <div className="bg-daw-panel border-t border-daw-surface p-6 shadow-2xl overflow-x-auto pb-12">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-daw-muted" />
                    <h3 className="font-bold text-white tracking-widest text-sm">CONSOLA ESPECTRAL (8 BANDAS)</h3>
                </div>
                <div className="text-xs text-daw-muted font-mono">
                    MOVER PANEO PARA CREAR STEREO
                </div>
              </div>
              
              <div className="flex gap-2 min-w-max justify-between">
                {bands.map(band => (
                  <div key={band.id} className="w-[140px] bg-daw-bg border border-daw-surface rounded-lg p-3 flex flex-col items-center gap-3 relative group hover:border-daw-accent/30 transition-colors">
                    
                    {/* Frequency Header */}
                    <div className="w-full text-center">
                       <h4 className={`text-xs font-black ${band.color}`}>{band.label}</h4>
                       <span className="text-[9px] text-gray-500 font-mono block">{band.range[0]}Hz - {band.range[1]}Hz</span>
                    </div>

                    {/* Mute/Solo */}
                    <div className="flex justify-center gap-1 w-full">
                       <button onClick={() => updateBand(band.id, { muted: !band.muted })} className={`flex-1 py-1 text-[10px] font-bold rounded ${band.muted ? 'bg-daw-surface text-gray-500' : 'bg-daw-surface text-gray-300 hover:bg-gray-700'}`}>M</button>
                       <button onClick={() => updateBand(band.id, { solo: !band.solo })} className={`flex-1 py-1 text-[10px] font-bold rounded ${band.solo ? 'bg-yellow-400 text-black' : 'bg-daw-surface text-gray-300 hover:bg-gray-700'}`}>S</button>
                    </div>

                    <div className="w-full h-[1px] bg-daw-surface my-1"></div>

                    {/* PANNING (The core feature) */}
                    <Knob label="STEREO PAN" value={band.pan} min={-1} max={1} step={0.05} onChange={(v) => updateBand(band.id, { pan: v })} color={band.color} />
                    
                    {/* VOL */}
                    <Fader value={band.volume} min={0} max={1.5} step={0.01} onChange={(v) => updateBand(band.id, { volume: v })} height="h-32" />
                    
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* --- EXPORT MODAL --- */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-daw-panel border border-daw-surface p-8 rounded-xl max-w-md w-full space-y-6">
               <h3 className="text-xl font-bold text-white flex items-center gap-2"><Settings className="h-5 w-5"/> RENDERIZAR FINAL</h3>
               <div className="space-y-4">
                 <div>
                   <label className="text-xs text-daw-muted block mb-1">FORMATO</label>
                   <div className="flex gap-2">
                     <button onClick={() => setExportSettings(s => ({...s, format: 'wav'}))} className={`flex-1 py-2 text-sm rounded ${exportSettings.format === 'wav' ? 'bg-daw-accent text-black font-bold' : 'bg-daw-surface'}`}>WAV (PCM)</button>
                     <button onClick={() => setExportSettings(s => ({...s, format: 'mp3'}))} className={`flex-1 py-2 text-sm rounded ${exportSettings.format === 'mp3' ? 'bg-daw-accent text-black font-bold' : 'bg-daw-surface'}`}>MP3</button>
                   </div>
                 </div>
                 {/* Simplified Sample Rate for Export */}
                 <div>
                   <label className="text-xs text-daw-muted block mb-1">CALIDAD</label>
                   <select 
                      value={exportSettings.sampleRate}
                      onChange={(e) => setExportSettings(s => ({...s, sampleRate: Number(e.target.value) as any}))}
                      className="w-full bg-daw-bg border border-daw-surface rounded p-2 text-sm"
                   >
                     <option value={44100}>44.1 kHz</option>
                     <option value={48000}>48 kHz</option>
                     <option value={96000}>96 kHz</option>
                   </select>
                 </div>
               </div>
               <div className="flex gap-4 pt-4">
                 <button onClick={() => setShowExportModal(false)} className="flex-1 py-3 text-sm text-gray-400 hover:text-white">Cancelar</button>
                 <button onClick={handleExport} className="flex-1 py-3 bg-daw-success text-black font-bold rounded hover:bg-green-400">DESCARGAR</button>
               </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;