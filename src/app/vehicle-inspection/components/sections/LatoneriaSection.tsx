'use client';
import React, { useState, useRef, useCallback } from 'react';
import type { ZonaVehiculoPDF } from '@/lib/inspectionPdfGenerator';

export type { ZonaVehiculoPDF };

// ─── Types ────────────────────────────────────────────────────────────────────

type DanoTipo = 'sin-dano' | 'rayon' | 'golpe' | 'abolladura' | 'pintura' | null;

interface DamageEntry {
  id: string;
  zonaId: string;
  zonaNombre: string;
  tipo: DanoTipo;
  notas: string;
  fotos: string[];
  timestamp: string;
  inspectorId?: string;
  view: VehicleView;
  x: number;
  y: number;
}

type VehicleView = 'superior' | 'inferior' | 'lateral-izq' | 'lateral-der' | 'frontal' | 'trasera';

interface LatoneriaSectionProps {
  zonas?: ZonaVehiculoPDF[];
  onChange?: (zonas: ZonaVehiculoPDF[]) => void;
  inspectorId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAMAGE_CONFIG: Record<NonNullable<DanoTipo>, { label: string; color: string; bg: string; icon: string }> = {
  'sin-dano':   { label: 'Sin daño',   color: '#22c55e', bg: '#dcfce7', icon: '✓' },
  'rayon':      { label: 'Rayón',      color: '#eab308', bg: '#fef9c3', icon: '/' },
  'golpe':      { label: 'Golpe',      color: '#f97316', bg: '#ffedd5', icon: '●' },
  'abolladura': { label: 'Abolladura', color: '#ef4444', bg: '#fee2e2', icon: '◉' },
  'pintura':    { label: 'Pintura',    color: '#a855f7', bg: '#f3e8ff', icon: '◆' },
};

const VIEWS: { id: VehicleView; label: string }[] = [
  { id: 'superior',     label: 'Vista Superior' },
  { id: 'inferior',     label: 'Vista Inferior' },
  { id: 'lateral-izq',  label: 'Lateral Izquierdo' },
  { id: 'lateral-der',  label: 'Lateral Derecho' },
  { id: 'frontal',      label: 'Frontal' },
  { id: 'trasera',      label: 'Trasera' },
];

// ─── SUV SVG Diagrams ─────────────────────────────────────────────────────────
// Scale: 1px = 5mm. SUV: 4700mm long (940px), 1900mm wide (380px), 1750mm tall (350px)
// Wheelbase: 2800mm (560px). Front overhang: 900mm (180px). Rear overhang: 1000mm (200px)
// Wheel diameter: 750mm (150px, radius 75px). Ground clearance: 200mm (40px)
// Lateral viewBox: 1000x400. Top in y=370. Body x=30..970. Front axle x=210, rear x=770. Wheel center y=295.
// Top/Bottom viewBox: 1000x420. Vehicle x=30..970, y=20..400.
// Front/Rear viewBox: 440x400. Center x=220, width 380px, ground y=370, roof y=20.

function LeftSideViewSVG() {
  // Front of vehicle points LEFT (x=30), rear points RIGHT (x=970)
  return (
    <svg viewBox="0 0 1000 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="suvBodyL" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="60%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id="suvGlassL" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="suvHoodL" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </linearGradient>
        <radialGradient id="suvWheelL" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="60%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="490" cy="375" rx="430" ry="12" fill="#00000018" />

      {/* ── BODY SILHOUETTE ── */}
      {/* Lower body: x=30..970, y=220..330 */}
      <rect x="30" y="220" width="940" height="110" rx="8" fill="url(#suvBodyL)" stroke="#94a3b8" strokeWidth="2" />

      {/* Roofline: SUV profile */}
      {/* Hood: rises from x=30,y=220 to x=210,y=200 (front axle area) then to x=330,y=165 */}
      <path
        d="M30 220 L30 200 Q60 195 120 190 L210 185 L330 165"
        fill="none" stroke="#94a3b8" strokeWidth="2"
      />
      {/* Hood surface */}
      <path
        d="M30 220 L30 200 Q60 195 120 190 L210 185 L330 165 L330 220 Z"
        fill="url(#suvHoodL)" stroke="#94a3b8" strokeWidth="1.5"
      />

      {/* Windshield: from (330,165) to (450,30) */}
      <path
        d="M330 165 L450 30 L540 30 L540 165 Z"
        fill="url(#suvGlassL)" stroke="#38bdf8" strokeWidth="1.5"
      />

      {/* Roof: x=450..800, y=20..30 */}
      <path
        d="M450 30 L800 25 L800 30 L450 30 Z"
        fill="#f8fafc" stroke="#94a3b8" strokeWidth="1"
      />
      {/* Roof panel */}
      <rect x="450" y="20" width="350" height="12" rx="4" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Rear window: from (800,30) to (880,150) */}
      <path
        d="M800 25 L880 150 L880 165 L800 165 Z"
        fill="url(#suvGlassL)" stroke="#38bdf8" strokeWidth="1.5"
      />

      {/* Rear hatch/trunk: x=880..970, y=150..330 */}
      <path
        d="M880 150 L970 155 L970 330 L880 330 Z"
        fill="url(#suvBodyL)" stroke="#94a3b8" strokeWidth="1.5"
      />

      {/* Full body outline */}
      <path
        d="M30 330 L30 200 Q60 195 120 190 L210 185 L330 165 L450 30 L800 25 L880 150 L970 155 L970 330 Z"
        fill="none" stroke="#64748b" strokeWidth="2"
      />

      {/* Waistline (base of windows) at y=165 */}
      <line x1="330" y1="165" x2="880" y2="165" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="8,4" />

      {/* Lower body line at y=220 */}
      <line x1="30" y1="220" x2="970" y2="220" stroke="#64748b" strokeWidth="1" opacity="0.4" />

      {/* ── DOORS ── */}
      {/* Front door: x=340..540, y=165..330 */}
      <rect x="340" y="165" width="200" height="165" rx="3" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
      {/* Front door handle */}
      <rect x="490" y="240" width="35" height="8" rx="4" fill="#94a3b8" stroke="#64748b" strokeWidth="1" />

      {/* Rear door: x=550..760, y=165..330 */}
      <rect x="550" y="165" width="210" height="165" rx="3" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
      {/* Rear door handle */}
      <rect x="700" y="240" width="35" height="8" rx="4" fill="#94a3b8" stroke="#64748b" strokeWidth="1" />

      {/* B-pillar */}
      <line x1="545" y1="165" x2="545" y2="330" stroke="#64748b" strokeWidth="3" />

      {/* ── WHEEL ARCHES ── */}
      {/* Front wheel arch: center (210, 295), radius 95 */}
      <path d="M115 330 A95 95 0 0 1 305 330" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
      {/* Rear wheel arch: center (770, 295), radius 95 */}
      <path d="M675 330 A95 95 0 0 1 865 330" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />

      {/* ── WHEELS ── Front: center (210,295), radius 75 */}
      <circle cx="210" cy="295" r="75" fill="url(#suvWheelL)" stroke="#0f172a" strokeWidth="2.5" />
      <circle cx="210" cy="295" r="55" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <circle cx="210" cy="295" r="20" fill="#475569" stroke="#334155" strokeWidth="1" />
      {/* 5 spokes front */}
      {[0,72,144,216,288].map((angle) => (
        <line
          key={`lf-spoke-${angle}`}
          x1={210 + 20 * Math.cos(angle * Math.PI / 180)}
          y1={295 + 20 * Math.sin(angle * Math.PI / 180)}
          x2={210 + 52 * Math.cos(angle * Math.PI / 180)}
          y2={295 + 52 * Math.sin(angle * Math.PI / 180)}
          stroke="#64748b" strokeWidth="5" strokeLinecap="round"
        />
      ))}

      {/* Rear wheel: center (770,295), radius 75 */}
      <circle cx="770" cy="295" r="75" fill="url(#suvWheelL)" stroke="#0f172a" strokeWidth="2.5" />
      <circle cx="770" cy="295" r="55" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <circle cx="770" cy="295" r="20" fill="#475569" stroke="#334155" strokeWidth="1" />
      {[0,72,144,216,288].map((angle) => (
        <line
          key={`lr-spoke-${angle}`}
          x1={770 + 20 * Math.cos(angle * Math.PI / 180)}
          y1={295 + 20 * Math.sin(angle * Math.PI / 180)}
          x2={770 + 52 * Math.cos(angle * Math.PI / 180)}
          y2={295 + 52 * Math.sin(angle * Math.PI / 180)}
          stroke="#64748b" strokeWidth="5" strokeLinecap="round"
        />
      ))}

      {/* ── DETAILS ── */}
      {/* Side mirror */}
      <path d="M290 155 L320 155 L325 175 L285 175 Z" fill="#475569" stroke="#334155" strokeWidth="1" />
      <rect x="292" y="157" width="26" height="14" rx="2" fill="#64748b" />

      {/* Front headlight */}
      <path d="M30 195 L30 230 L80 225 L80 195 Z" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
      <path d="M35 200 L35 222 L72 218 L72 200 Z" fill="#fefce8" opacity="0.7" />

      {/* Rear tail light */}
      <path d="M960 165 L970 165 L970 230 L955 230 Z" fill="#fca5a5" stroke="#dc2626" strokeWidth="1.5" />

      {/* Front bumper */}
      <path d="M30 220 L30 330 L50 330 L50 220 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Rear bumper */}
      <path d="M950 220 L970 220 L970 330 L950 330 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Side skirt / rocker panel */}
      <rect x="305" y="318" width="390" height="14" rx="4" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1" />

      {/* Roof rack bars */}
      <rect x="480" y="18" width="8" height="14" rx="2" fill="#94a3b8" />
      <rect x="600" y="18" width="8" height="14" rx="2" fill="#94a3b8" />
      <rect x="720" y="18" width="8" height="14" rx="2" fill="#94a3b8" />
    </svg>
  );
}

