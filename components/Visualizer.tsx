import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../services/audioEngine';

interface VisualizerProps {
  isPlaying: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // Get Time Domain Data (Waveform) 
      // Values are between 0 and 255. 128 is silence (center).
      const { left, right } = audioEngine.getAnalysisData();
      const bufferLength = left.length; 

      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = '#272730';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height/2);
      ctx.lineTo(width, height/2);
      ctx.stroke();

      if (bufferLength === 0) return;

      const sliceWidth = width / bufferLength;

      // Draw LEFT Channel (Cyan)
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00f0ff';
      ctx.beginPath();
      
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = left[i] / 128.0; 
        const y = (v * height / 2) - (height/4); // Shift to top half? No, let's overlap or center.
        // Let's center Left around 25% height? No, standard oscilloscope overlays usually.
        // Let's create an offset for visibility. Left slightly up, Right slightly down.
        
        const y_pos = (v * height) / 2; // Scales to full height but mapped to 0-255

        if (i === 0) ctx.moveTo(x, y_pos);
        else ctx.lineTo(x, y_pos);
        x += sliceWidth;
      }
      ctx.stroke();

      // Draw RIGHT Channel (Red)
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ff003c';
      ctx.beginPath();
      
      x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = right[i] / 128.0; 
        const y_pos = (v * height) / 2; // Same scaling
        // If exact same, they overlap purple. That's actually correct for "Mono".
        // Separation will show as colors diverging.
        
        if (i === 0) ctx.moveTo(x, y_pos);
        else ctx.lineTo(x, y_pos);
        x += sliceWidth;
      }
      ctx.stroke();

      if (isPlaying) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying]);

  return (
    <div className="w-full h-full bg-black rounded-lg overflow-hidden relative border border-daw-surface">
        <div className="absolute top-2 left-2 text-[10px] font-mono text-gray-500 z-10 pointer-events-none">REAL-TIME OSCILLOSCOPE</div>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default Visualizer;