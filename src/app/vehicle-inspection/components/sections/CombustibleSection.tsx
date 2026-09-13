'use client';
import React, { useState } from 'react';

interface CombustibleSectionProps {
  fuelLevel?: number;
  onChange?: (level: number) => void;
}

const fuelLevels = [
  { value: 0, label: 'E', sublabel: 'Vacío' },
  { value: 1, label: '1/4', sublabel: '25%' },
  { value: 2, label: '1/2', sublabel: '50%' },
  { value: 3, label: '3/4', sublabel: '75%' },
  { value: 4, label: 'F', sublabel: 'Lleno' },
];

export default function CombustibleSection({ fuelLevel: externalLevel, onChange }: CombustibleSectionProps) {
  const [localLevel, setLocalLevel] = useState(2);

  const fuelLevel = externalLevel ?? localLevel;

  const setFuelLevel = (level: number) => {
    if (onChange) onChange(level);
    else setLocalLevel(level);
  };

  const getFuelColor = (level: number) => {
    if (level <= 1) return 'bg-red-500';
    if (level === 2) return 'bg-yellow-400';
    return 'bg-green-500';
  };

  const currentFuel = fuelLevels[fuelLevel];

  return (
    <div className="space-y-6">
      <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">7</span>
        Nivel de Combustible
      </h3>

      {/* Visual Gauge */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-4xl font-bold text-gray-900 tabular-nums">{currentFuel.label}</p>
            <p className="text-sm text-gray-500 font-semibold">{currentFuel.sublabel}</p>
          </div>
          <div className="w-20 h-20 relative">
            <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
              <circle cx="40" cy="40" r="32" fill="none" stroke="#e5e7eb" strokeWidth="8" />
              <circle
                cx="40" cy="40" r="32"
                fill="none"
                stroke={fuelLevel <= 1 ? '#ef4444' : fuelLevel === 2 ? '#facc15' : '#22c55e'}
                strokeWidth="8"
                strokeDasharray={`${(fuelLevel / 4) * 201} 201`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl">⛽</span>
            </div>
          </div>
        </div>

        {/* Slider */}
        <div className="space-y-3">
          <input
            type="range"
            min={0}
            max={4}
            step={1}
            value={fuelLevel}
            onChange={(e) => setFuelLevel(Number(e.target.value))}
            className="w-full h-3 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${fuelLevel <= 1 ? '#ef4444' : fuelLevel === 2 ? '#facc15' : '#22c55e'} ${(fuelLevel / 4) * 100}%, #e5e7eb ${(fuelLevel / 4) * 100}%)`,
            }}
          />
          {/* Level labels */}
          <div className="flex justify-between">
            {fuelLevels.map((level, idx) => (
              <button
                key={`fuel-${idx}`}
                type="button"
                onClick={() => setFuelLevel(idx)}
                className={`flex flex-col items-center gap-0.5 transition-all ${fuelLevel === idx ? 'opacity-100' : 'opacity-50'}`}
              >
                <div className={`w-3 h-3 rounded-full ${fuelLevel === idx ? getFuelColor(idx) : 'bg-gray-300'}`} />
                <span className="text-xs font-bold text-gray-700">{level.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Warning */}
        {fuelLevel <= 1 && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
            <span className="text-red-500 text-lg">⚠️</span>
            <p className="text-sm font-semibold text-red-700">Nivel de combustible crítico — requiere recarga inmediata</p>
          </div>
        )}
      </div>
    </div>
  );
}