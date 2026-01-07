import React, { useState, useRef, useEffect } from 'react';
import { Mic, Upload, Activity, Zap, Layers, Music, Server, Settings, FileAudio, Download, FileText, Sliders, Play, Scissors, AlertCircle } from 'lucide-react';
import { audioEngine } from './services/audioEngine';
import { analyzeAudioSession, generateSessionReport } from './services/geminiService';
import { AppState, TrackAnalysis, TrackData, ExportSettings, EQBand, DEFAULT_EQ_BANDS } from './types';
import Visualizer from './components/Visualizer';
import Knob from './components/Knob';
import Fader from './components/Fader';
import Transport from './components/Transport';
import EQPanel from './components/EQPanel';

const App: React.FC = () => {
  // State
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [analysis, setAnalysis] = useState<TrackAnalysis | null>(null);
  
  // Selection State
  const [selectedInstruments, setSelectedInstruments] = useState({
    drums: true, bass: true, vocals: true, guitars: true, piano: false, strings: false
  });

  // Studio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeTrackEQ, setActiveTrackEQ] = useState<string | null>(null); // ID of track showing EQ

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
      setState(AppState.SELECTION); // Go to selection step
    }
  };

  const startProcessing = async () => {
    if (!audioBlob) return;
    setState(AppState.PROCESSING);

    // 1. Generate Tracks based on Selection (Simulating Separation)
    const newTracks: TrackData[] = [];
    let idCounter = 1;

    // Helper to create track
    const addTrack = (name: string, type: TrackData['type'], range: [number, number]) => {
      newTracks.push({
        id: `t${idCounter++}`,
        name,
        type,
        volume: 0.8,
        pan: 0,
        muted: false,
        solo: false,
        frequencyRange: range,
        eqEnabled: true,
        eqBands: JSON.parse(JSON.stringify(DEFAULT_EQ_BANDS)) // Deep copy
      });
    };

    // Frequency Maps for Simulation
    if (selectedInstruments.bass) addTrack('Bass / Sub', 'bass', [0, 250]);
    if (selectedInstruments.drums) addTrack('Drums (Full)', 'drums', [20, 16000]); // Full range initially
    if (selectedInstruments.guitars) addTrack('Guitars / Mids', 'other', [250, 4000]);
    if (selectedInstruments.piano) addTrack('Piano / Keys', 'other', [200, 6000]);
    if (selectedInstruments.vocals) addTrack('Vocals / Lead', 'vocals', [400, 10000]);
    if (selectedInstruments.strings) addTrack('Orchestral', 'other', [300, 12000]);
    
    // Always add an "Air" track for clarity
    addTrack('Air / Ambience', 'other', [10000, 20000]);

    setTracks(newTracks);

    try {
      // 2. Load into Audio Engine
      await audioEngine.loadAudio(audioBlob, newTracks);
      setDuration(audioEngine.duration);

      // 3. AI Analysis
      analyzeAudioSession(audioBlob).then(setAnalysis).catch(console.error);

      setState(AppState.STUDIO);
    } catch (e) {
      console.error(e);
      handleError("Error al procesar el audio. El archivo puede estar corrupto.");
    }
  };

  // Drum Micro-Split Logic
  const decomposeDrums = async (drumTrackId: string) => {
    setIsPlaying(false);
    audioEngine.pause();

    const drumTrack = tracks.find(t => t.id === drumTrackId);
    if (!drumTrack) return;

    // Create new sub-tracks with specific isolation profiles
    const kickTrack: TrackData = {
      ...drumTrack, id: `${drumTrackId}_kick`, name: 'Kick (Split)', type: 'kick', frequencyRange: [0, 120], isDecomposed: true, eqBands: JSON.parse(JSON.stringify(DEFAULT_EQ_BANDS))
    };
    const snareTrack: TrackData = {
        ...drumTrack, id: `${drumTrackId}_snare`, name: 'Snare (Split)', type: 'snare', frequencyRange: [150, 4000], isDecomposed: true, eqBands: JSON.parse(JSON.stringify(DEFAULT_EQ_BANDS))
    };
    const cymbalsTrack: TrackData = {
        ...drumTrack, id: `${drumTrackId}_oh`, name: 'Overheads (Split)', type: 'cymbals', frequencyRange: [4000, 20000], isDecomposed: true, eqBands: JSON.parse(JSON.stringify(DEFAULT_EQ_BANDS))
    };

    // Replace original drums with splits
    const updatedTracks = tracks.filter(t => t.id !== drumTrackId);
    updatedTracks.splice(1, 0, kickTrack, snareTrack, cymbalsTrack); // Insert after Bass

    setTracks(updatedTracks);
    
    // Reload Engine
    setState(AppState.PROCESSING);
    await audioEngine.loadAudio(audioBlob!, updatedTracks);
    setState(AppState.STUDIO);
  };

  const updateTrack = (id: string, updates: Partial<TrackData>) => {
    setTracks(prev => {
      const newTracks = prev.map(t => t.id === id ? { ...t, ...updates } : t);
      const activeSolo = newTracks.some(t => t.solo);
      
      // Update Audio Engine immediately
      const track = newTracks.find(t => t.id === id);
      if (track) audioEngine.updateTrackParams(track, activeSolo);
      
      // If updating solo/mute, refresh all tracks to respect logic
      if ('solo' in updates || 'muted' in updates) {
          newTracks.forEach(t => audioEngine.updateTrackParams(t, activeSolo));
      }

      return newTracks;
    });
  };

  const updateEQBand = (trackId: string, bandId: number, updates: Partial<EQBand>) => {
      setTracks(prev => {
          const newTracks = prev.map(t => {
              if (t.id !== trackId) return t;
              const newBands = t.eqBands.map(b => b.id === bandId ? {...b, ...updates} : b);
              const updatedTrack = { ...t, eqBands: newBands };
              
              // Find active solo state from global tracks, not just this map
              const activeSolo = prev.some(tk => tk.solo); 
              audioEngine.updateTrackParams(updatedTrack, activeSolo);
              
              return updatedTrack;
          });
          return newTracks;
      });
  };

  const handleExport = () => {
    if (!audioBlob) return;
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AIWIS_Master_Split_${exportSettings.sampleRate}Hz.${exportSettings.format}`;
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
            <h1 className="text-xl font-bold tracking-widest text-white">AIWIS <span className="text-daw-accent font-light">DSP</span></h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em]">Armin Salazar San Martin</p>
          </div>
        </div>
        {state === AppState.STUDIO && (
          <div className="flex gap-4">
            <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-daw-surface hover:bg-daw-accent hover:text-black rounded transition">
              <Download className="h-4 w-4" /> EXPORTAR
            </button>
            <button onClick={async () => setReport(await generateSessionReport(analysis, tracks, exportSettings))} className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-daw-surface hover:text-white rounded transition text-gray-400">
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
              <h2 className="text-5xl font-black text-white tracking-tighter">DSP NEURAL <span className="text-daw-accent">ENGINE</span></h2>
              <p className="text-xl text-daw-muted max-w-2xl mx-auto">
                Separación de fuentes (Stem Separation) de alta fidelidad con descomposición de batería y EQ paramétrico.
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
              <span className="text-sm font-bold text-gray-300">CARGAR AUDIO (WAV/MP3)</span>
            </div>
          </div>
        )}

        {/* --- SELECTION STATE --- */}
        {state === AppState.SELECTION && (
            <div className="max-w-2xl mx-auto bg-daw-panel border border-daw-surface rounded-xl p-8 space-y-8 animate-fade-in-up">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">Configuración de Pre-Procesamiento</h2>
                    <p className="text-daw-muted">Selecciona los instrumentos que detectas en la grabación para optimizar el modelo de separación.</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    {Object.entries(selectedInstruments).map(([key, val]) => (
                        <label key={key} className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition ${val ? 'bg-daw-accent/10 border-daw-accent' : 'bg-daw-bg border-daw-surface'}`}>
                            <input 
                                type="checkbox" 
                                checked={val} 
                                onChange={() => setSelectedInstruments(prev => ({...prev, [key as keyof typeof selectedInstruments]: !val}))}
                                className="accent-daw-accent w-5 h-5"
                            />
                            <span className="font-mono text-sm uppercase font-bold text-gray-200">{key}</span>
                        </label>
                    ))}
                </div>

                <button 
                    onClick={startProcessing}
                    className="w-full py-4 bg-daw-accent text-black font-black text-lg rounded-lg hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition"
                >
                    INICIAR SEPARACIÓN DE STEMS
                </button>
            </div>
        )}

        {/* --- PROCESSING STATE --- */}
        {state === AppState.PROCESSING && (
          <div className="flex flex-col items-center justify-center h-[60vh] space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-daw-secondary blur-xl opacity-20 animate-pulse-slow"></div>
              <Zap className="h-16 w-16 text-daw-secondary animate-bounce relative z-10" />
            </div>
            <h2 className="text-2xl font-mono text-white">AISLANDO FUENTES...</h2>
            <div className="w-64 h-2 bg-daw-surface rounded-full overflow-hidden">
                <div className="h-full bg-daw-secondary animate-[width_2s_ease-in-out_infinite]" style={{width: '50%'}}></div>
            </div>
            <p className="text-daw-muted text-sm">Aplicando filtros de fase lineal y descomposición espectral.</p>
          </div>
        )}

        {/* --- STUDIO STATE --- */}
        {state === AppState.STUDIO && (
          <div className="space-y-6">
            
            {/* Visualizer & Transport Rack */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 bg-daw-panel border border-daw-surface rounded-lg p-1 relative shadow-2xl h-[280px]">
                 <Visualizer isPlaying={isPlaying} />
                 <div className="absolute top-4 right-4 bg-black/50 backdrop-blur px-3 py-1 rounded text-xs font-mono text-daw-success border border-daw-success/30">
                    DSP ACTIVE: 44.1kHz / 32-bit Float
                 </div>
              </div>
              
              <div className="flex flex-col gap-4">
                 {/* AI Info */}
                 <div className="flex-1 bg-daw-panel border border-daw-surface rounded-lg p-4 custom-scrollbar overflow-y-auto">
                    <h3 className="flex items-center gap-2 text-white font-bold text-sm mb-3"><Server className="h-4 w-4 text-daw-accent"/> ANÁLISIS ESPECTRAL</h3>
                    {analysis ? (
                        <div className="space-y-2 text-xs text-gray-400">
                            <p><span className="text-daw-muted">GENRE:</span> {analysis.genre}</p>
                            <p><span className="text-daw-muted">KEY/BPM:</span> {analysis.key} / {analysis.bpm}</p>
                            <p className="italic border-l-2 border-daw-secondary pl-2 mt-2">{analysis.ai_suggestions}</p>
                        </div>
                    ) : <span className="text-xs text-daw-muted animate-pulse">Analizando...</span>}
                 </div>
                 
                 {/* Transport */}
                 <div className="h-24">
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

            {/* EQ Overlay Area */}
            {activeTrackEQ && (
                <div className="h-64 animate-fade-in-up">
                    <EQPanel 
                        trackName={tracks.find(t => t.id === activeTrackEQ)?.name || 'Track'}
                        bands={tracks.find(t => t.id === activeTrackEQ)?.eqBands || []}
                        enabled={tracks.find(t => t.id === activeTrackEQ)?.eqEnabled || false}
                        onToggle={() => updateTrack(activeTrackEQ, { eqEnabled: !tracks.find(t => t.id === activeTrackEQ)?.eqEnabled })}
                        onUpdateBand={(bandId, updates) => updateEQBand(activeTrackEQ, bandId, updates)}
                    />
                </div>
            )}

            {/* Mixer Console */}
            <div className="bg-daw-panel border-t border-daw-surface p-6 shadow-2xl overflow-x-auto pb-12">
              <div className="flex items-center gap-2 mb-6">
                <Layers className="h-5 w-5 text-daw-muted" />
                <h3 className="font-bold text-white tracking-widest text-sm">CONSOLA DE MEZCLA</h3>
              </div>
              
              <div className="flex gap-2 min-w-max">
                {tracks.map(track => (
                  <div key={track.id} className={`w-[160px] bg-daw-bg border ${track.isDecomposed ? 'border-daw-secondary/50' : 'border-daw-surface'} rounded-lg p-3 flex flex-col items-center gap-4 relative group`}>
                    
                    {/* Header */}
                    <div className="w-full text-center space-y-1">
                       <input 
                         type="text" 
                         value={track.name} 
                         onChange={(e) => updateTrack(track.id, { name: e.target.value })}
                         className="w-full bg-transparent text-center text-xs font-bold text-gray-300 focus:text-white outline-none"
                       />
                       {track.isDecomposed && <span className="text-[9px] text-daw-secondary uppercase font-bold">Micro-Split</span>}
                    </div>

                    {/* Tools */}
                    <div className="flex justify-center gap-1 w-full">
                       <button onClick={() => updateTrack(track.id, { muted: !track.muted })} className={`flex-1 py-1 text-[10px] font-bold rounded ${track.muted ? 'bg-red-500 text-white' : 'bg-daw-surface text-gray-400'}`}>M</button>
                       <button onClick={() => updateTrack(track.id, { solo: !track.solo })} className={`flex-1 py-1 text-[10px] font-bold rounded ${track.solo ? 'bg-yellow-400 text-black' : 'bg-daw-surface text-gray-400'}`}>S</button>
                    </div>

                    {/* Special Drum Split Button */}
                    {track.type === 'drums' && !track.isDecomposed && (
                        <button 
                            onClick={() => decomposeDrums(track.id)}
                            className="w-full py-1 bg-daw-panel border border-daw-surface hover:border-daw-accent text-[10px] text-daw-accent flex items-center justify-center gap-1 rounded"
                            title="Descomponer Batería (Kick, Snare, OH)"
                        >
                            <Scissors className="h-3 w-3" /> SPLIT DRUMS
                        </button>
                    )}

                    {/* EQ Toggle */}
                    <button 
                        onClick={() => setActiveTrackEQ(activeTrackEQ === track.id ? null : track.id)}
                        className={`w-full py-1 text-[10px] font-bold border rounded flex items-center justify-center gap-1 ${activeTrackEQ === track.id ? 'bg-daw-accent text-black border-daw-accent' : 'bg-transparent text-gray-400 border-daw-surface hover:text-white'}`}
                    >
                        <Sliders className="h-3 w-3" /> EQ
                    </button>

                    {/* Controls */}
                    <Knob label="PAN" value={track.pan} min={-1} max={1} step={0.1} onChange={(v) => updateTrack(track.id, { pan: v })} />
                    <Fader value={track.volume} min={0} max={1.5} step={0.01} onChange={(v) => updateTrack(track.id, { volume: v })} height="h-40" />
                    
                    {/* Meter */}
                    <div className="w-full h-1 bg-gray-800 rounded overflow-hidden">
                        <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.min(track.volume * 80, 100)}%`, opacity: isPlaying ? 1 : 0.3 }}></div>
                    </div>
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
               <h3 className="text-xl font-bold text-white flex items-center gap-2"><Settings className="h-5 w-5"/> RENDERIZAR MIXDOWN</h3>
               <div className="space-y-4">
                 <div>
                   <label className="text-xs text-daw-muted block mb-1">FORMATO MASTER</label>
                   <div className="flex gap-2">
                     <button onClick={() => setExportSettings(s => ({...s, format: 'wav'}))} className={`flex-1 py-2 text-sm rounded ${exportSettings.format === 'wav' ? 'bg-daw-accent text-black font-bold' : 'bg-daw-surface'}`}>WAV (PCM)</button>
                     <button onClick={() => setExportSettings(s => ({...s, format: 'mp3'}))} className={`flex-1 py-2 text-sm rounded ${exportSettings.format === 'mp3' ? 'bg-daw-accent text-black font-bold' : 'bg-daw-surface'}`}>MP3</button>
                   </div>
                 </div>
                 {/* ... (rest of export settings same as before) ... */}
               </div>
               <div className="flex gap-4 pt-4">
                 <button onClick={() => setShowExportModal(false)} className="flex-1 py-3 text-sm text-gray-400 hover:text-white">Cancelar</button>
                 <button onClick={handleExport} className="flex-1 py-3 bg-daw-success text-black font-bold rounded hover:bg-green-400">EXPORTAR</button>
               </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
