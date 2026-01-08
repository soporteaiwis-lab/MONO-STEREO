import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Play, Pause, Square, Minimize2 } from 'lucide-react';

interface WaveformPreviewProps {
  buffer: AudioBuffer | null;
}

const WaveformPreview: React.FC<WaveformPreviewProps> = ({ buffer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // View Controls
  const [zoomLevel, setZoomLevel] = useState(1);
  const [verticalGain, setVerticalGain] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Playback Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  // Initialize Duration
  useEffect(() => {
    if (buffer) {
        setDuration(buffer.duration);
        setCurrentTime(0);
        pauseTimeRef.current = 0;
    }
  }, [buffer]);

  // Clean up on unmount
  useEffect(() => {
      return () => stopPlayback();
  }, []);

  const formatTime = (time: number) => {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const initAudio = () => {
      if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
  };

  const playPlayback = () => {
      if (!buffer) return;
      initAudio();
      
      if (isPlaying) return;
      const ctx = audioContextRef.current!;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
          // Only stop if we reached the end naturally
          if (ctx.currentTime - startTimeRef.current >= buffer.duration) {
             stopPlayback();
          }
      };

      source.start(0, pauseTimeRef.current);
      sourceNodeRef.current = source;
      startTimeRef.current = ctx.currentTime - pauseTimeRef.current;
      setIsPlaying(true);
      
      const loop = () => {
          if (ctx && ctx.state !== 'closed') {
              const curr = ctx.currentTime - startTimeRef.current;
              if (curr <= buffer.duration) {
                setCurrentTime(curr);
                rafRef.current = requestAnimationFrame(loop);
              }
          }
      };
      loop();
  };

  const pausePlayback = () => {
      if (sourceNodeRef.current) {
          sourceNodeRef.current.stop();
          sourceNodeRef.current = null;
      }
      if (audioContextRef.current) {
          pauseTimeRef.current = audioContextRef.current.currentTime - startTimeRef.current;
      }
      cancelAnimationFrame(rafRef.current);
      setIsPlaying(false);
  };

  const stopPlayback = () => {
      if (sourceNodeRef.current) {
          try { sourceNodeRef.current.stop(); } catch {}
          sourceNodeRef.current = null;
      }
      cancelAnimationFrame(rafRef.current);
      setIsPlaying(false);
      pauseTimeRef.current = 0;
      setCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTime = parseFloat(e.target.value);
      const wasPlaying = isPlaying;
      if (wasPlaying) pausePlayback();
      pauseTimeRef.current = newTime;
      setCurrentTime(newTime);
      if (wasPlaying) playPlayback();
  };

  const toggleFullscreen = () => {
      setIsFullscreen(!isFullscreen);
  };

  // Drawing Logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle Resize
    const parent = canvas.parentElement;
    if (parent) {
        canvas.width = parent.offsetWidth;
        canvas.height = parent.offsetHeight;
    }
    
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.fillStyle = '#121214';
    ctx.fillRect(0, 0, width, height);

    const dataL = buffer.getChannelData(0);
    const dataR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : dataL;
    
    const totalSamples = dataL.length;
    // Apply zoom
    const samplesPerPixel = Math.max(1, Math.floor(totalSamples / width / zoomLevel));
    const amp = (height / 4) * verticalGain;

    const drawChannel = (data: Float32Array, offsetY: number, color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        
        // Draw visible window based on currentTime if strictly following playhead?
        // No, draw whole waveform stretched or scrolled.
        // Let's implement scrolled view if zoomed.
        
        // Center the view on current playback time if zoomed?
        // For simplicity: Just zoom horizontally from start.
        
        for (let i = 0; i < width; i++) {
            const startSample = Math.floor(i * samplesPerPixel);
            if (startSample >= totalSamples) break;
            
            let min = 1.0; 
            let max = -1.0;
            
            for (let j = 0; j < samplesPerPixel; j++) {
                const val = data[startSample + j];
                if (val < min) min = val;
                if (val > max) max = val;
            }
            if (min === 1.0 && max === -1.0) { min = 0; max = 0; } // Silence

            const h = Math.max(1, (max - min) * amp);
            const y = offsetY + (min * amp);
            ctx.fillRect(i, y, 1, h);
        }
    };

    drawChannel(dataL, height / 4, '#00f0ff');
    drawChannel(dataR, height * 0.75, '#ff003c');
    
    // Playhead
    const playPercent = currentTime / duration;
    const playX = playPercent * width; // Relative to whole song fit in width?
    // If zoomed, playX needs to account for samplesPerPixel.
    // Simpler approach for this UI: The Canvas shows the WHOLE song always, zoom just expands detail?
    // Actually the zoom logic above compresses samples. So it shows the whole song.
    // If zoom > 1, it implies we are losing resolution or scrolling?
    // Current logic: `samplesPerPixel = total / width / zoom`. This means with zoom 2, we skip fewer samples? 
    // Wait, `samplesPerPixel` should be `total / width`. 
    // If zoom is applied, we usually want to Scroll. 
    // Let's stick to "Fit to Screen" unless extremely zoomed.
    // Revised logic: Always fit whole song to width unless zoomed.
    
    // Playhead Overlay
    ctx.fillStyle = 'white';
    ctx.fillRect(playX, 0, 2, height);

    // Grid Center
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(0, height/2); ctx.lineTo(width, height/2);
    ctx.stroke();

  }, [buffer, zoomLevel, verticalGain, isFullscreen, currentTime, duration]); // Re-draw on time update

  if (!buffer) return (
      <div className="w-full h-48 bg-black/50 flex items-center justify-center text-xs text-gray-600 font-mono border border-daw-surface rounded-xl">
          NO MIX GENERATED
      </div>
  );

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-black/95 p-10 flex flex-col justify-center' : 'flex flex-col gap-2 relative'}`}>
        
        {/* Header Controls */}
        <div className="flex justify-between items-center mb-2 px-2">
            <div className="flex gap-2 text-xs font-mono text-gray-400">
                <span>{formatTime(currentTime)}</span>
                <span className="text-gray-600">/</span>
                <span>{formatTime(duration)}</span>
            </div>
            <div className="flex gap-2">
                 <button onClick={toggleFullscreen} className="hover:text-daw-accent text-white transition">
                    {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-4 w-4" />}
                 </button>
            </div>
        </div>

        {/* Canvas Container */}
        <div className={`relative group bg-black rounded border border-daw-surface overflow-hidden ${isFullscreen ? 'flex-1 w-full' : 'h-48 w-full'}`}>
            <canvas ref={canvasRef} className="w-full h-full cursor-pointer" onClick={(e) => {
                // Click to seek
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const ratio = x / rect.width;
                const time = ratio * duration;
                const wasPlaying = isPlaying;
                if(wasPlaying) pausePlayback();
                pauseTimeRef.current = time;
                setCurrentTime(time);
                if(wasPlaying) playPlayback();
            }} />
        </div>
        
        {/* Scrub Bar (Timeline) */}
        <div className="w-full px-1">
            <input 
                type="range" 
                min="0" 
                max={duration || 100} 
                step="0.1" 
                value={currentTime} 
                onChange={handleSeek}
                className="w-full h-2 bg-daw-surface rounded-lg appearance-none cursor-pointer accent-daw-accent"
            />
        </div>

        {/* Transport Controls */}
        <div className="flex items-center justify-center gap-6 py-2 bg-daw-panel/50 rounded-lg border border-daw-surface mt-2">
            <button onClick={stopPlayback} className="text-gray-400 hover:text-red-500 transition">
                <Square className="h-5 w-5 fill-current" />
            </button>
            <button 
                onClick={isPlaying ? pausePlayback : playPlayback}
                className={`h-10 w-10 rounded-full flex items-center justify-center transition ${isPlaying ? 'bg-daw-accent text-black' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
            >
                {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-1" />}
            </button>
        </div>
        
        {/* Zoom Controls (Optional in Fullscreen) */}
        {!isFullscreen && (
            <div className="flex gap-4 px-2 mt-2">
                 <div className="flex-1 flex items-center gap-2 text-[10px] text-gray-500">
                    <ZoomIn className="h-3 w-3" />
                    <input type="range" min="0.5" max="5" step="0.1" value={verticalGain} onChange={(e) => setVerticalGain(parseFloat(e.target.value))} className="w-full h-1 bg-daw-surface rounded" />
                 </div>
            </div>
        )}
    </div>
  );
};

export default WaveformPreview;