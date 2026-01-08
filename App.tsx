import React, { useState, useRef, useEffect } from 'react';
import { Upload, Activity, Zap, Layers, Server, Settings, Download, FileText, AlertCircle, RefreshCw, Play, Eye, Music, Mic2, Drum } from 'lucide-react';
import { audioEngine } from './services/audioEngine';
import { analyzeAudioSession, generateSessionReport } from './services/geminiService';
import { AppState, SpectralAnalysis, FrequencyBand, ExportSettings, SPECTRAL_BANDS_TEMPLATE, InstrumentCategory, INSTRUMENT_FREQUENCY_MAP } from './types';
import Visualizer from './components/Visualizer';
import WaveformPreview from './components/WaveformPreview';
import Fader from './components/Fader';
import Transport from './components/Transport';

const App: React.FC = () => {
  // State
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bands, setBands] = useState<FrequencyBand[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [analysis, setAnalysis] = useState<SpectralAnalysis | null>(null);
  
  // New: Instrument Category
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentCategory>('AUTO');

  // Studio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Generated Audio Preview
  const [generatedBuffer, setGeneratedBuffer] = useState<AudioBuffer | null>(null);

  // Modals
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: 'wav', sampleRate: 44100, bitDepth: 24, bitRate: 192, standardPitch: true
  });
  const [reportHTML, setReportHTML] = useState<string | null>(null);

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

  const getDrumLabel = (index: number, original: string): string => {
      // Mapping 8 bands to Drum Kit pieces
      const map = [
          "KICK SUB",      // 20-60
          "KICK PUNCH",    // 60-250
          "SNARE BODY",    // 250-500
          "SNARE SNAP",    // 500-2k
          "TOMS / GTR",    // 2k-4k
          "CYMBALS",       // 4k-6k
          "OVERHEADS",     // 6k-10k
          "ROOM / HATS"    // 10k+
      ];
      return map[index] || original;
  };

  const startSpectralProcessing = async (blob: Blob) => {
    setState(AppState.ANALYZING);

    try {
      // 1. AI Analysis FIRST to determine content if AUTO, or use selected
      const aiResults = await analyzeAudioSession(blob, selectedInstrument);
      setAnalysis(aiResults);

      // 2. Configure Bands based on Instrument Type
      const initialBands: FrequencyBand[] = SPECTRAL_BANDS_TEMPLATE.map((t, idx) => {
        let label = t.label;
        let detected = "";

        // Apply Drum Labels if Drums selected
        if (selectedInstrument === 'DRUMS') {
            label = getDrumLabel(idx, t.label);
        }

        // Apply AI Detected label if available
        if (aiResults.detected_instruments_per_band && aiResults.detected_instruments_per_band[idx.toString()]) {
             detected = aiResults.detected_instruments_per_band[idx.toString()];
        } else if (aiResults.detected_instruments_per_band && aiResults.detected_instruments_per_band[t.label]) {
            // Fallback key match
             detected = aiResults.detected_instruments_per_band[t.label];
        }

        return {
          ...t,
          id: `band_${idx}`,
          label: label,
          gainL: 1.0, 
          gainR: 1.0, 
          muted: false,
          solo: false,
          detectedInstrument: detected
        };
      });
    
      setBands(initialBands);

      // 3. Load Audio Engine
      await audioEngine.loadAudio(blob, initialBands);
      setDuration(audioEngine.duration);

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
      
      if ('solo' in updates || 'muted' in updates) {
          newBands.forEach(b => audioEngine.updateBandParams(b, activeSolo));
      }

      return newBands;
    });
  };

  const handleGeneratePreview = async () => {
      if (isPlaying) audioEngine.stop();
      setIsPlaying(false);
      setState(AppState.RENDERING);

      try {
          const renderedBuffer = await audioEngine.renderOffline(bands);
          setGeneratedBuffer(renderedBuffer);
          setState(AppState.STUDIO);
      } catch (e) {
          handleError("Falló la renderización.");
      }
  };

  const playGeneratedAudio = () => {
      if (!generatedBuffer || !audioEngine.audioContext) return;
      audioEngine.stop();
      setIsPlaying(false);

      const source = audioEngine.audioContext.createBufferSource();
      source.buffer = generatedBuffer;
      source.connect(audioEngine.audioContext.destination);
      source.start();
  };

  const handleExport = () => {
      if (!generatedBuffer) return;
      
      // Simple WAV export logic (reused)
      const buffer = generatedBuffer;
      const numOfChan = buffer.numberOfChannels;
      const length = buffer.length * numOfChan * 2 + 44;
      const bufferArr = new ArrayBuffer(length);
      const view = new DataView(bufferArr);
      const channels = [];
      let i;
      let sample;
      let offset = 0;
      let pos = 0;

      setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
      setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
      setUint32(buffer.sampleRate); setUint32(buffer.sampleRate * 2 * numOfChan);
      setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164);
      setUint32(length - pos - 4);

      for(i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

      while(pos < buffer.length) {
        for(i = 0; i < numOfChan; i++) {
          sample = Math.max(-1, Math.min(1, channels[i][pos]));
          sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0;
          view.setInt16(44 + offset, sample, true);
          offset += 2;
        }
        pos++;
      }

      const blob = new Blob([bufferArr], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AIWIS_Stereo_${selectedInstrument}_${Date.now()}.wav`;
      a.click();
      setShowExportModal(false);

      function setUint16(data: any) { view.setUint16(pos, data, true); pos += 2; }
      function setUint32(data: any) { view.setUint32(pos, data, true); pos += 4; }
  };

  return (
    <div className="min-h-screen bg-daw-bg text-daw-text font-sans selection:bg-daw-accent selection:text-black pb-20 overflow-x-hidden">
      
      {/* Navbar */}
      <nav className="border-b border-daw-surface bg-daw-panel/90 backdrop-blur-md sticky top-0 z-50 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-daw-accent" />
          <div className="leading-tight">
            <h1 className="text-xl font-bold tracking-widest text-white">AIWIS <span className="text-daw-accent font-light">SPECTRAL</span></h1>
          </div>
        </div>
        {state === AppState.STUDIO && (
          <div className="flex gap-4">
             <button onClick={async () => setReportHTML(await generateSessionReport(analysis, bands, exportSettings, selectedInstrument))} className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-daw-surface hover:text-white rounded transition text-gray-400">
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
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fade-in-up">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-black text-white tracking-tighter">SPECTRAL <span className="text-daw-accent">STEREOIZER</span></h2>
              <p className="text-xl text-daw-muted max-w-2xl mx-auto">
                Transformación Mono a Stereo Inteligente basada en Instrumentos.
              </p>
            </div>

            {/* Instrument Selector */}
            <div className="bg-daw-panel border border-daw-surface p-6 rounded-xl w-full max-w-lg space-y-4">
               <label className="text-xs font-bold text-daw-accent uppercase tracking-wider block">1. Selecciona Tipo de Audio</label>
               <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(INSTRUMENT_FREQUENCY_MAP) as InstrumentCategory[]).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedInstrument(cat)}
                        className={`p-3 text-left rounded border text-xs font-bold transition flex flex-col gap-1
                           ${selectedInstrument === cat 
                             ? 'bg-daw-accent text-black border-daw-accent' 
                             : 'bg-daw-bg border-daw-surface text-gray-400 hover:border-gray-500 hover:text-white'}`}
                      >
                         <span className="uppercase">{INSTRUMENT_FREQUENCY_MAP[cat].name}</span>
                         <span className="text-[9px] opacity-70 font-mono normal-case leading-tight">{INSTRUMENT_FREQUENCY_MAP[cat].description.substring(0, 40)}...</span>
                      </button>
                  ))}
               </div>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-80 h-32 bg-daw-panel border-2 border-dashed border-daw-surface hover:border-daw-accent hover:bg-daw-surface/50 rounded-2xl flex flex-col items-center justify-center gap-4 cursor-pointer transition group"
            >
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="audio/*" />
              <div className="flex items-center gap-3">
                 <Upload className="h-6 w-6 text-daw-accent" />
                 <span className="text-sm font-bold text-gray-300">CARGAR AUDIO MONO</span>
              </div>
            </div>
          </div>
        )}

        {/* --- PROCESSING STATES --- */}
        {(state === AppState.ANALYZING || state === AppState.RENDERING) && (
          <div className="flex flex-col items-center justify-center h-[60vh] space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-daw-accent blur-xl opacity-20 animate-pulse-slow"></div>
              <RefreshCw className="h-16 w-16 text-daw-accent animate-spin relative z-10" />
            </div>
            <h2 className="text-2xl font-mono text-white">
                {state === AppState.ANALYZING ? "ANALIZANDO FRECUENCIAS..." : "RENDERIZANDO STEREO..."}
            </h2>
            {state === AppState.ANALYZING && (
                <p className="text-daw-muted text-sm font-mono">
                    Detectando componentes de {INSTRUMENT_FREQUENCY_MAP[selectedInstrument].name}
                </p>
            )}
          </div>
        )}

        {/* --- STUDIO STATE --- */}
        {state === AppState.STUDIO && (
          <div className="space-y-6">
            
            {/* TOP ROW: REALTIME VISUALIZER + CONTROLS */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[320px]">
              <div className="xl:col-span-2 bg-daw-panel border border-daw-surface rounded-lg p-1 relative shadow-2xl overflow-hidden">
                 <Visualizer isPlaying={isPlaying} />
                 {/* Legend */}
                 <div className="absolute top-2 right-2 flex gap-4 text-[10px] font-mono bg-black/50 p-2 rounded">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#00f0ff]"></div> L</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#ff003c]"></div> R</div>
                 </div>
                 <div className="absolute bottom-2 left-2 flex gap-2">
                     <span className="px-2 py-1 bg-daw-accent text-black text-[10px] font-bold rounded uppercase">
                        MODO: {INSTRUMENT_FREQUENCY_MAP[selectedInstrument].name}
                     </span>
                 </div>
              </div>
              
              <div className="flex flex-col gap-4 h-full">
                 <div className="flex-1 bg-daw-panel border border-daw-surface rounded-lg p-4 custom-scrollbar overflow-y-auto">
                    <h3 className="flex items-center gap-2 text-white font-bold text-sm mb-3"><Server className="h-4 w-4 text-daw-accent"/> ANÁLISIS ESPECTRAL</h3>
                    {analysis ? (
                        <div className="space-y-3 text-xs text-gray-400">
                             <div><span className="text-daw-muted block mb-1">SUGERENCIA STEREO</span><span className="text-daw-accent">{analysis.stereo_width_suggestion}</span></div>
                            <p className="italic border-l-2 border-daw-secondary pl-2 text-[10px]">{analysis.technical_recommendation}</p>
                            <div>
                                <span className="text-daw-muted block mb-1">FRECUENCIAS DOMINANTES</span>
                                <span className="font-mono text-white">{analysis.dominant_frequencies}</span>
                            </div>
                        </div>
                    ) : <span className="text-xs text-daw-muted animate-pulse">Consultando...</span>}
                 </div>
                 
                 <div className="">
                     <Transport 
                        isPlaying={isPlaying} 
                        onPlay={() => { audioEngine.play(bands); setIsPlaying(true); }}
                        onPause={() => { audioEngine.pause(); setIsPlaying(false); }}
                        onStop={() => { audioEngine.stop(); setIsPlaying(false); }}
                        onSkip={(sec) => audioEngine.skip(sec, bands)}
                        onSeekStart={() => audioEngine.seek(0, bands)}
                        onSeekEnd={() => audioEngine.seek(duration, bands)}
                     />
                 </div>
              </div>
            </div>

            {/* MIDDLE ROW: MIXER */}
            <div className="bg-daw-panel border-t border-daw-surface p-6 shadow-2xl overflow-x-auto pb-12">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    {selectedInstrument === 'DRUMS' ? <Drum className="h-5 w-5 text-daw-accent"/> : <Layers className="h-5 w-5 text-daw-muted" />}
                    <h3 className="font-bold text-white tracking-widest text-sm">
                        {selectedInstrument === 'DRUMS' ? 'MEZCLADOR DE BATERÍA (KIT SPLIT)' : 'CONSOLA L/R INDEPENDIENTE'}
                    </h3>
                </div>
              </div>
              <div className="flex gap-2 min-w-max justify-between">
                {bands.map(band => (
                  <div key={band.id} className="w-[160px] bg-daw-bg border border-daw-surface rounded-lg p-3 flex flex-col items-center gap-3 relative group hover:border-daw-accent/30 transition-colors">
                    <div className="w-full text-center">
                       <h4 className={`text-xs font-black ${band.color}`}>{band.label}</h4>
                       {/* AI Detected Label */}
                       {band.detectedInstrument && (
                           <span className="block mt-1 text-[9px] bg-daw-surface text-daw-accent px-1 rounded animate-pulse">
                               {band.detectedInstrument}
                           </span>
                       )}
                       <span className="text-[9px] text-gray-500 font-mono block mt-1">{band.range[0]}Hz - {band.range[1]}Hz</span>
                    </div>
                    <div className="flex justify-center gap-1 w-full">
                       <button onClick={() => updateBand(band.id, { muted: !band.muted })} className={`flex-1 py-1 text-[10px] font-bold rounded ${band.muted ? 'bg-daw-surface text-gray-500' : 'bg-daw-surface text-gray-300 hover:bg-gray-700'}`}>M</button>
                       <button onClick={() => updateBand(band.id, { solo: !band.solo })} className={`flex-1 py-1 text-[10px] font-bold rounded ${band.solo ? 'bg-yellow-400 text-black' : 'bg-daw-surface text-gray-300 hover:bg-gray-700'}`}>S</button>
                    </div>
                    <div className="w-full h-[1px] bg-daw-surface my-1"></div>
                    <div className="flex justify-between w-full gap-2 px-1">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[9px] font-bold text-[#00f0ff]">L</span>
                        <Fader value={band.gainL} min={0} max={1.5} step={0.01} onChange={(v) => updateBand(band.id, { gainL: v })} height="h-32" colorClass="bg-[#00f0ff]" />
                      </div>
                      <div className="w-[1px] bg-daw-surface h-32 self-center"></div>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[9px] font-bold text-[#ff003c]">R</span>
                        <Fader value={band.gainR} min={0} max={1.5} step={0.01} onChange={(v) => updateBand(band.id, { gainR: v })} height="h-32" colorClass="bg-[#ff003c]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* BOTTOM ROW: PREVIEW & EXPORT */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                 <div className="bg-daw-panel border border-daw-surface rounded-xl p-6 flex flex-col items-center justify-center gap-4 text-center">
                    <h3 className="text-white font-bold text-sm">1. GENERAR STEREO</h3>
                    <p className="text-xs text-gray-400">Procesa el audio con la configuración de {INSTRUMENT_FREQUENCY_MAP[selectedInstrument].name} para previsualizar.</p>
                    <button 
                        onClick={handleGeneratePreview}
                        className="flex items-center gap-2 px-8 py-4 bg-daw-accent text-black font-black text-lg rounded hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition"
                    >
                        <Settings className="h-5 w-5 animate-spin-slow" /> GENERAR PREVISUALIZACIÓN
                    </button>
                 </div>

                 <div className={`bg-daw-panel border border-daw-surface rounded-xl p-6 flex flex-col gap-4 ${!generatedBuffer ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                    <div className="flex justify-between items-center">
                        <h3 className="text-white font-bold text-sm flex items-center gap-2"><Eye className="h-4 w-4"/> RESULTADO FINAL</h3>
                        <span className="text-[10px] text-daw-success font-mono">READY</span>
                    </div>
                    
                    {/* Static Preview */}
                    <WaveformPreview buffer={generatedBuffer} />
                    
                    <div className="flex gap-2">
                        <button onClick={playGeneratedAudio} className="flex-1 py-2 bg-daw-surface hover:bg-daw-surface/80 rounded text-xs font-bold flex items-center justify-center gap-2">
                            <Play className="h-3 w-3" /> ESCUCHAR
                        </button>
                        <button onClick={handleExport} className="flex-1 py-2 bg-daw-success text-black rounded text-xs font-bold flex items-center justify-center gap-2 hover:bg-green-400">
                            <Download className="h-3 w-3" /> DESCARGAR WAV
                        </button>
                    </div>
                 </div>
            </div>

          </div>
        )}

        {/* --- HTML REPORT MODAL --- */}
        {reportHTML && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="bg-daw-panel border border-daw-surface rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
               <div className="p-6 border-b border-daw-surface flex justify-between items-center">
                   <h3 className="text-xl font-bold text-white flex items-center gap-2"><FileText className="h-5 w-5 text-daw-accent"/> INFORME DE MASTERING</h3>
                   <button onClick={() => setReportHTML(null)} className="text-gray-400 hover:text-white">✕</button>
               </div>
               <div className="p-8 overflow-y-auto prose prose-invert max-w-none">
                   <div dangerouslySetInnerHTML={{ __html: reportHTML }} />
               </div>
               <div className="p-4 border-t border-daw-surface bg-daw-bg/50 text-center">
                   <button onClick={() => setReportHTML(null)} className="px-6 py-2 bg-daw-surface hover:bg-white hover:text-black rounded transition text-sm font-bold">CERRAR</button>
               </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;