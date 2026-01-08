import React, { useEffect, useRef } from 'react';

interface WaveformPreviewProps {
  buffer: AudioBuffer | null;
}

const WaveformPreview: React.FC<WaveformPreviewProps> = ({ buffer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    
    const step = Math.ceil(dataL.length / width);
    const amp = height / 4;

    ctx.fillStyle = '#00f0ff';
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = dataL[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(i, (height / 4) + (min * amp), 1, (max - min) * amp);
    }

    // Draw Right Channel (Bottom Half)
    ctx.fillStyle = '#ff003c';
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = dataR[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(i, (height * 0.75) + (min * amp), 1, (max - min) * amp);
    }
    
    // Labels
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText("L", 5, 15);
    ctx.fillText("R", 5, height/2 + 15);
    
    // Center Line
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(0, height/2);
    ctx.lineTo(width, height/2);
    ctx.stroke();

  }, [buffer]);

  if (!buffer) return (
      <div className="w-full h-full bg-black/50 flex items-center justify-center text-xs text-gray-600 font-mono">
          NO PREVIEW GENERATED
      </div>
  );

  return <canvas ref={canvasRef} className="w-full h-32 rounded bg-black" />;
};

export default WaveformPreview;