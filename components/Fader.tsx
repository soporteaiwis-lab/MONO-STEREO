import React from 'react';

interface FaderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
  height?: string;
  colorClass?: string;
}

const Fader: React.FC<FaderProps> = ({ value, min, max, step, onChange, height = "h-32", colorClass = "bg-daw-accent" }) => {
  return (
    <div className={`relative flex items-center justify-center w-8 ${height} bg-daw-surface rounded-full border border-daw-panel shadow-inner`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="absolute w-[128px] h-8 -rotate-90 origin-center bg-transparent cursor-pointer appearance-none z-10"
        style={{ width: height }}
      />
      {/* Visual Fill */}
      <div 
        className={`absolute bottom-0 w-2 rounded-full transition-all duration-75 ${colorClass}`}
        style={{ height: `${(value / max) * 100}%` }}
      />
    </div>
  );
};

export default Fader;