function RightSideViewSVG() {
  // Mirror of left side: front points RIGHT (x=970), rear points LEFT (x=30)
  return (
    <svg viewBox="0 0 1000 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="suvBodyR" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="60%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id="suvGlassR" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="suvHoodR" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </linearGradient>
        <radialGradient id="suvWheelR" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="60%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="490" cy="375" rx="430" ry="12" fill="#00000018" />

      {/* Lower body */}
      <rect x="30" y="220" width="940" height="110" rx="8" fill="url(#suvBodyR)" stroke="#94a3b8" strokeWidth="2" />

      {/* Hood (front = right side, x=970) */}
      <path
        d="M970 220 L970 200 Q940 195 880 190 L790 185 L670 165"
        fill="none" stroke="#94a3b8" strokeWidth="2"
      />
      <path
        d="M970 220 L970 200 Q940 195 880 190 L790 185 L670 165 L670 220 Z"
        fill="url(#suvHoodR)" stroke="#94a3b8" strokeWidth="1.5"
      />

      {/* Windshield */}
      <path
        d="M670 165 L550 30 L460 30 L460 165 Z"
        fill="url(#suvGlassR)" stroke="#38bdf8" strokeWidth="1.5"
      />

      {/* Roof */}
      <rect x="200" y="20" width="350" height="12" rx="4" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Rear window */}
      <path
        d="M200 25 L120 150 L120 165 L200 165 Z"
        fill="url(#suvGlassR)" stroke="#38bdf8" strokeWidth="1.5"
      />

      {/* Rear hatch */}
      <path
        d="M120 150 L30 155 L30 330 L120 330 Z"
        fill="url(#suvBodyR)" stroke="#94a3b8" strokeWidth="1.5"
      />

      {/* Full body outline */}
      <path
        d="M970 330 L970 200 Q940 195 880 190 L790 185 L670 165 L550 30 L200 25 L120 150 L30 155 L30 330 Z"
        fill="none" stroke="#64748b" strokeWidth="2"
      />

      {/* Waistline */}
      <line x1="120" y1="165" x2="670" y2="165" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="8,4" />
      <line x1="30" y1="220" x2="970" y2="220" stroke="#64748b" strokeWidth="1" opacity="0.4" />

      {/* Rear door: x=240..450, y=165..330 (mirrored) */}
      <rect x="240" y="165" width="210" height="165" rx="3" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
      <rect x="265" y="240" width="35" height="8" rx="4" fill="#94a3b8" stroke="#64748b" strokeWidth="1" />

      {/* Front door: x=460..660, y=165..330 (mirrored) */}
      <rect x="460" y="165" width="200" height="165" rx="3" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
      <rect x="475" y="240" width="35" height="8" rx="4" fill="#94a3b8" stroke="#64748b" strokeWidth="1" />

      {/* B-pillar */}
      <line x1="455" y1="165" x2="455" y2="330" stroke="#64748b" strokeWidth="3" />

      {/* Wheel arches */}
      <path d="M695 330 A95 95 0 0 1 885 330" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
      <path d="M135 330 A95 95 0 0 1 325 330" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />

      {/* Front wheel (right side): center (790,295) */}
      <circle cx="790" cy="295" r="75" fill="url(#suvWheelR)" stroke="#0f172a" strokeWidth="2.5" />
      <circle cx="790" cy="295" r="55" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <circle cx="790" cy="295" r="20" fill="#475569" stroke="#334155" strokeWidth="1" />
      {[0,72,144,216,288].map((angle) => (
        <line
          key={`rf-spoke-${angle}`}
          x1={790 + 20 * Math.cos(angle * Math.PI / 180)}
          y1={295 + 20 * Math.sin(angle * Math.PI / 180)}
          x2={790 + 52 * Math.cos(angle * Math.PI / 180)}
          y2={295 + 52 * Math.sin(angle * Math.PI / 180)}
          stroke="#64748b" strokeWidth="5" strokeLinecap="round"
        />
      ))}

      {/* Rear wheel (right side): center (230,295) */}
      <circle cx="230" cy="295" r="75" fill="url(#suvWheelR)" stroke="#0f172a" strokeWidth="2.5" />
      <circle cx="230" cy="295" r="55" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <circle cx="230" cy="295" r="20" fill="#475569" stroke="#334155" strokeWidth="1" />
      {[0,72,144,216,288].map((angle) => (
        <line
          key={`rr-spoke-${angle}`}
          x1={230 + 20 * Math.cos(angle * Math.PI / 180)}
          y1={295 + 20 * Math.sin(angle * Math.PI / 180)}
          x2={230 + 52 * Math.cos(angle * Math.PI / 180)}
          y2={295 + 52 * Math.sin(angle * Math.PI / 180)}
          stroke="#64748b" strokeWidth="5" strokeLinecap="round"
        />
      ))}

      {/* Side mirror (front = right) */}
      <path d="M680 155 L710 155 L715 175 L675 175 Z" fill="#475569" stroke="#334155" strokeWidth="1" />
      <rect x="682" y="157" width="26" height="14" rx="2" fill="#64748b" />

      {/* Front headlight (right) */}
      <path d="M920 195 L970 195 L970 230 L920 225 Z" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
      <path d="M928 200 L965 200 L965 222 L928 218 Z" fill="#fefce8" opacity="0.7" />

      {/* Rear tail light (right) */}
      <path d="M30 165 L40 165 L45 230 L30 230 Z" fill="#fca5a5" stroke="#dc2626" strokeWidth="1.5" />

      {/* Bumpers */}
      <path d="M950 220 L970 220 L970 330 L950 330 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
      <path d="M30 220 L50 220 L50 330 L30 330 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Side skirt */}
      <rect x="305" y="318" width="390" height="14" rx="4" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1" />

      {/* Roof rack */}
      <rect x="272" y="18" width="8" height="14" rx="2" fill="#94a3b8" />
      <rect x="392" y="18" width="8" height="14" rx="2" fill="#94a3b8" />
      <rect x="512" y="18" width="8" height="14" rx="2" fill="#94a3b8" />
    </svg>
  );
}

