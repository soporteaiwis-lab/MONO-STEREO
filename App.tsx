import React, { useState, useRef, useEffect } from 'react';
import { Mic, Upload, Activity, Zap, Layers, Music, Server, Settings, FileAudio, Download, FileText, Edit2 } from 'lucide-react';
import { audioEngine } from './services/audioEngine';
import { analyzeAudioSession, generateSessionReport } from './services/geminiService';
import { AppState, TrackAnalysis, TrackData, ExportSettings } from './types';
import Visualizer from './components/Visualizer';
import Knob from './components/Knob';
import Fader from './components/Fader';
import Transport from './components/Transport';

const DEFAULT_TRACKS: TrackData[] = [
  { id: 't1', name: 'Kick / Bass', type: 'bass', volume: 0.8, pan: 0, muted: false, solo: false, frequencyRange: [0, 250] },
  { id: 't2', name: 'Body / Guitar', type: 'other', volume: 0.8, pan: -0.3, muted: false, solo: false, frequencyRange: [250, 2000] },
  { id: 't3', name: 'Vocals / Lead', type: 'vocals', volume: 0.9, pan: 0, muted: false, solo: false, frequencyRange: [2000, 6000] },
  { id: 't4', name: 'Air / Cymbal', type: 'drums', volume: 0.7, pan: 0.3, muted: false, solo: false, frequencyRange: [6000, 20000] },
];

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [tracks, setTracks] = useState<TrackData[]>(DEFAULT_TRACKS);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [analysis, setAnalysis] = useState<TrackAnalysis | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: 'wav', sampleRate: 44100, bitDepth: 24, bitRate: 192, standardPitch: true
  });
  const [report, setReport] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<number>(0);

  // Time Loop
  useEffect(() => {
    let animationFrame: number;
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

  // Handle Track Updates
  const updateTrack = (id: string, updates: Partial<TrackData>) => {
    setTracks(prev => {
      const newTracks = prev.map(t => t.id === id ? { ...t, ...updates } : t);
      
      // Check Solo logic
      const activeSolo = newTracks.some(t => t.solo);
      
      newTracks.forEach(t => {
        audioEngine.updateTrack(t, activeSolo);
      });
      return newTracks;
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleNewAudio(file);
  };

  const handleMicRecord = async () => {
    try {
      setState(AppState.RECORDING);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        handleNewAudio(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setTimeout(() => mediaRecorder.stop(), 5000); // 5s demo
    } catch (err) {
      console.error(err);
      setState(AppState.IDLE);
    }
  };

  const handleNewAudio = async (blob: Blob) => {
    setAudioBlob(blob);
    setState(AppState.ANALYZING);
    await audioEngine.loadAudio(blob, tracks);
    setDuration(audioEngine.duration);
    
    // AI Analysis
    analyzeAudioSession(blob).then(setAnalysis).catch(console.error);
    setState(AppState.STUDIO);
  };

  const handleExport = () => {
    // Simulation of download
    if (!audioBlob) return;
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AIWIS_Session_Mixdown_${exportSettings.sampleRate}hz.${exportSettings.format}`;
    a.click();
    setShowExportModal(false);
  };

  const handleReport = async () => {
    const reportText = await generateSessionReport(analysis, tracks, exportSettings);
    setReport(reportText);
  };

  return (
    <div className="min-h-screen bg-daw-bg text-daw-text font-sans selection:bg-daw-accent selection:text-black pb-20">
      
      {/* Top Bar */}
      <nav className="border-b border-daw-surface bg-daw-panel/90 backdrop-blur-md sticky top-0 z-50 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-daw-accent" />
          <div className="leading-tight">
            <h1 className="text-xl font-bold tracking-widest text-white">AIWIS <span className="text-daw-accent font-light">STUDIO</span></h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em]">Armin Salazar San Martin</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-daw-surface hover:bg-daw-accent hover:text-black rounded transition">
            <Download className="h-4 w-4" /> EXPORTAR MIX
          </button>
          <button onClick={handleReport} className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-daw-surface hover:text-white rounded transition text-gray-400">
            <FileText className="h-4 w-4" /> INFORME
          </button>
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto p-6 space-y-8">
        
        {/* State: Idle / Landing */}
        {state === AppState.IDLE && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-12 animate-fade-in-up">
            <div className="text-center space-y-4">
              <h2 className="text-5xl font-black text-white tracking-tighter">GRABACIÓN Y MASTERIZACIÓN <span className="text-daw-accent">IA</span></h2>
              <p className="text-xl text-daw-muted max-w-2xl mx-auto">
                Transforma audio mono en multitrack stereo. Tecnología visionaria de Armin Salazar San Martin.
              </p>
            </div>
            
            <div className="flex gap-8">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-64 h-40 bg-daw-panel border border-daw-surface hover:border-daw-accent rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer transition group"
              >
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="audio/*" />
                <Upload className="h-10 w-10 text-gray-400 group-hover:text-daw-accent transition" />
                <span className="text-sm font-bold text-gray-300">CARGAR PISTA</span>
              </div>
              
              <div 
                onClick={handleMicRecord}
                className="w-64 h-40 bg-daw-panel border border-daw-surface hover:border-daw-secondary rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer transition group"
              >
                <Mic className="h-10 w-10 text-gray-400 group-hover:text-daw-secondary transition" />
                <span className="text-sm font-bold text-gray-300">GRABAR (DEMO)</span>
              </div>
            </div>
          </div>
        )}

        {/* State: Analyzing */}
        {state === AppState.ANALYZING && (
          <div className="flex flex-col items-center justify-center h-[60vh] space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-daw-accent blur-xl opacity-20 animate-pulse-slow"></div>
              <Zap className="h-16 w-16 text-daw-accent animate-bounce relative z-10" />
            </div>
            <h2 className="text-2xl font-mono text-white">PROCESANDO STEMS...</h2>
            <p className="text-daw-muted">El motor Gemini está separando frecuencias.</p>
          </div>
        )}

        {/* State: Studio */}
        {state === AppState.STUDIO && (
          <div className="space-y-6">
            
            {/* Top Rack: Analysis & Visuals */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[300px]">
              {/* Visualizer */}
              <div className="xl:col-span-2 bg-daw-panel border border-daw-surface rounded-lg p-1 relative overflow-hidden shadow-2xl">
                <Visualizer isPlaying={isPlaying} />
                <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
                   <div className="text-xs font-mono text-daw-accent">
                     {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(0).padStart(2,'0')} / 
                     {Math.floor(duration / 60)}:{(duration % 60).toFixed(0).padStart(2,'0')}
                   </div>
                   <div className="text-xs font-mono text-daw-muted">44.1kHz • 24bit • STEREO</div>
                </div>
              </div>

              {/* AI Insight Panel */}
              <div className="bg-daw-panel border border-daw-surface rounded-lg p-6 overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-2 mb-4">
                   <Server className="h-5 w-5 text-purple-400" />
                   <h3 className="font-bold text-white">ANÁLISIS IA</h3>
                </div>
                {analysis ? (
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                       <div className="bg-daw-bg p-2 rounded border border-daw-surface">
                         <div className="text-xs text-daw-muted">GÉNERO</div>
                         <div className="font-bold text-daw-accent">{analysis.genre}</div>
                       </div>
                       <div className="bg-daw-bg p-2 rounded border border-daw-surface">
                         <div className="text-xs text-daw-muted">KEY / BPM</div>
                         <div className="font-bold text-white">{analysis.key} / {analysis.bpm}</div>
                       </div>
                    </div>
                    <div>
                      <div className="text-xs text-daw-muted mb-1">SUGERENCIA TÉCNICA</div>
                      <p className="text-gray-300 italic">"{analysis.technical_summary}"</p>
                    </div>
                  </div>
                ) : <div className="text-daw-muted animate-pulse">Analizando datos espectrales...</div>}
              </div>
            </div>

            {/* Middle Rack: Transport */}
            <div className="flex justify-center">
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

            {/* Bottom Rack: Mixer Console */}
            <div className="bg-daw-panel border border-daw-surface rounded-xl p-6 shadow-2xl overflow-x-auto">
              <div className="flex items-center gap-2 mb-6">
                <Layers className="h-5 w-5 text-daw-muted" />
                <h3 className="font-bold text-white tracking-widest text-sm">CONSOLA MULTITRACK</h3>
              </div>
              
              <div className="flex gap-4 min-w-[800px]">
                {tracks.map(track => (
                  <div key={track.id} className="flex-1 bg-daw-bg border border-daw-surface rounded p-3 flex flex-col items-center gap-4 min-w-[140px]">
                    {/* Header / Rename */}
                    <div className="w-full">
                       <input 
                         type="text" 
                         value={track.name} 
                         onChange={(e) => updateTrack(track.id, { name: e.target.value })}
                         className="w-full bg-transparent text-center text-xs font-bold text-gray-300 focus:text-white outline-none border-b border-transparent focus:border-daw-accent"
                       />
                       <div className="flex justify-center gap-2 mt-2">
                         <button 
                           onClick={() => updateTrack(track.id, { muted: !track.muted })}
                           className={`w-6 h-6 text-[10px] font-bold rounded ${track.muted ? 'bg-daw-secondary text-white' : 'bg-daw-surface text-gray-400'}`}
                         >M</button>
                         <button 
                           onClick={() => updateTrack(track.id, { solo: !track.solo })}
                           className={`w-6 h-6 text-[10px] font-bold rounded ${track.solo ? 'bg-yellow-400 text-black' : 'bg-daw-surface text-gray-400'}`}
                         >S</button>
                       </div>
                    </div>

                    {/* Pan Knob */}
                    <Knob label="PAN" value={track.pan} min={-1} max={1} step={0.1} onChange={(v) => updateTrack(track.id, { pan: v })} />
                    
                    {/* Vol Fader */}
                    <Fader value={track.volume} min={0} max={1.5} step={0.05} onChange={(v) => updateTrack(track.id, { volume: v })} />
                    
                    {/* Meter (Simulated) */}
                    <div className="w-full text-center text-xs font-mono text-daw-muted">
                      {(track.volume * 100).toFixed(0)}%
                    </div>
                  </div>
                ))}

                {/* Master Strip */}
                <div className="w-[140px] bg-black/40 border-l border-daw-surface pl-4 flex flex-col items-center justify-end pb-6">
                    <span className="text-xs font-bold text-daw-secondary mb-4">MASTER</span>
                    <div className="w-4 h-48 bg-gray-800 rounded-full overflow-hidden relative">
                         {/* Fake Master Meter Animation */}
                         <div className={`absolute bottom-0 w-full bg-gradient-to-t from-green-500 via-yellow-400 to-red-500 transition-all duration-75 ${isPlaying ? 'h-[80%]' : 'h-[0%]'}`} style={{ opacity: isPlaying ? Math.random() : 0 }}></div>
                    </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Modals */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-daw-panel border border-daw-surface p-8 rounded-xl max-w-md w-full space-y-6">
               <h3 className="text-xl font-bold text-white flex items-center gap-2"><Settings className="h-5 w-5"/> Configuración de Exportación</h3>
               
               <div className="space-y-4">
                 <div>
                   <label className="text-xs text-daw-muted block mb-1">FORMATO</label>
                   <div className="flex gap-2">
                     <button onClick={() => setExportSettings(s => ({...s, format: 'wav'}))} className={`flex-1 py-2 text-sm rounded ${exportSettings.format === 'wav' ? 'bg-daw-accent text-black font-bold' : 'bg-daw-surface'}`}>WAV (PCM)</button>
                     <button onClick={() => setExportSettings(s => ({...s, format: 'mp3'}))} className={`flex-1 py-2 text-sm rounded ${exportSettings.format === 'mp3' ? 'bg-daw-accent text-black font-bold' : 'bg-daw-surface'}`}>MP3</button>
                   </div>
                 </div>

                 <div>
                   <label className="text-xs text-daw-muted block mb-1">FRECUENCIA DE MUESTREO (HZ)</label>
                   <select 
                      value={exportSettings.sampleRate}
                      onChange={(e) => setExportSettings(s => ({...s, sampleRate: Number(e.target.value) as any}))}
                      className="w-full bg-daw-bg border border-daw-surface rounded p-2 text-sm"
                   >
                     <option value={44100}>44.1 kHz (CD Standard)</option>
                     <option value={48000}>48 kHz (Video Standard)</option>
                     <option value={96000}>96 kHz (High Res)</option>
                     <option value={192000}>192 kHz (Ultra Res)</option>
                   </select>
                 </div>

                 <div>
                   <label className="text-xs text-daw-muted block mb-1">PROFUNDIDAD DE BITS</label>
                   <div className="flex gap-2">
                     {[16, 24, 32].map(bit => (
                       <button 
                         key={bit} 
                         onClick={() => setExportSettings(s => ({...s, bitDepth: bit as any}))}
                         className={`flex-1 py-1 text-xs rounded ${exportSettings.bitDepth === bit ? 'bg-daw-surface border border-daw-accent' : 'bg-daw-bg border border-transparent'}`}
                       >
                         {bit}-bit
                       </button>
                     ))}
                   </div>
                 </div>

                 <div className="flex items-center gap-2">
                   <input 
                      type="checkbox" 
                      checked={exportSettings.standardPitch}
                      onChange={(e) => setExportSettings(s => ({...s, standardPitch: e.target.checked}))}
                      className="accent-daw-accent"
                   />
                   <span className="text-sm text-gray-300">Forzar afinación estándar 440Hz</span>
                 </div>
               </div>

               <div className="flex gap-4 pt-4">
                 <button onClick={() => setShowExportModal(false)} className="flex-1 py-3 text-sm text-gray-400 hover:text-white">Cancelar</button>
                 <button onClick={handleExport} className="flex-1 py-3 bg-daw-success text-black font-bold rounded hover:bg-green-400">RENDERIZAR</button>
               </div>
            </div>
          </div>
        )}

        {report && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
             <div className="bg-white text-black p-8 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-2xl font-bold">Informe de Sesión AIWIS</h2>
                 <button onClick={() => setReport(null)} className="text-gray-500 hover:text-black">Cerrar</button>
               </div>
               <pre className="font-mono text-sm whitespace-pre-wrap bg-gray-100 p-4 rounded">{report}</pre>
               <div className="mt-6 flex justify-end">
                 <button className="px-4 py-2 bg-black text-white rounded text-sm hover:bg-gray-800" onClick={() => window.print()}>Imprimir PDF</button>
               </div>
             </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;