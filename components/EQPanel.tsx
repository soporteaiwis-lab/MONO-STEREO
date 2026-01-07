import React from 'react';
import { EQBand } from '../types';
import Knob from './Knob';

interface EQPanelProps {
  trackName: string;
  bands: EQBand[];
  enabled: boolean;
  onUpdateBand: (id: number, updates: Partial<EQBand>) => void;
  onToggle: () => void;
}

const EQPanel: React.FC<EQPanelProps> = ({ trackName, bands, enabled, onUpdateBand, onToggle }) => {
  return (
    <div className="bg-daw-panel border border-daw-surface rounded-xl p-4 w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-4 border-b border-daw-surface pb-2">
        <h3 className="text-white font-bold text-sm">EQ PARAMÉTRICO: <span className="text-daw-accent">{trackName}</span></h3>
        <button 
          onClick={onToggle}
          className={`px-3 py-1 rounded text-xs font-bold ${enabled ? 'bg-daw-success text-black' : 'bg-daw-surface text-gray-500'}`}
        >
          {enabled ? 'ON' : 'BYPASS'}
        </button>
      </div>

      <div className="flex-1 overflow-x-auto pb-2 custom-scrollbar">
        <div className="flex gap-2 min-w-max h-full items-center">
          {bands.map((band) => (
            <div key={band.id} className="w-16 flex flex-col items-center gap-2 bg-daw-bg/50 p-2 rounded h-full justify-between">
              <span className="text-[10px] text-daw-muted font-mono h-4">
                {band.type === 'lowpass' ? 'LPF' : band.type === 'highpass' ? 'HPF' : ''}
              </span>
              
              {/* Gain Slider for Peaking */}
              {band.type === 'peaking' ? (
                <div className="relative w-8 h-32 bg-daw-surface rounded-full">
                   <input 
                     type="range"
                     min={-12} max={12}
                     value={band.gain}
                     onChange={(e) => onUpdateBand(band.id, { gain: Number(e.target.value) })}
                     className="absolute w-32 h-8 -rotate-90 origin-center bg-transparent cursor-pointer top-12 -left-12"
                   />
                   <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-gray-600 -translate-x-1/2 pointer-events-none"></div>
                   <div 
                      className="absolute left-1/2 w-1.5 bg-daw-accent rounded -translate-x-1/2 pointer-events-none transition-all"
                      style={{ bottom: `${((band.gain + 12) / 24) * 100}%` }}
                   ></div>
                </div>
              ) : (
                 <div className="h-32 w-8 flex items-center justify-center">
                    <div className="w-1 h-full bg-daw-surface/50 rounded"></div>
                 </div>
              )}

              {/* Controls */}
              <div className="flex flex-col gap-1 w-full">
                 <input 
                   type="number"
                   value={band.frequency}
                   onChange={(e) => onUpdateBand(band.id, { frequency: Number(e.target.value) })}
                   className="w-full bg-transparent text-[10px] text-center text-daw-accent border-b border-daw-surface focus:border-daw-accent outline-none"
                 />
                 <span className="text-[9px] text-gray-600 text-center">Hz</span>
                 
                 {band.type === 'peaking' && (
                   <>
                     <span className="text-[9px] text-gray-500 mt-1 text-center">Q:{band.Q}</span>
                   </>
                 )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EQPanel;