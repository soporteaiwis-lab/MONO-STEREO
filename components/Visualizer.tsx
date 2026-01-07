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
      const { left, right } = audioEngine.getAnalysisData();
      const bufferLength = left.length; // Same for right

      // Ensure canvas size matches display size
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const width = canvas.width;
      const height = canvas.height;
      
      // Split visualizer area: Top half = Left, Bottom half = Right
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // --- Draw Background Lines ---
      ctx.strokeStyle = '#1e1e24';
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeightL = (left[i] / 255) * (height / 2);
        const barHeightR = (right[i] / 255) * (height / 2);

        // --- LEFT CHANNEL (Top, going up) ---
        // Cool Blue/Cyan gradient
        ctx.fillStyle = `rgba(0, 240, 255, ${left[i]/255})`;
        ctx.fillRect(x, centerY - barHeightL, barWidth, barHeightL);

        // --- RIGHT CHANNEL (Bottom, going down) ---
        // Cool Purple/Pink gradient
        ctx.fillStyle = `rgba(255, 0, 60, ${right[i]/255})`;
        ctx.fillRect(x, centerY, barWidth, barHeightR);

        x += barWidth + 1;
      }
      
      // Labels
      ctx.font = '10px monospace';
      ctx.fillStyle = '#00f0ff';
      ctx.fillText("L", 10, centerY - 10);
      ctx.fillStyle = '#ff003c';
      ctx.fillText("R", 10, centerY + 20);

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
    <div className="w-full h-full bg-daw-panel/50 rounded-lg overflow-hidden relative">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default Visualizer;