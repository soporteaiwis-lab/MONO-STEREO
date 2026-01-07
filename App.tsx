import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic, Upload, Activity, Zap, Layers, Music, Server } from 'lucide-react';
import { audioEngine } from './services/audioEngine';
import { analyzeAudioContent } from './services/geminiService';
import { AppState, TrackAnalysis } from './types';
import Visualizer from './components/Visualizer';
import Knob from './components/Knob';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [analysis, setAnalysis] = useState<TrackAnalysis | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Mixer State
  const [bassPan, setBassPan] = useState(0);
  const [midPan, setMidPan] = useState(-0.3); // Default slight spread
  const [highPan, setHighPan] = useState(0.3);
  
  const [bassVol, setBassVol] = useState(1);
  const [midVol, setMidVol] = useState(1);
  const [highVol, setHighVol] = useState(1);

  // Update Audio Engine when mixer changes
  useEffect(() => {
    if (state === AppState.PLAYING || state === AppState.IDLE) {
      audioEngine.setMix('bass', bassPan, bassVol);
      audioEngine.setMix('mids', midPan, midVol);
      audioEngine.setMix('highs', highPan, highVol);
    }
  }, [bassPan, midPan, highPan, bassVol, midVol, highVol, state]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleNewAudio(file);
    }
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
      // Record for 5 seconds for demo purposes or add stop button logic
      // For simplicity in this demo, we auto-stop after 5s
      setTimeout(() => mediaRecorder.stop(), 5000);

    } catch (err) {
      console.error("Error accessing mic:", err);
      setState(AppState.IDLE);
    }
  };

  const handleNewAudio = async (blob: Blob) => {
    setAudioBlob(blob);
    setState(AppState.ANALYZING);
    
    // 1. Load into Audio Engine
    await audioEngine.loadAudio(blob);

    // 2. Analyze with Gemini
    try {
      const result = await analyzeAudioContent(blob);
      setAnalysis(result);
      
      // Auto-apply AI suggestions
      if (result.suggestedMix) {
        setBassPan(result.suggestedMix.bass);
        setMidPan(result.suggestedMix.mids);
        setHighPan(result.suggestedMix.highs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setState(AppState.IDLE);
    }
  };

  const togglePlayback = () => {
    if (state === AppState.PLAYING) {
      audioEngine.pause();
      setState(AppState.IDLE);
    } else if (audioBlob) {
      audioEngine.play();
      setState(AppState.PLAYING);
    }
  };

  return (
    <div className="min-h-screen bg-cyber-900 text-gray-200 font-sans selection:bg-cyber-accent selection:text-black pb-20">
      
      {/* Navbar */}
      <nav className="border-b border-cyber-700 bg-cyber-800/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Activity className="h-8 w-8 text-cyber-accent" />
              <span className="text-xl font-bold tracking-tighter text-white">StereoGen<span className="text-cyber-accent">AI</span></span>
            </div>
            <div className="hidden md:flex space-x-8 text-sm font-medium text-gray-400">
              <a href="https://www.nicolasvenegas.cl" target="_blank" rel="noreferrer" className="hover:text-cyber-accent transition">WWW.SIMPLEDATA.CL</a>
              <a href="https://www.aiwis.cl" target="_blank" rel="noreferrer" className="hover:text-cyber-accent transition">WWW.AIWIS.CL</a>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        
        {/* Header Section */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-500">
            DE MONO A STEREO | Inspirada en la idea de Nicolas "Condor" Vengeas
          </h1>
          <p className="text-lg text-cyber-400 max-w-2xl mx-auto">
            Transforma grabaciones de ensayo o pistas antiguas en mezclas inmersivas. 
            Nuestra IA separa las frecuencias y posiciona los instrumentos en el campo estéreo.
          </p>
        </div>

        {/* Action Area */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Upload Card */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="group relative h-48 rounded-2xl border-2 border-dashed border-cyber-600 hover:border-cyber-accent hover:bg-cyber-800/50 transition-all cursor-pointer flex flex-col items-center justify-center gap-4"
          >
            <input 
              type="file" 
              accept="audio/*" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileUpload} 
            />
            <div className="p-4 bg-cyber-700 rounded-full group-hover:scale-110 transition-transform">
              <Upload className="h-8 w-8 text-cyber-accent" />
            </div>
            <span className="font-semibold text-gray-300">Cargar Archivo de Audio (Mono)</span>
          </div>

          {/* Record Card */}
          <div 
            onClick={state === AppState.RECORDING ? undefined : handleMicRecord}
            className={`group relative h-48 rounded-2xl border-2 border-cyber-600 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 ${state === AppState.RECORDING ? 'bg-cyber-danger/10 border-cyber-danger animate-pulse' : 'hover:border-cyber-danger hover:bg-cyber-800/50'}`}
          >
            <div className={`p-4 rounded-full transition-transform ${state === AppState.RECORDING ? 'bg-cyber-danger' : 'bg-cyber-700 group-hover:scale-110'}`}>
              <Mic className={`h-8 w-8 ${state === AppState.RECORDING ? 'text-white' : 'text-cyber-danger'}`} />
            </div>
            <span className="font-semibold text-gray-300">
              {state === AppState.RECORDING ? 'Grabando... (5s demo)' : 'Grabar Ensayo (Celular)'}
            </span>
          </div>
        </div>

        {/* Loading State */}
        {state === AppState.ANALYZING && (
          <div className="w-full py-12 flex flex-col items-center justify-center space-y-4">
            <Zap className="h-12 w-12 text-yellow-400 animate-bounce" />
            <h3 className="text-xl font-mono text-yellow-400">ANALIZANDO INSTRUMENTOS CON IA...</h3>
            <p className="text-gray-500">Gemini está escuchando tu pista para separar los stems.</p>
          </div>
        )}

        {/* Studio Interface */}
        {audioBlob && state !== AppState.ANALYZING && (
          <div className="space-y-6 animate-fade-in-up">
            
            {/* AI Analysis Result */}
            {analysis && (
              <div className="bg-gradient-to-r from-cyber-800 to-cyber-900 border border-cyber-600 rounded-xl p-6 shadow-2xl">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-indigo-500/20 rounded-lg">
                    <Server className="h-6 w-6 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Análisis de Producción IA</h3>
                    <p className="text-cyber-400 text-sm mb-2">{analysis.feedback}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="px-3 py-1 rounded-full bg-cyber-700 text-xs font-mono border border-cyber-500 text-cyber-accent">
                        GÉNERO: {analysis.genre.toUpperCase()}
                      </span>
                      {analysis.instruments.map((inst, i) => (
                        <span key={i} className="px-3 py-1 rounded-full bg-cyber-700 text-xs font-mono border border-cyber-600 text-gray-300">
                          {inst}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Visualizer & Transport */}
              <div className="lg:col-span-2 space-y-6">
                <Visualizer isPlaying={state === AppState.PLAYING} />
                
                <div className="bg-cyber-800 rounded-xl p-6 border border-cyber-700 flex items-center justify-center gap-6">
                  <button 
                    onClick={togglePlayback}
                    className="h-16 w-16 rounded-full bg-cyber-accent text-black flex items-center justify-center hover:bg-white hover:scale-105 transition-all shadow-[0_0_20px_rgba(0,240,255,0.4)]"
                  >
                    {state === AppState.PLAYING ? <Pause className="h-8 w-8 fill-current" /> : <Play className="h-8 w-8 fill-current translate-x-1" />}
                  </button>
                  <div className="text-left">
                    <div className="text-sm text-gray-400 font-mono">ESTADO</div>
                    <div className="text-xl font-bold text-white">{state === AppState.PLAYING ? 'REPRODUCIENDO STEREO' : 'PAUSADO'}</div>
                  </div>
                </div>
              </div>

              {/* Mixer Console */}
              <div className="bg-cyber-800 rounded-xl border border-cyber-700 p-6 flex flex-col gap-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="h-5 w-5 text-cyber-accent" />
                  <h3 className="font-bold text-white">CONSOLA DE MEZCLA</h3>
                </div>

                {/* Stems Mockup (Frequency Separation) */}
                <div className="space-y-6">
                  {/* Bass Stem */}
                  <div className="bg-cyber-900/50 p-4 rounded-lg border border-cyber-700">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-bold text-indigo-400 flex items-center gap-2"><Music className="h-4 w-4"/> BAJO / KICK</span>
                      <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded">LOW FREQ</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Knob label="VOL" min={0} max={2} step={0.1} value={bassVol} onChange={setBassVol} />
                      <Knob label="PAN" min={-1} max={1} step={0.1} value={bassPan} onChange={setBassPan} />
                    </div>
                  </div>

                  {/* Mids Stem */}
                  <div className="bg-cyber-900/50 p-4 rounded-lg border border-cyber-700">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-bold text-green-400 flex items-center gap-2"><Music className="h-4 w-4"/> GUITAR / VOX</span>
                      <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded">MID FREQ</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Knob label="VOL" min={0} max={2} step={0.1} value={midVol} onChange={setMidVol} />
                      <Knob label="PAN" min={-1} max={1} step={0.1} value={midPan} onChange={setMidPan} />
                    </div>
                  </div>

                  {/* Highs Stem */}
                  <div className="bg-cyber-900/50 p-4 rounded-lg border border-cyber-700">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-bold text-pink-400 flex items-center gap-2"><Music className="h-4 w-4"/> HI-HATS / AIR</span>
                      <span className="text-xs bg-pink-900 text-pink-300 px-2 py-0.5 rounded">HIGH FREQ</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Knob label="VOL" min={0} max={2} step={0.1} value={highVol} onChange={setHighVol} />
                      <Knob label="PAN" min={-1} max={1} step={0.1} value={highPan} onChange={setHighPan} />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        <footer className="pt-12 text-center text-gray-600 text-sm">
           <p>© 2024 StereoGen AI. Powered by Google Gemini.</p>
           <p>Enlaces oficiales: <a href="https://www.simpledata.cl" className="underline hover:text-white">SimpleData</a> | <a href="https://www.aiwis.cl" className="underline hover:text-white">AIWIS</a></p>
        </footer>

      </main>
    </div>
  );
};

export default App;
