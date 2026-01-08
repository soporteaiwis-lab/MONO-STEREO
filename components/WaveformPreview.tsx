import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface WaveformPreviewProps {
  buffer: AudioBuffer | null;
}

const WaveformPreview: React.FC<WaveformPreviewProps> = ({ buffer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1); // Horizontal Zoom
  const [verticalGain, setVerticalGain] = useState(1); // Vertical Zoom/Gain

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    
    ctx.fillStyle = '#1e1e24';
    ctx.fillRect(0, 0, width, height);

    // Draw Left Channel (Top Half)
    const dataL = buffer.getChannelData(0);
    const dataR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : dataL;
    
    // Calculate total visible samples based on Zoom
    const totalSamples = dataL.length;
    const visibleSamples = Math.floor(totalSamples / zoomLevel);
    const step = Math.ceil(visibleSamples / width);
    const amp = (height / 4) * verticalGain; // Apply vertical gain

    // Helper draw function to avoid saturation
    const drawChannel = (data: Float32Array, offsetY: number, color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;
            const startIndex = i * step;
            
            // Optimization: Don't loop if out of bounds
            if (startIndex >= totalSamples) break;

            for (let j = 0; j < step; j++) {
                const idx = startIndex + j;
                if (idx < totalSamples) {
                    const datum = data[idx];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
            }
            
            // Fix infinite/bad values
            if (min === 1.0 && max === -1.0) { min = 0; max = 0; }

            const h = Math.max(1, (max - min) * amp);
            const y = offsetY + (min * amp); // Centered relative to offset
            
            // Draw rect (more performant than stroke for dense waveforms)
            ctx.fillRect(i, y, 1, h);
        }
    };

    drawChannel(dataL, height / 4, '#00f0ff');
    drawChannel(dataR, height * 0.75, '#ff003c');
    
    // Grid Lines
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(0, height/4); ctx.lineTo(width, height/4); // L Center
    ctx.moveTo(0, height*0.75); ctx.lineTo(width, height*0.75); // R Center
    ctx.moveTo(0, height/2); ctx.lineTo(width, height/2); // Mid Divider
    ctx.stroke();

    // Labels
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`L (x${zoomLevel.toFixed(1)})`, 5, 15);
    ctx.fillText(`R (Gain ${verticalGain.toFixed(1)})`, 5, height/2 + 15);

  }, [buffer, zoomLevel, verticalGain]);

  if (!buffer) return (
      <div className="w-full h-full bg-black/50 flex items-center justify-center text-xs text-gray-600 font-mono">
          NO PREVIEW GENERATED
      </div>
  );

  return (
    <div className="flex flex-col gap-2">
        <div className="relative group">
            <canvas ref={canvasRef} className="w-full h-48 rounded bg-black cursor-crosshair shadow-inner border border-daw-surface" />
            
            {/* Overlay Controls */}
            <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 p-1 rounded">
                <button onClick={() => setZoomLevel(prev => Math.min(prev * 1.5, 50))} className="p-1 hover:text-daw-accent text-white"><ZoomIn className="h-4 w-4"/></button>
                <button onClick={() => setZoomLevel(prev => Math.max(prev / 1.5, 1))} className="p-1 hover:text-daw-accent text-white"><ZoomOut className="h-4 w-4"/></button>
                <button onClick={() => { setZoomLevel(1); setVerticalGain(1); }} className="p-1 hover:text-daw-accent text-white"><Maximize2 className="h-4 w-4"/></button>
            </div>
        </div>
        
        {/* Sliders */}
        <div className="flex gap-4 px-2">
            <div className="flex-1 flex items-center gap-2">
                <span className="text-[10px] text-gray-500 uppercase">H-Zoom</span>
                <input 
                    type="range" min="1" max="50" step="0.1" 
                    value={zoomLevel} onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                    className="w-full h-1 bg-daw-surface rounded appearance-none cursor-pointer"
                />
            </div>
            <div className="flex-1 flex items-center gap-2">
                <span className="text-[10px] text-gray-500 uppercase">V-Gain</span>
                <input 
                    type="range" min="0.5" max="5" step="0.1" 
                    value={verticalGain} onChange={(e) => setVerticalGain(parseFloat(e.target.value))}
                    className="w-full h-1 bg-daw-surface rounded appearance-none cursor-pointer"
                />
            </div>
        </div>
    </div>
  );
};

export default WaveformPreview;