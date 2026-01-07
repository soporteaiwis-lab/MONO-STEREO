import React from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, Rewind, FastForward } from 'lucide-react';

interface TransportProps {
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSkip: (sec: number) => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
}

const Transport: React.FC<TransportProps> = ({ isPlaying, onPlay, onPause, onStop, onSkip, onSeekStart, onSeekEnd }) => {
  return (
    <div className="flex items-center gap-4 bg-daw-panel p-3 rounded-lg border border-gray-800 shadow-xl">
      <button onClick={onSeekStart} className="text-gray-400 hover:text-white transition" title="Ir al Inicio">
        <SkipBack className="h-5 w-5" />
      </button>
      <button onClick={() => onSkip(-10)} className="text-gray-400 hover:text-white transition" title="-10 Segundos">
        <Rewind className="h-5 w-5" />
      </button>
      
      <button 
        onClick={isPlaying ? onPause : onPlay}
        className={`h-12 w-12 rounded-full flex items-center justify-center transition-all ${isPlaying ? 'bg-daw-accent text-black shadow-[0_0_15px_rgba(0,240,255,0.6)]' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
      >
        {isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current ml-1" />}
      </button>

      <button onClick={onStop} className="text-gray-400 hover:text-daw-secondary transition" title="Detener">
        <Square className="h-5 w-5 fill-current" />
      </button>

      <button onClick={() => onSkip(10)} className="text-gray-400 hover:text-white transition" title="+10 Segundos">
        <FastForward className="h-5 w-5" />
      </button>
      <button onClick={onSeekEnd} className="text-gray-400 hover:text-white transition" title="Ir al Final">
        <SkipForward className="h-5 w-5" />
      </button>
    </div>
  );
};

export default Transport;