function TopViewSVG() {
  // viewBox 1000x420. Vehicle x=30..970, y=20..400. Front = left (x=30).
  return (
    <svg viewBox="0 0 1000 420" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="suvTopBody" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="50%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="suvTopGlass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="suvTopRoof" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="50%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </linearGradient>
      </defs>

      {/* Shadow */}
      <ellipse cx="500" cy="410" rx="450" ry="12" fill="#00000015" />

      {/* Main body outline: SUV top view */}
      {/* x=30..970, y=20..400. Width=380px (y=20..400) */}
      <path
        d="M80 20 L920 20 Q970 20 970 70 L970 350 Q970 400 920 400 L80 400 Q30 400 30 350 L30 70 Q30 20 80 20 Z"
        fill="url(#suvTopBody)" stroke="#64748b" strokeWidth="2.5"
      />

      {/* Hood (front, x=30..250) */}
      <path
        d="M30 70 L30 350 L250 350 L250 20 L80 20 Q30 20 30 70 Z"
        fill="#e8edf2" stroke="#94a3b8" strokeWidth="1.5"
      />
      {/* Hood center line */}
      <line x1="30" y1="210" x2="250" y2="210" stroke="#94a3b8" strokeWidth="1" opacity="0.5" />

      {/* Front windshield */}
      <path
        d="M250 55 L250 365 L380 365 L380 55 Z"
        fill="url(#suvTopGlass)" stroke="#38bdf8" strokeWidth="1.5"
      />

      {/* Roof panel */}
      <path
        d="M380 55 L380 365 L750 365 L750 55 Z"
        fill="url(#suvTopRoof)" stroke="#94a3b8" strokeWidth="1.2"
      />
      {/* Sunroof */}
      <rect x="430" y="100" width="270" height="220" rx="12" fill="#dbeafe" stroke="#93c5fd" strokeWidth="1" opacity="0.7" />

      {/* Rear windshield */}
      <path
        d="M750 55 L750 365 L880 365 L880 55 Z"
        fill="url(#suvTopGlass)" stroke="#38bdf8" strokeWidth="1.5"
      />

      {/* Trunk/rear hatch */}
      <path
        d="M880 55 L880 365 L920 400 L970 350 L970 70 L920 20 L880 55 Z"
        fill="#e8edf2" stroke="#94a3b8" strokeWidth="1.5"
      />

      {/* Door lines */}
      {/* Front doors: y=20..400, x=380..560 */}
      <line x1="380" y1="20" x2="380" y2="400" stroke="#64748b" strokeWidth="1.5" />
      <line x1="560" y1="20" x2="560" y2="400" stroke="#64748b" strokeWidth="1.5" />
      {/* Rear doors: x=560..750 */}
      <line x1="750" y1="20" x2="750" y2="400" stroke="#64748b" strokeWidth="1.5" />

      {/* Left mirrors (y=20 side) */}
      <path d="M280 20 L280 0 L340 0 L340 20 Z" fill="#475569" stroke="#334155" strokeWidth="1" />
      <rect x="285" y="2" width="50" height="16" rx="3" fill="#64748b" />

      {/* Right mirrors (y=400 side) */}
      <path d="M280 400 L280 420 L340 420 L340 400 Z" fill="#475569" stroke="#334155" strokeWidth="1" />
      <rect x="285" y="402" width="50" height="16" rx="3" fill="#64748b" />

      {/* Front wheels (x=30..130 area) */}
      {/* Left front wheel */}
      <rect x="30" y="55" width="60" height="110" rx="20" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <rect x="36" y="61" width="48" height="98" rx="16" fill="#334155" />
      <ellipse cx="60" cy="110" rx="18" ry="22" fill="#475569" opacity="0.6" />
      {/* Right front wheel */}
      <rect x="30" y="255" width="60" height="110" rx="20" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <rect x="36" y="261" width="48" height="98" rx="16" fill="#334155" />
      <ellipse cx="60" cy="310" rx="18" ry="22" fill="#475569" opacity="0.6" />

      {/* Rear wheels (x=800..900 area) */}
      {/* Left rear wheel */}
      <rect x="910" y="55" width="60" height="110" rx="20" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <rect x="916" y="61" width="48" height="98" rx="16" fill="#334155" />
      <ellipse cx="940" cy="110" rx="18" ry="22" fill="#475569" opacity="0.6" />
      {/* Right rear wheel */}
      <rect x="910" y="255" width="60" height="110" rx="20" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <rect x="916" y="261" width="48" height="98" rx="16" fill="#334155" />
      <ellipse cx="940" cy="310" rx="18" ry="22" fill="#475569" opacity="0.6" />

      {/* Roof rack */}
      <rect x="430" y="65" width="8" height="270" rx="3" fill="#94a3b8" opacity="0.7" />
      <rect x="680" y="65" width="8" height="270" rx="3" fill="#94a3b8" opacity="0.7" />
      <rect x="430" y="65" width="258" height="8" rx="3" fill="#94a3b8" opacity="0.7" />
      <rect x="430" y="327" width="258" height="8" rx="3" fill="#94a3b8" opacity="0.7" />
    </svg>
  );
}

