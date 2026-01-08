import React, { useState, useRef, useEffect } from 'react';
import { Upload, Activity, Zap, Layers, Server, Settings, Download, FileText, AlertCircle, RefreshCw, Play, Eye, Music, Mic2, Drum, Save, ArrowRightLeft, Sliders, Volume2 } from 'lucide-react';
import { audioEngine } from './services/audioEngine';
import { analyzeAudioSession, generateSessionReport } from './services/geminiService';
import { AppState, SpectralAnalysis, FrequencyBand, ExportSettings, SPECTRAL_BANDS_TEMPLATE, BAND_COLORS, InstrumentCategory, INSTRUMENT_FREQUENCY_MAP, STEM_ISOLATION_PRESETS } from './types';
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
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentCategory>('AUTO');
  
  // Master Volumes
  const [inputVol, setInputVol] = useState(1.0);
  const [outputVol, setOutputVol] = useState(1.0);

  // Studio
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isStereoInput, setIsStereoInput] = useState(false);

  // Buffer
  const [generatedBuffer, setGeneratedBuffer] = useState<AudioBuffer | null>(null);

  // UI
  const [showExportModal, setShowExportModal] = useState(false);
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

  // Master Volume Effects
  useEffect(() => {
      audioEngine.setInputVolume(inputVol);
  }, [inputVol]);

  useEffect(() => {
      audioEngine.setOutputVolume(outputVol);
  }, [outputVol]);

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

  // --- LOGICA DE MAPEO PDF PARA BATERIA ---
  const getDrumHint = (bandIndex: number): { label: string, hint: string } => {
     switch(bandIndex) {
         case 0: return { label: "KICK SUB", hint: "Sub Low (<60Hz)" };
         case 1: return { label: "KICK/SNARE", hint: "Body/Punch (60-250Hz)" };
         case 2: return { label: "SNARE/TOMS", hint: "Mud/Resonance (250-500Hz)" };
         case 3: return { label: "SN/TOMS/GTR", hint: "Attack/Mid (500-2k)" };
         case 4: return { label: "ATTACK", hint: "Snap/Beater (2k-4k)" };
         case 5: return { label: "PRESENCE", hint: "Wire/Edge (4k-6k)" };
         case 6: return { label: "CYMBALS", hint: "Brilliance (6k-10k)" };
         case 7: return { label: "AIR", hint: "Hiss/Air (10k+)" };
         default: return { label: "BAND", hint: "" };
     }
  };

  const startSpectralProcessing = async (blob: Blob) => {
    setState(AppState.ANALYZING);

    try {
      // 1. AI Analysis
      const aiResults = await analyzeAudioSession(blob, selectedInstrument);
      setAnalysis(aiResults);

      // 2. Auto-Switch Logic
      let currentMode = selectedInstrument;
      if (selectedInstrument === 'AUTO' && aiResults.suggested_mode && aiResults.suggested_mode !== 'AUTO') {
          // Check if valid mode
          if (INSTRUMENT_FREQUENCY_MAP[aiResults.suggested_mode as InstrumentCategory]) {
              currentMode = aiResults.suggested_mode as InstrumentCategory;
              setSelectedInstrument(currentMode); // Update state
          }
      }

      // 3. Configure Bands
      const initialBands: FrequencyBand[] = SPECTRAL_BANDS_TEMPLATE.map((t, idx) => {
        let label = t.label;
        let hint = "";
        let detected = "";

        // Apply Drum Specific Labels
        if (currentMode === 'DRUMS') {
            const drumData = getDrumHint(idx);
            label = drumData.label;
            hint = drumData.hint;
        }

        // Apply AI Detected label
        if (aiResults.detected_instruments_per_band) {
            detected = aiResults.detected_instruments_per_band[idx.toString()] || 
                       aiResults.detected_instruments_per_band[t.label] || "";
        }

        return {
          ...t,
          id: `band_${idx}`,
          label: label,
          gainL: 1.0, 
          gainR: 1.0, 
          muted: false,
          solo: false,
          color: BAND_COLORS[idx],
          detectedInstrument: detected,
          pdfHint: hint
        };
      });
    
      setBands(initialBands);
      await audioEngine.loadAudio(blob, initialBands);
      setDuration(audioEngine.duration);
      setIsStereoInput(audioEngine.isStereo);

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

  const applyStemPreset = (presetKey: string) => {
      const preset = STEM_ISOLATION_PRESETS[presetKey];
      if (!preset) return;

      const newBands = bands.map((band, idx) => {
          const isActive = preset.activeBands.includes(idx);
          return {
              ...band,
              solo: isActive, // Solo the bands for this instrument
              muted: false
          };
      });
      
      setBands(newBands);
      // Apply updates to audio engine
      newBands.forEach(b => audioEngine.updateBandParams(b, true));
  };

  const downloadWav = (buffer: AudioBuffer, filename: string) => {
      const numOfChan = buffer.numberOfChannels;
      const length = buffer.length * numOfChan * 2 + 44;
      const bufferArr = new ArrayBuffer(length);
      const view = new DataView(bufferArr);
      const channels = [];
      let i;
      let sample;
      let offset = 0;
      let pos = 0;

      function setUint16(data: any) { view.setUint16(pos, data, true); pos += 2; }
      function setUint32(data: any) { view.setUint32(pos, data, true); pos += 4; }

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
      a.download = filename;
      a.click();
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

  const handleDownloadStem = async (band: FrequencyBand) => {
      setState(AppState.RENDERING);
      try {
          const stemBuffer = await audioEngine.renderSingleBand(band);
          const cleanInstrumentName = band.detectedInstrument 
             ? band.detectedInstrument.replace(/[^a-zA-Z0-9]/g, '_')
             : band.label;
             
          const name = `AIWIS_Stem_${cleanInstrumentName}_${band.label}.wav`;
          
          downloadWav(stemBuffer, name);
          setState(AppState.STUDIO);
      } catch (e) {
          handleError("Error exportando Stem");
          setState(AppState.STUDIO);
      }
  };

  const handleExportFull = () => {
      if (!generatedBuffer) return;
      downloadWav(generatedBuffer, `AIWIS_Full_Stereo_${selectedInstrument}_${Date.now()}.wav`);
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
          </div>
        </div>
        {state === AppState.STUDIO && (
          <div className="flex gap-4">
             <button onClick={async () => setReportHTML(await generateSessionReport(analysis, bands, {format:'wav', sampleRate:44100, bitDepth:24, bitRate:320, standardPitch:true}, selectedInstrument))} className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-daw-surface hover:text-white rounded transition text-gray-400">
              <FileText className="h-4 w-4" /> INFORME PDF
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
                Sube un audio Mono. AIWIS detectará si es Voz, Batería o Mezcla y configurará el entorno.
              </p>
            </div>

            {/* Instrument Selector */}
            <div className="bg-daw-panel border border-daw-surface p-6 rounded-xl w-full max-w-4xl space-y-4">
               <label className="text-xs font-bold text-daw-accent uppercase tracking-wider block">1. Selecciona Modo (o usa Auto-Detección)</label>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                         <span className="text-[9px] opacity-70 font-mono normal-case leading-tight">{INSTRUMENT_FREQUENCY_MAP[cat].description}</span>
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
                 <span className="text-sm font-bold text-gray-300">CARGAR AUDIO</span>
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
                {state === AppState.ANALYZING ? "ANALIZANDO & CLASIFICANDO..." : "RENDERIZANDO STEMS..."}
            </h2>
            {state === AppState.ANALYZING && (
                <p className="text-daw-muted text-sm font-mono text-center max-w-md animate-pulse">
                    Consultando tabla de frecuencias...<br/>
                    Detectando instrumentos en Full Mix...
                </p>
            )}
          </div>
        )}

        {/* --- STUDIO STATE --- */}
        {state === AppState.STUDIO && (
          <div className="space-y-6">

             {/* STEREO ALERT */}
             {isStereoInput && (
                 <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-3 flex items-center gap-3 animate-pulse">
                     <AlertCircle className="h-5 w-5 text-yellow-500" />
                     <div className="text-xs">
                         <span className="font-bold text-yellow-400 block">¡FUENTE ESTÉREO DETECTADA!</span>
                         El audio cargado ya tiene 2 canales. El procesamiento mantendrá la imagen original pero puedes alterar el paneo por bandas.
                     </div>
                 </div>
             )}
            
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[320px]">
              <div className="xl:col-span-2 bg-daw-panel border border-daw-surface rounded-lg p-1 relative shadow-2xl overflow-hidden flex flex-col">
                 <Visualizer isPlaying={isPlaying} />
                 
                 <div className="absolute top-2 right-2 flex gap-4 text-[10px] font-mono bg-black/50 p-2 rounded">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#00f0ff]"></div> L</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#ff003c]"></div> R</div>
                 </div>
                 <div className="absolute bottom-2 left-2 flex gap-2">
                     <span className="px-2 py-1 bg-daw-accent text-black text-[10px] font-bold rounded uppercase flex items-center gap-2">
                        MODO: {INSTRUMENT_FREQUENCY_MAP[selectedInstrument].name}
                     </span>
                     {selectedInstrument === 'DRUMS' && (
                         <span className="px-2 py-1 bg-daw-surface text-white text-[10px] font-bold rounded uppercase border border-gray-600">
                             KIT SPLIT HABILITADO
                         </span>
                     )}
                 </div>
              </div>
              
              <div className="flex flex-col gap-4 h-full">
                 <div className="flex-1 bg-daw-panel border border-daw-surface rounded-lg p-4 custom-scrollbar overflow-y-auto">
                    <h3 className="flex items-center gap-2 text-white font-bold text-sm mb-3"><Server className="h-4 w-4 text-daw-accent"/> DIAGNÓSTICO EXPERTO</h3>
                    {analysis ? (
                        <div className="space-y-3 text-xs text-gray-400">
                            {analysis.suggested_mode && analysis.suggested_mode !== 'AUTO' && (
                                <div className="p-2 bg-daw-accent/10 border border-daw-accent/30 rounded text-white mb-2">
                                    <span className="block text-[10px] text-daw-accent mb-1 font-bold uppercase">Auto-Detección:</span>
                                    Detectado <span className="font-bold">{analysis.suggested_mode}</span>. Entorno reconfigurado.
                                </div>
                            )}
                            <div><span className="text-daw-muted block mb-1">SUGERENCIA STEREO</span><span className="text-daw-accent">{analysis.stereo_width_suggestion}</span></div>
                            <div className="p-2 bg-daw-surface/50 rounded border-l-2 border-daw-accent">
                                <span className="text-gray-300 block mb-1 font-bold">Recomendación Técnica PDF:</span>
                                <p className="italic text-[10px]">{analysis.technical_recommendation}</p>
                            </div>
                        </div>
                    ) : null}
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

            {/* STAGE 2: STEM SEPARATION (MOISES STYLE) */}
            <div className="bg-daw-panel border border-daw-surface rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                    <Layers className="h-5 w-5 text-daw-accent"/>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Etapa 2: Separación de Stems (Virtual)</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    {Object.keys(STEM_ISOLATION_PRESETS).map(key => (
                        <button
                            key={key}
                            onClick={() => applyStemPreset(key)}
                            className="bg-daw-surface hover:bg-daw-accent hover:text-black text-xs font-bold py-3 rounded border border-daw-panel transition flex flex-col items-center justify-center gap-1 group"
                        >
                            <span className="text-[10px] opacity-50 group-hover:opacity-100">AISLAR</span>
                            {STEM_ISOLATION_PRESETS[key].name}
                        </button>
                    ))}
                    <button
                        onClick={() => {
                            setBands(bands.map(b => ({...b, solo: false, muted: false})));
                            bands.forEach(b => audioEngine.updateBandParams({...b, solo: false, muted: false}, false));
                        }}
                         className="bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/50 text-xs font-bold py-3 rounded transition"
                    >
                        RESET (FULL MIX)
                    </button>
                </div>
            </div>

            {/* MIXER */}
            <div className="bg-daw-panel border-t border-daw-surface p-6 shadow-2xl overflow-x-auto pb-6">
              
              <div className="flex gap-4">
                  
                  {/* MASTER INPUT */}
                  <div className="w-20 bg-daw-bg border border-daw-surface rounded-lg p-2 flex flex-col items-center justify-between py-4">
                      <span className="text-[9px] text-gray-400 font-bold">INPUT</span>
                      <Fader value={inputVol} min={0} max={2} step={0.01} onChange={setInputVol} height="h-32" colorClass="bg-green-500" />
                      <span className="text-[9px] font-mono">{inputVol.toFixed(2)}</span>
                  </div>

                  {/* BANDS */}
                  <div className="flex gap-2 min-w-max">
                    {bands.map(band => (
                    <div key={band.id} className="w-[170px] bg-daw-bg border border-daw-surface rounded-lg p-3 flex flex-col items-center gap-3 relative group hover:border-daw-accent/30 transition-colors">
                        <div className="w-full text-center">
                        <h4 className={`text-xs font-black ${band.color}`}>{band.label}</h4>
                        
                        {/* AI Detected Instrument Label */}
                        <div className="h-10 flex flex-col justify-center items-center w-full">
                            {band.detectedInstrument ? (
                                <div className="flex flex-col items-center w-full animate-fade-in-up">
                                    <span className="text-[8px] text-gray-500 uppercase tracking-widest mb-0.5">DETECTADO</span>
                                    <span className="text-[10px] text-black bg-daw-accent font-bold px-2 py-0.5 rounded shadow-lg shadow-daw-accent/20 block w-full truncate">
                                        {band.detectedInstrument}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-[9px] text-gray-600 font-mono">
                                    {band.pdfHint || `${band.range[0]}-${band.range[1]}Hz`}
                                </span>
                            )}
                        </div>

                        {/* Stem Download Button */}
                        <button 
                            onClick={() => handleDownloadStem(band)}
                            className="mt-2 w-full flex items-center justify-center gap-1 bg-gray-800 hover:bg-daw-accent hover:text-black text-[9px] py-1.5 rounded transition border border-gray-700 font-bold group-hover:border-daw-accent/50"
                            title={`Exportar Stem: ${band.detectedInstrument || band.label}`}
                        >
                            <Save className="h-3 w-3" /> STEM
                        </button>
                        </div>

                        <div className="flex justify-center gap-1 w-full mt-2">
                        <button onClick={() => updateBand(band.id, { muted: !band.muted })} className={`flex-1 py-1 text-[10px] font-bold rounded ${band.muted ? 'bg-daw-surface text-gray-500' : 'bg-daw-surface text-gray-300 hover:bg-gray-700'}`}>M</button>
                        <button onClick={() => updateBand(band.id, { solo: !band.solo })} className={`flex-1 py-1 text-[10px] font-bold rounded ${band.solo ? 'bg-yellow-400 text-black' : 'bg-daw-surface text-gray-300 hover:bg-gray-700'}`}>S</button>
                        </div>

                        <div className="w-full h-[1px] bg-daw-surface my-1"></div>

                        <div className="flex justify-between w-full gap-2 px-1">
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] font-bold text-[#00f0ff]">L</span>
                            <Fader value={band.gainL} min={0} max={1.5} step={0.01} onChange={(v) => updateBand(band.id, { gainL: v })} height="h-28" colorClass="bg-[#00f0ff]" />
                        </div>
                        <div className="w-[1px] bg-daw-surface h-28 self-center"></div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] font-bold text-[#ff003c]">R</span>
                            <Fader value={band.gainR} min={0} max={1.5} step={0.01} onChange={(v) => updateBand(band.id, { gainR: v })} height="h-28" colorClass="bg-[#ff003c]" />
                        </div>
                        </div>
                    </div>
                    ))}
                  </div>

                  {/* MASTER OUTPUT */}
                  <div className="w-24 bg-daw-panel border border-l-4 border-daw-surface rounded-lg p-2 flex flex-col items-center justify-between py-4 ml-4 shadow-xl">
                      <span className="text-[9px] text-white font-bold flex items-center gap-1"><Volume2 className="h-3 w-3"/> MASTER</span>
                      <Fader value={outputVol} min={0} max={1.5} step={0.01} onChange={setOutputVol} height="h-32" colorClass="bg-daw-secondary" />
                      <span className="text-[9px] font-mono text-daw-secondary">{outputVol.toFixed(2)}</span>
                  </div>

              </div>
            </div>

            {/* PREVIEW & EXPORT */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                 <div className="bg-daw-panel border border-daw-surface rounded-xl p-6 flex flex-col items-center justify-center gap-4 text-center">
                    <h3 className="text-white font-bold text-sm">3. GENERAR STEREO MIX FINAL</h3>
                    <p className="text-xs text-gray-400">Renderiza todos los cambios de EQ, Paneo y Volumen.</p>
                    <button 
                        onClick={handleGeneratePreview}
                        className="flex items-center gap-2 px-8 py-4 bg-daw-accent text-black font-black text-lg rounded hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition"
                    >
                        <Settings className="h-5 w-5 animate-spin-slow" /> RENDERIZAR TODO
                    </button>
                 </div>

                 <div className={`bg-daw-panel border border-daw-surface rounded-xl p-6 flex flex-col gap-4 ${!generatedBuffer ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                    <div className="flex justify-between items-center">
                        <h3 className="text-white font-bold text-sm flex items-center gap-2"><Eye className="h-4 w-4"/> FINAL MIXDOWN</h3>
                        <span className="text-[10px] text-daw-success font-mono">READY</span>
                    </div>
                    
                    <WaveformPreview buffer={generatedBuffer} />
                    
                    <div className="flex gap-2">
                        <button onClick={playGeneratedAudio} className="flex-1 py-2 bg-daw-surface hover:bg-daw-surface/80 rounded text-xs font-bold flex items-center justify-center gap-2">
                            <Play className="h-3 w-3" /> PLAY
                        </button>
                        <button onClick={handleExportFull} className="flex-1 py-2 bg-daw-success text-black rounded text-xs font-bold flex items-center justify-center gap-2 hover:bg-green-400">
                            <Download className="h-3 w-3" /> DESCARGAR FULL
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
                   <h3 className="text-xl font-bold text-white flex items-center gap-2"><FileText className="h-5 w-5 text-daw-accent"/> INFORME TÉCNICO PDF</h3>
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