import React from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
  color?: string;
}

const Knob: React.FC<KnobProps> = ({ label, value, min, max, step, onChange, color = "text-cyber-accent" }) => {
  return (
    <div className="flex flex-col items-center space-y-2">
      <span className={`text-xs font-bold uppercase tracking-wider ${color}`}>{label}</span>
      <div className="relative w-full">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-cyber-700 rounded-lg appearance-none cursor-pointer"
        />
      </div>
      <span className="text-xs text-gray-400 font-mono">{value.toFixed(2)}</span>
    </div>
  );
};

export default Knob;
