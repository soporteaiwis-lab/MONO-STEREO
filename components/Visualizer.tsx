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
      const dataArray = audioEngine.getAnalysisData();
      const bufferLength = dataArray.length;

      // Ensure canvas size matches display size
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * height;

        // Gradient based on frequency
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, '#6366f1'); // Indigo
        gradient.addColorStop(0.5, '#00f0ff'); // Cyan
        gradient.addColorStop(1, '#ff003c'); // Red

        ctx.fillStyle = gradient;
        
        // Reflection effect
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        
        // Mirror effect for stereo look
        ctx.globalAlpha = 0.2;
        ctx.fillRect(x, height, barWidth, barHeight * 0.5); 
        ctx.globalAlpha = 1.0;

        x += barWidth + 1;
      }

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
    <div className="w-full h-48 bg-cyber-800 rounded-lg overflow-hidden border border-cyber-600 shadow-inner relative">
      <div className="absolute top-2 left-2 text-xs text-cyber-400 font-mono z-10">ANALIZADOR DE ESPECTRO</div>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default Visualizer;