function BottomViewSVG() {
  // viewBox 1000x420. Same x/y as top view. Front = left.
  return (
    <svg viewBox="0 0 1000 420" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="suvBotBody" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="50%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
      </defs>

      {/* Shadow */}
      <ellipse cx="500" cy="410" rx="450" ry="12" fill="#00000015" />

      {/* Underbody outline */}
      <path
        d="M80 20 L920 20 Q970 20 970 70 L970 350 Q970 400 920 400 L80 400 Q30 400 30 350 L30 70 Q30 20 80 20 Z"
        fill="url(#suvBotBody)" stroke="#64748b" strokeWidth="2.5"
      />

      {/* Chassis rails */}
      <rect x="100" y="30" width="30" height="360" rx="8" fill="#94a3b8" stroke="#64748b" strokeWidth="1" />
      <rect x="870" y="30" width="30" height="360" rx="8" fill="#94a3b8" stroke="#64748b" strokeWidth="1" />

      {/* Cross members */}
      <rect x="100" y="80" width="800" height="14" rx="5" fill="#64748b" stroke="#475569" strokeWidth="1" />
      <rect x="100" y="180" width="800" height="14" rx="5" fill="#64748b" stroke="#475569" strokeWidth="1" />
      <rect x="100" y="226" width="800" height="14" rx="5" fill="#64748b" stroke="#475569" strokeWidth="1" />
      <rect x="100" y="326" width="800" height="14" rx="5" fill="#64748b" stroke="#475569" strokeWidth="1" />

      {/* Engine/transmission block */}
      <rect x="140" y="100" width="300" height="170" rx="12" fill="#475569" stroke="#334155" strokeWidth="2" />
      <text x="290" y="192" textAnchor="middle" fontSize="22" fill="#cbd5e1" fontWeight="bold">MOTOR</text>

      {/* Gearbox */}
      <rect x="450" y="140" width="160" height="100" rx="10" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <text x="530" y="196" textAnchor="middle" fontSize="16" fill="#94a3b8">CAJA</text>

      {/* Fuel tank */}
      <rect x="580" y="220" width="220" height="100" rx="12" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <text x="690" y="276" textAnchor="middle" fontSize="16" fill="#94a3b8">TANQUE</text>

      {/* Front differential */}
      <ellipse cx="210" cy="187" rx="55" ry="30" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      {/* Rear differential */}
      <ellipse cx="790" cy="210" rx="55" ry="30" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />

      {/* Drive shafts */}
      <line x1="155" y1="187" x2="30" y2="187" stroke="#475569" strokeWidth="8" strokeLinecap="round" />
      <line x1="265" y1="187" x2="390" y2="187" stroke="#475569" strokeWidth="8" strokeLinecap="round" />
      <line x1="155" y1="233" x2="30" y2="233" stroke="#475569" strokeWidth="8" strokeLinecap="round" />
      <line x1="265" y1="233" x2="390" y2="233" stroke="#475569" strokeWidth="8" strokeLinecap="round" />
      <line x1="735" y1="210" x2="610" y2="210" stroke="#475569" strokeWidth="8" strokeLinecap="round" />
      <line x1="845" y1="210" x2="970" y2="187" stroke="#475569" strokeWidth="8" strokeLinecap="round" />
      <line x1="845" y1="210" x2="970" y2="233" stroke="#475569" strokeWidth="8" strokeLinecap="round" />

      {/* Exhaust pipes */}
      <path d="M440 270 Q500 290 820 300 L870 310 L870 330" stroke="#64748b" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M440 150 Q480 160 820 170 L870 180 L870 200" stroke="#64748b" strokeWidth="6" fill="none" strokeLinecap="round" />

      {/* Front wheels */}
      <rect x="30" y="55" width="60" height="110" rx="20" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <rect x="36" y="61" width="48" height="98" rx="16" fill="#334155" />
      <rect x="30" y="255" width="60" height="110" rx="20" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <rect x="36" y="261" width="48" height="98" rx="16" fill="#334155" />

      {/* Rear wheels */}
      <rect x="910" y="55" width="60" height="110" rx="20" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <rect x="916" y="61" width="48" height="98" rx="16" fill="#334155" />
      <rect x="910" y="255" width="60" height="110" rx="20" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <rect x="916" y="261" width="48" height="98" rx="16" fill="#334155" />

      {/* Skid plates */}
      <rect x="140" y="340" width="720" height="20" rx="6" fill="#94a3b8" stroke="#64748b" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

function FrontViewSVG() {
  // viewBox 440x400. Center x=220, width 380px (x=30..410), ground y=370, roof y=20.
  return (
    <svg viewBox="0 0 440 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="suvFrontBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="70%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id="suvFrontGlass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {/* Shadow */}
      <ellipse cx="220" cy="380" rx="190" ry="14" fill="#00000018" />

      {/* Main body: x=30..410, ground y=370, roof y=20 */}
      {/* Body sides taper slightly at top */}
      <path
        d="M30 320 L30 200 Q30 100 60 60 L100 30 L340 30 L380 60 Q410 100 410 200 L410 320 Q410 360 380 370 L60 370 Q30 360 30 320 Z"
        fill="url(#suvFrontBody)" stroke="#64748b" strokeWidth="2.5"
      />

      {/* Hood */}
      <path
        d="M60 60 L100 30 L340 30 L380 60 Q410 100 410 140 L30 140 Q30 100 60 60 Z"
        fill="#e8edf2" stroke="#94a3b8" strokeWidth="1.5"
      />
      {/* Hood center crease */}
      <line x1="220" y1="30" x2="220" y2="140" stroke="#94a3b8" strokeWidth="1" opacity="0.5" />

      {/* Windshield */}
      <path
        d="M85 140 L110 20 L330 20 L355 140 Z"
        fill="url(#suvFrontGlass)" stroke="#38bdf8" strokeWidth="1.5"
      />
      {/* A-pillars */}
      <line x1="85" y1="140" x2="110" y2="20" stroke="#475569" strokeWidth="3" />
      <line x1="355" y1="140" x2="330" y2="20" stroke="#475569" strokeWidth="3" />

      {/* Grille surround */}
      <path
        d="M100 240 L100 200 Q100 185 115 180 L325 180 Q340 185 340 200 L340 240 Z"
        fill="#1e293b" stroke="#0f172a" strokeWidth="2"
      />
      {/* Chrome grille frame */}
      <path
        d="M95 245 L95 198 Q95 180 110 175 L330 175 Q345 180 345 198 L345 245"
        fill="none" stroke="#cbd5e1" strokeWidth="3"
      />
      {/* Grille bars */}
      <line x1="105" y1="200" x2="335" y2="200" stroke="#475569" strokeWidth="2" />
      <line x1="105" y1="215" x2="335" y2="215" stroke="#475569" strokeWidth="2" />
      <line x1="105" y1="230" x2="335" y2="230" stroke="#475569" strokeWidth="2" />
      {/* Vertical grille dividers */}
      <line x1="175" y1="180" x2="175" y2="240" stroke="#475569" strokeWidth="1.5" />
      <line x1="220" y1="180" x2="220" y2="240" stroke="#475569" strokeWidth="1.5" />
      <line x1="265" y1="180" x2="265" y2="240" stroke="#475569" strokeWidth="1.5" />
      {/* Logo */}
      <circle cx="220" cy="210" r="18" fill="#94a3b8" stroke="#64748b" strokeWidth="2" />
      <circle cx="220" cy="210" r="11" fill="#475569" />

      {/* Headlights - LED style */}
      {/* Left headlight */}
      <path d="M30 200 L30 155 Q30 140 50 135 L90 135 L90 200 Z" fill="#fef08a" stroke="#ca8a04" strokeWidth="2" />
      <path d="M38 195 L38 158 Q38 148 52 145 L82 145 L82 195 Z" fill="#fefce8" opacity="0.7" />
      {/* LED strip */}
      <path d="M35 148 L85 148" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
      {/* Right headlight */}
      <path d="M410 200 L410 155 Q410 140 390 135 L350 135 L350 200 Z" fill="#fef08a" stroke="#ca8a04" strokeWidth="2" />
      <path d="M402 195 L402 158 Q402 148 388 145 L358 145 L358 195 Z" fill="#fefce8" opacity="0.7" />
      <path d="M355 148 L405 148" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />

      {/* Fog lights */}
      <ellipse cx="75" cy="290" rx="22" ry="12" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
      <ellipse cx="365" cy="290" rx="22" ry="12" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />

      {/* Lower bumper intake */}
      <path d="M80 260 L80 310 Q80 325 100 330 L340 330 Q360 325 360 310 L360 260 Z" fill="#1e293b" stroke="#0f172a" strokeWidth="1.5" />

      {/* Bumper lower edge */}
      <path d="M30 320 Q30 360 60 370 L380 370 Q410 360 410 320" fill="none" stroke="#64748b" strokeWidth="2" />

      {/* Front wheels */}
      {/* Left wheel */}
      <ellipse cx="75" cy="355" rx="55" ry="22" fill="#1e293b" stroke="#0f172a" strokeWidth="2.5" />
      <ellipse cx="75" cy="355" rx="38" ry="15" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <ellipse cx="75" cy="355" rx="16" ry="7" fill="#475569" />
      {/* Right wheel */}
      <ellipse cx="365" cy="355" rx="55" ry="22" fill="#1e293b" stroke="#0f172a" strokeWidth="2.5" />
      <ellipse cx="365" cy="355" rx="38" ry="15" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <ellipse cx="365" cy="355" rx="16" ry="7" fill="#475569" />

      {/* Left mirror */}
      <path d="M30 155 L10 155 L8 175 L32 175 Z" fill="#475569" stroke="#334155" strokeWidth="1" />
      <rect x="10" y="157" width="20" height="16" rx="3" fill="#64748b" />
      {/* Right mirror */}
      <path d="M410 155 L430 155 L432 175 L408 175 Z" fill="#475569" stroke="#334155" strokeWidth="1" />
      <rect x="410" y="157" width="20" height="16" rx="3" fill="#64748b" />
    </svg>
  );
}

function RearViewSVG() {
  // viewBox 440x400. Same as front but rear details.
  return (
    <svg viewBox="0 0 440 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="suvRearBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="70%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id="suvRearGlass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {/* Shadow */}
      <ellipse cx="220" cy="380" rx="190" ry="14" fill="#00000018" />

      {/* Main body */}
      <path
        d="M30 320 L30 200 Q30 100 60 60 L100 30 L340 30 L380 60 Q410 100 410 200 L410 320 Q410 360 380 370 L60 370 Q30 360 30 320 Z"
        fill="url(#suvRearBody)" stroke="#64748b" strokeWidth="2.5"
      />

      {/* Trunk lid */}
      <path
        d="M60 60 L100 30 L340 30 L380 60 Q410 100 410 140 L30 140 Q30 100 60 60 Z"
        fill="#e8edf2" stroke="#94a3b8" strokeWidth="1.5"
      />
      <line x1="220" y1="30" x2="220" y2="140" stroke="#94a3b8" strokeWidth="1" opacity="0.5" />

      {/* Rear window */}
      <path
        d="M90 140 L115 20 L325 20 L350 140 Z"
        fill="url(#suvRearGlass)" stroke="#38bdf8" strokeWidth="1.5"
      />
      {/* C-pillars */}
      <line x1="90" y1="140" x2="115" y2="20" stroke="#475569" strokeWidth="3" />
      <line x1="350" y1="140" x2="325" y2="20" stroke="#475569" strokeWidth="3" />

      {/* Tail lights - full width LED bar style */}
      {/* Left tail light */}
      <path d="M30 155 L30 200 L90 200 L90 155 Z" fill="#fca5a5" stroke="#dc2626" strokeWidth="2" />
      <path d="M36 160 L36 195 L82 195 L82 160 Z" fill="#fecaca" opacity="0.8" />
      {/* LED strip */}
      <path d="M35 162 L85 162" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
      {/* Right tail light */}
      <path d="M350 155 L350 200 L410 200 L410 155 Z" fill="#fca5a5" stroke="#dc2626" strokeWidth="2" />
      <path d="M358 160 L358 195 L404 195 L404 160 Z" fill="#fecaca" opacity="0.8" />
      <path d="M355 162 L405 162" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />

      {/* Connecting LED strip */}
      <rect x="90" y="162" width="260" height="6" rx="3" fill="#fca5a5" opacity="0.5" />

      {/* Trunk handle */}
      <rect x="185" y="200" width="70" height="10" rx="5" fill="#94a3b8" stroke="#64748b" strokeWidth="1.5" />

      {/* License plate */}
      <rect x="165" y="310" width="110" height="28" rx="4" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />
      <rect x="170" y="314" width="100" height="20" rx="3" fill="#e2e8f0" />
      <text x="220" y="329" textAnchor="middle" fontSize="11" fill="#64748b" fontWeight="bold">ABC 123</text>

      {/* Rear bumper */}
      <path d="M30 320 Q30 360 60 370 L380 370 Q410 360 410 320" fill="none" stroke="#64748b" strokeWidth="2" />
      <path d="M50 330 L50 360 Q60 368 380 368 Q390 360 390 330" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Exhaust pipes */}
      <ellipse cx="100" cy="368" rx="16" ry="8" fill="#64748b" stroke="#475569" strokeWidth="2" />
      <ellipse cx="100" cy="368" rx="10" ry="5" fill="#1e293b" />
      <ellipse cx="340" cy="368" rx="16" ry="8" fill="#64748b" stroke="#475569" strokeWidth="2" />
      <ellipse cx="340" cy="368" rx="10" ry="5" fill="#1e293b" />

      {/* Rear wheels */}
      <ellipse cx="75" cy="355" rx="55" ry="22" fill="#1e293b" stroke="#0f172a" strokeWidth="2.5" />
      <ellipse cx="75" cy="355" rx="38" ry="15" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <ellipse cx="75" cy="355" rx="16" ry="7" fill="#475569" />
      <ellipse cx="365" cy="355" rx="55" ry="22" fill="#1e293b" stroke="#0f172a" strokeWidth="2.5" />
      <ellipse cx="365" cy="355" rx="38" ry="15" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <ellipse cx="365" cy="355" rx="16" ry="7" fill="#475569" />
    </svg>
  );
}

// ─── Zone definitions per view ────────────────────────────────────────────────
// IMPORTANT: Zone IDs are stable and must not be renamed (existing inspections reference them)

interface ZoneHotspot {
  id: string;
  nombre: string;
  x: number;
  y: number;
  w: number;
  h: number;
  view: VehicleView;
}

const ZONE_HOTSPOTS: ZoneHotspot[] = [
  // Superior view (viewBox 1000x420, vehicle x=30..970, y=20..400)
  { id: 'sup-capo',      nombre: 'Capó',                    x: 3,  y: 5,  w: 22, h: 90, view: 'superior' },
  { id: 'sup-techo',     nombre: 'Techo',                   x: 38, y: 5,  w: 27, h: 90, view: 'superior' },
  { id: 'sup-maletero',  nombre: 'Maletero',                x: 75, y: 5,  w: 22, h: 90, view: 'superior' },
  { id: 'sup-puerta-di', nombre: 'Puerta Del. Izq.',        x: 25, y: 2,  w: 13, h: 30, view: 'superior' },
  { id: 'sup-puerta-dd', nombre: 'Puerta Del. Der.',        x: 25, y: 68, w: 13, h: 30, view: 'superior' },
  { id: 'sup-puerta-ti', nombre: 'Puerta Tra. Izq.',        x: 40, y: 2,  w: 13, h: 30, view: 'superior' },
  { id: 'sup-puerta-td', nombre: 'Puerta Tra. Der.',        x: 40, y: 68, w: 13, h: 30, view: 'superior' },
  { id: 'sup-para-del',  nombre: 'Parachoques Del.',        x: 0,  y: 5,  w: 5,  h: 90, view: 'superior' },
  { id: 'sup-para-tra',  nombre: 'Parachoques Tra.',        x: 95, y: 5,  w: 5,  h: 90, view: 'superior' },
  // Frontal view (viewBox 440x400)
  { id: 'fro-bumper',    nombre: 'Parachoques Del.',        x: 10, y: 75, w: 80, h: 20, view: 'frontal' },
  { id: 'fro-capo',      nombre: 'Capó',                    x: 15, y: 32, w: 70, h: 28, view: 'frontal' },
  { id: 'fro-luz-izq',   nombre: 'Faro Izquierdo',          x: 2,  y: 32, w: 20, h: 20, view: 'frontal' },
  { id: 'fro-luz-der',   nombre: 'Faro Derecho',            x: 78, y: 32, w: 20, h: 20, view: 'frontal' },
  { id: 'fro-parabrisas',nombre: 'Parabrisas',              x: 18, y: 2,  w: 64, h: 30, view: 'frontal' },
  { id: 'fro-guar-izq',  nombre: 'Guardabarro Del. Izq.',   x: 2,  y: 52, w: 18, h: 22, view: 'frontal' },
  { id: 'fro-guar-der',  nombre: 'Guardabarro Del. Der.',   x: 80, y: 52, w: 18, h: 22, view: 'frontal' },
  // Trasera view (viewBox 440x400)
  { id: 'tra-bumper',    nombre: 'Parachoques Tra.',        x: 10, y: 75, w: 80, h: 20, view: 'trasera' },
  { id: 'tra-maletero',  nombre: 'Maletero',                x: 15, y: 32, w: 70, h: 28, view: 'trasera' },
  { id: 'tra-luz-izq',   nombre: 'Luz Tra. Izquierda',      x: 2,  y: 35, w: 20, h: 18, view: 'trasera' },
  { id: 'tra-luz-der',   nombre: 'Luz Tra. Derecha',        x: 78, y: 35, w: 20, h: 18, view: 'trasera' },
  { id: 'tra-luna',      nombre: 'Luna Trasera',            x: 18, y: 2,  w: 64, h: 30, view: 'trasera' },
  { id: 'tra-guar-izq',  nombre: 'Guardabarro Tra. Izq.',   x: 2,  y: 55, w: 18, h: 20, view: 'trasera' },
  { id: 'tra-guar-der',  nombre: 'Guardabarro Tra. Der.',   x: 80, y: 55, w: 18, h: 20, view: 'trasera' },
  // Lateral Izquierdo (viewBox 1000x400)
  { id: 'liz-capo',      nombre: 'Capó Izq.',               x: 0,  y: 40, w: 33, h: 45, view: 'lateral-izq' },
  { id: 'liz-puerta-d',  nombre: 'Puerta Del. Izq.',        x: 33, y: 40, w: 21, h: 45, view: 'lateral-izq' },
  { id: 'liz-puerta-t',  nombre: 'Puerta Tra. Izq.',        x: 54, y: 40, w: 21, h: 45, view: 'lateral-izq' },
  { id: 'liz-maletero',  nombre: 'Maletero Izq.',           x: 75, y: 40, w: 22, h: 45, view: 'lateral-izq' },
  { id: 'liz-techo',     nombre: 'Techo Izq.',              x: 33, y: 0,  w: 42, h: 40, view: 'lateral-izq' },
  { id: 'liz-estribo',   nombre: 'Estribo Izquierdo',       x: 30, y: 82, w: 45, h: 10, view: 'lateral-izq' },
  // Lateral Derecho (viewBox 1000x400)
  { id: 'lde-capo',      nombre: 'Capó Der.',               x: 67, y: 40, w: 33, h: 45, view: 'lateral-der' },
  { id: 'lde-puerta-d',  nombre: 'Puerta Del. Der.',        x: 46, y: 40, w: 21, h: 45, view: 'lateral-der' },
  { id: 'lde-puerta-t',  nombre: 'Puerta Tra. Der.',        x: 25, y: 40, w: 21, h: 45, view: 'lateral-der' },
  { id: 'lde-maletero',  nombre: 'Maletero Der.',           x: 3,  y: 40, w: 22, h: 45, view: 'lateral-der' },
  { id: 'lde-techo',     nombre: 'Techo Der.',              x: 25, y: 0,  w: 42, h: 40, view: 'lateral-der' },
  { id: 'lde-estribo',   nombre: 'Estribo Derecho',         x: 25, y: 82, w: 45, h: 10, view: 'lateral-der' },
  // Inferior view (viewBox 1000x420)
  { id: 'inf-motor',     nombre: 'Motor / Cárter',          x: 10, y: 20, w: 32, h: 45, view: 'inferior' },
  { id: 'inf-transmision',nombre: 'Transmisión / Caja',     x: 42, y: 30, w: 18, h: 25, view: 'inferior' },
  { id: 'inf-tanque',    nombre: 'Tanque de combustible',   x: 58, y: 48, w: 24, h: 25, view: 'inferior' },
  { id: 'inf-escape-izq',nombre: 'Escape Izquierdo',        x: 10, y: 35, w: 80, h: 10, view: 'inferior' },
  { id: 'inf-escape-der',nombre: 'Escape Derecho',          x: 10, y: 55, w: 80, h: 10, view: 'inferior' },
  { id: 'inf-dif-del',   nombre: 'Diferencial Delantero',   x: 15, y: 40, w: 12, h: 20, view: 'inferior' },
  { id: 'inf-dif-tra',   nombre: 'Diferencial Trasero',     x: 73, y: 45, w: 12, h: 20, view: 'inferior' },
  { id: 'inf-piso',      nombre: 'Piso / Carrocería',       x: 10, y: 5,  w: 80, h: 90, view: 'inferior' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

function damagesForView(damages: DamageEntry[], view: VehicleView): DamageEntry[] {
  return damages.filter((d) => d.view === view);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LatoneriaSection({ zonas: externalZonas, onChange, inspectorId }: LatoneriaSectionProps) {
  const [activeView, setActiveView] = useState<VehicleView>('superior');
  const [selectedTool, setSelectedTool] = useState<DanoTipo>('rayon');
  const [damages, setDamages] = useState<DamageEntry[]>([]);
  const [selectedDamageId, setSelectedDamageId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const syncExternal = useCallback((newDamages: DamageEntry[]) => {
    if (!onChange) return;
    const zonaMap = new Map<string, ZonaVehiculoPDF>();
    newDamages.forEach((d) => {
      const existing = zonaMap.get(d.zonaId);
      const tipoMapped = d.tipo === 'sin-dano' ? 'bueno'
        : d.tipo === 'rayon' ? 'rayado'
          : d.tipo === 'golpe' ? 'golpe-leve'
            : d.tipo === 'abolladura' ? 'golpe-fuerte'
              : d.tipo === 'pintura' ? 'rayado'
                : null;
      if (!existing) {
        zonaMap.set(d.zonaId, {
          id: d.zonaId,
          nombre: d.zonaNombre,
          tipo: tipoMapped,
          notas: d.notas,
          fotos: d.fotos,
        });
      } else {
        zonaMap.set(d.zonaId, {
          ...existing,
          fotos: [...existing.fotos, ...d.fotos],
          notas: existing.notas ? existing.notas + '; ' + d.notas : d.notas,
        });
      }
    });
    onChange(Array.from(zonaMap.values()));
  }, [onChange]);

  const addDamage = (zone: ZoneHotspot) => {
    if (!selectedTool) return;
    const newDamage: DamageEntry = {
      id: `dmg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      zonaId: zone.id,
      zonaNombre: zone.nombre,
      tipo: selectedTool,
      notas: '',
      fotos: [],
      timestamp: new Date().toISOString(),
      inspectorId,
      view: activeView,
      x: zone.x + zone.w / 2,
      y: zone.y + zone.h / 2,
    };
    const updated = [...damages, newDamage];
    setDamages(updated);
    setSelectedDamageId(newDamage.id);
    syncExternal(updated);
  };

  const eraseDamage = (zoneId: string) => {
    const updated = damages.filter((d) => !(d.zonaId === zoneId && d.view === activeView));
    setDamages(updated);
    if (selectedDamageId && damages.find((d) => d.id === selectedDamageId)?.zonaId === zoneId) {
      setSelectedDamageId(null);
    }
    syncExternal(updated);
  };

  const handleZoneClick = (zone: ZoneHotspot) => {
    if (selectedTool === null) return;
    const existing = damages.find((d) => d.zonaId === zone.id && d.view === activeView);
    if (existing) {
      const updated = damages.map((d) =>
        d.id === existing.id ? { ...d, tipo: selectedTool, timestamp: new Date().toISOString() } : d
      );
      setDamages(updated);
      setSelectedDamageId(existing.id);
      syncExternal(updated);
    } else {
      addDamage(zone);
    }
  };

  const handleEraseZone = (zone: ZoneHotspot) => {
    eraseDamage(zone.id);
  };

  const deleteDamage = (id: string) => {
    const updated = damages.filter((d) => d.id !== id);
    setDamages(updated);
    if (selectedDamageId === id) setSelectedDamageId(null);
    syncExternal(updated);
  };

  const clearAll = () => {
    setDamages([]);
    setSelectedDamageId(null);
    syncExternal([]);
  };

  const updateNote = (id: string, note: string) => {
    const updated = damages.map((d) => d.id === id ? { ...d, notas: note } : d);
    setDamages(updated);
    syncExternal(updated);
  };

  const addPhoto = (id: string, dataUrl: string) => {
    const updated = damages.map((d) => d.id === id ? { ...d, fotos: [...d.fotos, dataUrl] } : d);
    setDamages(updated);
    syncExternal(updated);
  };

  const removePhoto = (damageId: string, photoIdx: number) => {
    const updated = damages.map((d) =>
      d.id === damageId ? { ...d, fotos: d.fotos.filter((_, i) => i !== photoIdx) } : d
    );
    setDamages(updated);
    syncExternal(updated);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedDamageId) return;
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) addPhoto(selectedDamageId, ev.target.result as string);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const selectedDamage = damages.find((d) => d.id === selectedDamageId) || null;
  const viewDamages = damagesForView(damages, activeView);

  const getZoneDamage = (zoneId: string): DamageEntry | undefined =>
    damages.find((d) => d.zonaId === zoneId && d.view === activeView);

  const currentViewZones = ZONE_HOTSPOTS.filter((z) => z.view === activeView);

  const viewIcons: Record<VehicleView, string> = {
    'superior':    '🚗',
    'inferior':    '🔧',
    'lateral-izq': '🚘',
    'lateral-der': '🚙',
    'frontal':     '🚖',
    'trasera':     '🚕',
  };

  // Suppress unused variable warning
  void noteInput;
  void viewDamages;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold">9</span>
            Diagrama de Latonería
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 ml-9">Selecciona una vista del vehículo y marca las áreas con daños.</p>
        </div>
        {/* Legend */}
        <div className="hidden md:flex items-center gap-3 flex-wrap justify-end">
          {(Object.entries(DAMAGE_CONFIG) as [NonNullable<DanoTipo>, typeof DAMAGE_CONFIG[NonNullable<DanoTipo>]][]).map(([tipo, cfg]) => (
            <div key={tipo} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cfg.color }} />
              <span className="text-xs text-gray-600">{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main layout */}
      <div className="border border-gray-200 rounded-2xl bg-white overflow-hidden shadow-sm">
        <div className="flex flex-col lg:flex-row">

          {/* LEFT SIDEBAR — View selectors */}
          <div className="lg:w-44 border-b lg:border-b-0 lg:border-r border-gray-100 p-3 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible">
            {VIEWS.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => setActiveView(view.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                  activeView === view.id
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold' :'text-gray-600 hover:bg-gray-50 border border-transparent'
                }`}
              >
                <span className="text-base">{viewIcons[view.id]}</span>
                <span className="text-xs">{view.label}</span>
              </button>
            ))}
          </div>

          {/* CENTER — Vehicle diagram */}
          <div className="flex-1 p-4 bg-gray-50 relative min-h-[280px] flex items-center justify-center">
            <div className="relative w-full max-w-2xl">
              {/* SVG diagram */}
              <div className="pointer-events-none">
                {activeView === 'superior'    && <TopViewSVG />}
                {activeView === 'inferior'    && <BottomViewSVG />}
                {activeView === 'frontal'     && <FrontViewSVG />}
                {activeView === 'trasera'     && <RearViewSVG />}
                {activeView === 'lateral-izq' && <LeftSideViewSVG />}
                {activeView === 'lateral-der' && <RightSideViewSVG />}
              </div>

              {/* Clickable zone overlays */}
              <div className="absolute inset-0">
                {currentViewZones.map((zone) => {
                  const dmg = getZoneDamage(zone.id);
                  const cfg = dmg?.tipo ? DAMAGE_CONFIG[dmg.tipo] : null;
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      title={zone.nombre}
                      onClick={() => {
                        if (selectedTool === null) {
                          handleEraseZone(zone);
                        } else {
                          handleZoneClick(zone);
                        }
                      }}
                      className="absolute transition-all duration-150 rounded-lg group"
                      style={{
                        left: `${zone.x}%`,
                        top: `${zone.y}%`,
                        width: `${zone.w}%`,
                        height: `${zone.h}%`,
                        backgroundColor: cfg ? cfg.color + '40' : 'transparent',
                        border: cfg ? `2px solid ${cfg.color}` : '2px solid transparent',
                        cursor: 'crosshair',
                        minWidth: '44px',
                        minHeight: '44px',
                      }}
                    >
                      {/* Damage marker dot */}
                      {dmg && (
                        <div
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-md border-2 border-white"
                          style={{ backgroundColor: cfg?.color }}
                        />
                      )}
                      {/* Hover label */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {zone.nombre}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL — Daños registrados */}
          <div className="lg:w-64 border-t lg:border-t-0 lg:border-l border-gray-100 flex flex-col">
            <div className="p-3 border-b border-gray-100">
              <h4 className="text-sm font-bold text-gray-800">Daños registrados</h4>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-80 lg:max-h-none">
              {damages.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <div className="text-3xl mb-2">🚗</div>
                  <p className="text-xs">Sin daños marcados</p>
                </div>
              ) : (
                damages.map((dmg) => {
                  const cfg = dmg.tipo ? DAMAGE_CONFIG[dmg.tipo] : null;
                  return (
                    <div
                      key={dmg.id}
                      className={`rounded-xl border p-2.5 cursor-pointer transition-all ${
                        selectedDamageId === dmg.id ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-white hover:border-gray-200'
                      }`}
                      onClick={() => setSelectedDamageId(selectedDamageId === dmg.id ? null : dmg.id)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg?.color || '#9ca3af' }} />
                            <span className="text-xs font-bold" style={{ color: cfg?.color || '#6b7280' }}>{cfg?.label || '—'}</span>
                          </div>
                          <p className="text-xs text-gray-600 truncate">{dmg.zonaNombre}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{formatTimestamp(dmg.timestamp)}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {dmg.fotos[0] && (
                            <img src={dmg.fotos[0]} alt="preview" className="w-10 h-10 rounded-lg object-cover border border-gray-200" />
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deleteDamage(dmg.id); }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {damages.length > 0 && (
              <div className="p-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={clearAll}
                  className="w-full py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium"
                >
                  Limpiar todo
                </button>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM — Tools + Photo gallery */}
        <div className="border-t border-gray-100">
          <div className="flex flex-col md:flex-row">
            {/* Herramientas */}
            <div className="md:w-80 p-4 border-b md:border-b-0 md:border-r border-gray-100">
              <h4 className="text-sm font-bold text-gray-800 mb-1">Herramientas</h4>
              <p className="text-xs text-gray-500 mb-3">Selecciona el tipo de daño y luego toca en el diagrama</p>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(DAMAGE_CONFIG) as [NonNullable<DanoTipo>, typeof DAMAGE_CONFIG[NonNullable<DanoTipo>]][]).map(([tipo, cfg]) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setSelectedTool(tipo)}
                    className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border-2 transition-all min-w-[60px] ${
                      selectedTool === tipo
                        ? 'border-current shadow-sm'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                    style={selectedTool === tipo ? { backgroundColor: cfg.bg, borderColor: cfg.color, color: cfg.color } : {}}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: selectedTool === tipo ? cfg.color : '#e5e7eb' }}
                    >
                      {selectedTool === tipo ? cfg.icon : <span style={{ color: cfg.color }}>{cfg.icon}</span>}
                    </div>
                    <span className="text-xs font-semibold" style={{ color: selectedTool === tipo ? cfg.color : '#6b7280' }}>
                      {cfg.label}
                    </span>
                  </button>
                ))}
                {/* Borrar tool */}
                <button
                  type="button"
                  onClick={() => setSelectedTool(null)}
                  className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border-2 transition-all min-w-[60px] ${
                    selectedTool === null
                      ? 'border-gray-400 bg-gray-100' :'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-sm">
                    ✕
                  </div>
                  <span className="text-xs font-semibold text-gray-500">Borrar</span>
                </button>
              </div>
            </div>

            {/* Fotos del daño seleccionado */}
            <div className="flex-1 p-4">
              <h4 className="text-sm font-bold text-gray-800 mb-1">
                Fotos del daño seleccionado
                {selectedDamage && (
                  <span className="ml-2 text-xs font-normal text-gray-500">— {selectedDamage.zonaNombre}</span>
                )}
              </h4>
              {!selectedDamage ? (
                <p className="text-xs text-gray-400 mt-2">Selecciona un daño del diagrama o de la lista para ver sus fotos.</p>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={selectedDamage.notas}
                    onChange={(e) => updateNote(selectedDamage.id, e.target.value)}
                    placeholder="Notas sobre este daño..."
                    rows={2}
                    className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <div className="flex gap-2 flex-wrap">
                    {selectedDamage.fotos.map((foto, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={foto}
                          alt={`Foto ${idx + 1} del daño`}
                          className="w-20 h-20 object-cover rounded-xl border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(selectedDamage.id, idx)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-xs">Agregar foto</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      capture="environment"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile legend */}
      <div className="flex md:hidden items-center gap-3 flex-wrap">
        {(Object.entries(DAMAGE_CONFIG) as [NonNullable<DanoTipo>, typeof DAMAGE_CONFIG[NonNullable<DanoTipo>]][]).map(([tipo, cfg]) => (
          <div key={tipo} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
            <span className="text-xs text-gray-500">{cfg.label}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Toca en el diagrama para marcar un daño. Puedes agregar fotos para cada daño marcado.
      </p>
    </div>
  );
}