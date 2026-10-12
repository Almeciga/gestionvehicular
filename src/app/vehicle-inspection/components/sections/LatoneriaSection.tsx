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
//
// All geometry derived from SUV_* constants (inspectionDiagram.ts).
// Flat technical style: no gradients, no shadows, no filters.
//
// LATERAL (viewBox 1000×400)
//   Body:  x=30..970 (940 px = 4700 mm × 0.2)
//   Front axle x=210 (30 + 900×0.2), rear axle x=750 (210 + 2700×0.2)
//   Ground y=370, wheel center y=300 (370 − 70), wheel radius=70
//   Roof y=30, waistline y=220, lower body y=290
//   Hood: x=30..330 (front overhang 180 px + some cabin slope)
//   Cabin: x=330..870 (windshield x=330, rear window x=870)
//   Rear hatch: x=870..970
//
// TOP / BOTTOM (viewBox 1000×420)
//   Body: x=30..970, y=20..400 (width=380 px centered in y: y0=20, y1=400)
//   Wheel rects: 140 px long (x-axis) × 45 px wide (y-axis)
//   Front axle x=210: wheel rect x=210−70=140..210+70=280
//   Rear axle x=750:  wheel rect x=750−70=680..750+70=820
//   Left side y=20..65 (45 px wide), right side y=355..400
//
// FRONTAL / REAR (viewBox 440×400)
//   Body: x=30..410 (380 px), ground y=370, roof y=30
//   Cabin: x=70..370 (300 px)
//   Wheel rects: 45 px wide × 140 px tall
//   Left wheel:  x=30..75,  y=300..370 (center x=52, y=335)
//   Right wheel: x=365..410, y=300..370 (center x=388, y=335)

// ─── Palette (flat, no hex outside PALETA) ────────────────────────────────────
const P = {
  body:       '#e2e8f0', // body fill
  bodyStroke: '#64748b', // body outline
  glass:      '#bae6fd', // window fill
  glassStroke:'#38bdf8', // window outline
  wheel:      '#1e293b', // tyre fill
  wheelRim:   '#475569', // rim fill
  pillar:     '#475569', // A/B/C pillars
  detail:     '#94a3b8', // secondary details
  headlight:  '#fef08a', // headlight fill
  taillight:  '#fca5a5', // tail light fill
  taillightS: '#dc2626', // tail light stroke
  headlightS: '#ca8a04', // headlight stroke
  chassis:    '#64748b', // chassis / mechanical
  label:      '#334155', // text labels
  bg:         '#f8fafc', // panel background
};

// ─── LeftSideViewSVG ──────────────────────────────────────────────────────────
// Front of vehicle points LEFT (x=30), rear points RIGHT (x=970).
// Geometry (calculado a mano):
//   Ground y=370. Wheel center y=300 (370−70). Wheel radius=70.
//   Front axle x=210. Rear axle x=750.
//   Body bottom y=290. Body top (waistline) y=220.
//   Hood top y=185 at x=330 (windshield base).
//   Roof y=30..870 (x range). Rear window x=870..970.
//   Cabin height: 220−30=190 px. Body lower height: 290−220=70 px.
//   Wheel arch: semi-circle r=80 centered on axle at y=290 (body bottom).
//   Front bumper: x=30..60. Rear bumper: x=940..970.
//   Door split: front door x=330..540, rear door x=540..760.
//   B-pillar at x=540.

function LeftSideViewSVG() {
  return (
    <svg viewBox="0 0 1000 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

      {/* ── BODY LOWER PANEL ── x=30..970, y=220..290 (70 px tall) */}
      {/* calculado a mano: body bottom y=290, waistline y=220 */}
      <rect x="30" y="220" width="940" height="70" fill={P.body} stroke={P.bodyStroke} strokeWidth="2" />

      {/* ── HOOD ── x=30..330, slopes from y=290 at x=30 up to y=185 at x=330 */}
      {/* Front bumper face: x=30..60, y=220..290 */}
      <rect x="30" y="220" width="30" height="70" fill={P.body} stroke={P.bodyStroke} strokeWidth="1.5" />
      {/* Hood surface: trapezoid */}
      <path
        d="M60 220 L330 185 L330 220 Z"
        fill={P.body} stroke={P.bodyStroke} strokeWidth="1.5"
      />
      {/* Hood top edge line */}
      <line x1="60" y1="220" x2="330" y2="185" stroke={P.bodyStroke} strokeWidth="2" />

      {/* ── WINDSHIELD ── x=330..450, y=185..30 (inclined) */}
      {/* calculado a mano: windshield base y=185, top y=30, base x=330..450 */}
      <path
        d="M330 185 L450 30 L540 30 L540 185 Z"
        fill={P.glass} stroke={P.glassStroke} strokeWidth="1.5"
      />
      {/* A-pillar */}
      <line x1="330" y1="185" x2="450" y2="30" stroke={P.pillar} strokeWidth="3" />

      {/* ── ROOF ── x=450..870, y=30 (flat) */}
      {/* calculado a mano: roof width = 870−450 = 420 px */}
      <rect x="450" y="28" width="420" height="6" fill={P.body} stroke={P.bodyStroke} strokeWidth="1.5" />

      {/* ── REAR WINDOW ── x=870..960, y=30..185 (slight slope) */}
      {/* calculado a mano: rear window base y=185, top y=30 */}
      <path
        d="M870 30 L960 185 L870 185 Z"
        fill={P.glass} stroke={P.glassStroke} strokeWidth="1.5"
      />
      {/* C-pillar */}
      <line x1="870" y1="30" x2="960" y2="185" stroke={P.pillar} strokeWidth="3" />

      {/* ── REAR HATCH ── x=960..970, y=185..290 */}
      <rect x="960" y="185" width="10" height="105" fill={P.body} stroke={P.bodyStroke} strokeWidth="1.5" />
      {/* Rear bumper face */}
      <rect x="940" y="220" width="30" height="70" fill={P.body} stroke={P.bodyStroke} strokeWidth="1.5" />

      {/* ── FULL BODY OUTLINE ── */}
      <path
        d="M30 290 L30 220 L60 220 L330 185 L450 30 L870 30 L960 185 L970 220 L970 290 Z"
        fill="none" stroke={P.bodyStroke} strokeWidth="2"
      />

      {/* ── WAISTLINE ── y=185 (base of glass area) */}
      <line x1="330" y1="185" x2="960" y2="185" stroke={P.detail} strokeWidth="1" strokeDasharray="6,4" />

      {/* ── DOORS ── */}
      {/* Front door: x=330..540, y=185..290 */}
      {/* calculado a mano: door width = 540−330 = 210 px */}
      <rect x="330" y="185" width="210" height="105" fill="none" stroke={P.detail} strokeWidth="1.5" />
      {/* Front door window: x=340..530, y=195..185 */}
      <rect x="340" y="195" width="185" height="80" rx="3" fill={P.glass} stroke={P.glassStroke} strokeWidth="1" />
      {/* Front door handle */}
      <rect x="490" y="250" width="30" height="7" rx="3" fill={P.detail} stroke={P.chassis} strokeWidth="1" />

      {/* Rear door: x=540..760, y=185..290 */}
      {/* calculado a mano: door width = 760−540 = 220 px */}
      <rect x="540" y="185" width="220" height="105" fill="none" stroke={P.detail} strokeWidth="1.5" />
      {/* Rear door window: x=550..750, y=195..185 */}
      <rect x="550" y="195" width="195" height="80" rx="3" fill={P.glass} stroke={P.glassStroke} strokeWidth="1" />
      {/* Rear door handle */}
      <rect x="700" y="250" width="30" height="7" rx="3" fill={P.detail} stroke={P.chassis} strokeWidth="1" />

      {/* B-pillar at x=540 */}
      <line x1="540" y1="185" x2="540" y2="290" stroke={P.pillar} strokeWidth="4" />

      {/* ── WHEEL ARCHES ── semi-circle r=80 at y=290 */}
      {/* Front arch: center (210, 290) */}
      <path d="M130 290 A80 80 0 0 1 290 290" fill={P.bg} stroke={P.bodyStroke} strokeWidth="2" />
      {/* Rear arch: center (750, 290) */}
      <path d="M670 290 A80 80 0 0 1 830 290" fill={P.bg} stroke={P.bodyStroke} strokeWidth="2" />

      {/* ── WHEELS ── r=70, center y=300 */}
      {/* Front wheel: cx=210, cy=300 */}
      {/* calculado a mano: cy = ground(370) − radius(70) = 300 */}
      <circle cx="210" cy="300" r="70" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <circle cx="210" cy="300" r="50" fill={P.wheelRim} stroke={P.wheel} strokeWidth="1.5" />
      <circle cx="210" cy="300" r="18" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1" />
      {/* 5 spokes front */}
      {[0, 72, 144, 216, 288].map((angle) => (
        <line
          key={`lf-${angle}`}
          x1={210 + 18 * Math.cos((angle * Math.PI) / 180)}
          y1={300 + 18 * Math.sin((angle * Math.PI) / 180)}
          x2={210 + 48 * Math.cos((angle * Math.PI) / 180)}
          y2={300 + 48 * Math.sin((angle * Math.PI) / 180)}
          stroke={P.detail} strokeWidth="4" strokeLinecap="round"
        />
      ))}

      {/* Rear wheel: cx=750, cy=300 */}
      <circle cx="750" cy="300" r="70" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <circle cx="750" cy="300" r="50" fill={P.wheelRim} stroke={P.wheel} strokeWidth="1.5" />
      <circle cx="750" cy="300" r="18" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1" />
      {[0, 72, 144, 216, 288].map((angle) => (
        <line
          key={`lr-${angle}`}
          x1={750 + 18 * Math.cos((angle * Math.PI) / 180)}
          y1={300 + 18 * Math.sin((angle * Math.PI) / 180)}
          x2={750 + 48 * Math.cos((angle * Math.PI) / 180)}
          y2={300 + 48 * Math.sin((angle * Math.PI) / 180)}
          stroke={P.detail} strokeWidth="4" strokeLinecap="round"
        />
      ))}

      {/* ── DETAILS ── */}
      {/* Side mirror: near A-pillar */}
      <rect x="295" y="170" width="30" height="18" rx="4" fill={P.pillar} stroke={P.label} strokeWidth="1" />

      {/* Front headlight: x=30..80, y=195..220 */}
      <rect x="32" y="196" width="48" height="22" rx="3" fill={P.headlight} stroke={P.headlightS} strokeWidth="1.5" />

      {/* Rear tail light: x=955..970, y=195..220 */}
      <rect x="955" y="196" width="14" height="22" rx="2" fill={P.taillight} stroke={P.taillightS} strokeWidth="1.5" />

      {/* Side rocker panel / estribo: x=330..760, y=285..295 */}
      {/* calculado a mano: between door edges, 10 px tall */}
      <rect x="330" y="285" width="430" height="8" rx="3" fill={P.detail} stroke={P.chassis} strokeWidth="1" />

      {/* Ground line */}
      <line x1="30" y1="370" x2="970" y2="370" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
    </svg>
  );
}

// ─── RightSideViewSVG ─────────────────────────────────────────────────────────
// Exact mirror of LeftSideViewSVG via scale(-1,1) translate(-1000,0).
// Front of vehicle points RIGHT (x=970), rear points LEFT (x=30).
// No independent geometry — derived entirely from the left-side group.
// clipPath id uses suffix "-r" to avoid collision with left-side ids.

function RightSideViewSVG() {
  return (
    <svg viewBox="0 0 1000 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g transform="scale(-1,1) translate(-1000,0)">

        {/* ── BODY LOWER PANEL ── */}
        <rect x="30" y="220" width="940" height="70" fill={P.body} stroke={P.bodyStroke} strokeWidth="2" />

        {/* ── HOOD ── */}
        <rect x="30" y="220" width="30" height="70" fill={P.body} stroke={P.bodyStroke} strokeWidth="1.5" />
        <path d="M60 220 L330 185 L330 220 Z" fill={P.body} stroke={P.bodyStroke} strokeWidth="1.5" />
        <line x1="60" y1="220" x2="330" y2="185" stroke={P.bodyStroke} strokeWidth="2" />

        {/* ── WINDSHIELD ── */}
        <path d="M330 185 L450 30 L540 30 L540 185 Z" fill={P.glass} stroke={P.glassStroke} strokeWidth="1.5" />
        <line x1="330" y1="185" x2="450" y2="30" stroke={P.pillar} strokeWidth="3" />

        {/* ── ROOF ── */}
        <rect x="450" y="28" width="420" height="6" fill={P.body} stroke={P.bodyStroke} strokeWidth="1.5" />

        {/* ── REAR WINDOW ── */}
        <path d="M870 30 L960 185 L870 185 Z" fill={P.glass} stroke={P.glassStroke} strokeWidth="1.5" />
        <line x1="870" y1="30" x2="960" y2="185" stroke={P.pillar} strokeWidth="3" />

        {/* ── REAR HATCH ── */}
        <rect x="960" y="185" width="10" height="105" fill={P.body} stroke={P.bodyStroke} strokeWidth="1.5" />
        <rect x="940" y="220" width="30" height="70" fill={P.body} stroke={P.bodyStroke} strokeWidth="1.5" />

        {/* ── FULL BODY OUTLINE ── */}
        <path
          d="M30 290 L30 220 L60 220 L330 185 L450 30 L870 30 L960 185 L970 220 L970 290 Z"
          fill="none" stroke={P.bodyStroke} strokeWidth="2"
        />

        {/* ── WAISTLINE ── */}
        <line x1="330" y1="185" x2="960" y2="185" stroke={P.detail} strokeWidth="1" strokeDasharray="6,4" />

        {/* ── DOORS ── */}
        <rect x="330" y="185" width="210" height="105" fill="none" stroke={P.detail} strokeWidth="1.5" />
        <rect x="340" y="195" width="185" height="80" rx="3" fill={P.glass} stroke={P.glassStroke} strokeWidth="1" />
        <rect x="490" y="250" width="30" height="7" rx="3" fill={P.detail} stroke={P.chassis} strokeWidth="1" />

        <rect x="540" y="185" width="220" height="105" fill="none" stroke={P.detail} strokeWidth="1.5" />
        <rect x="550" y="195" width="195" height="80" rx="3" fill={P.glass} stroke={P.glassStroke} strokeWidth="1" />
        <rect x="700" y="250" width="30" height="7" rx="3" fill={P.detail} stroke={P.chassis} strokeWidth="1" />

        {/* B-pillar */}
        <line x1="540" y1="185" x2="540" y2="290" stroke={P.pillar} strokeWidth="4" />

        {/* ── WHEEL ARCHES ── */}
        <path d="M130 290 A80 80 0 0 1 290 290" fill={P.bg} stroke={P.bodyStroke} strokeWidth="2" />
        <path d="M670 290 A80 80 0 0 1 830 290" fill={P.bg} stroke={P.bodyStroke} strokeWidth="2" />

        {/* ── WHEELS ── */}
        <circle cx="210" cy="300" r="70" fill={P.wheel} stroke={P.label} strokeWidth="2" />
        <circle cx="210" cy="300" r="50" fill={P.wheelRim} stroke={P.wheel} strokeWidth="1.5" />
        <circle cx="210" cy="300" r="18" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1" />
        {[0, 72, 144, 216, 288].map((angle) => (
          <line
            key={`rf-${angle}`}
            x1={210 + 18 * Math.cos((angle * Math.PI) / 180)}
            y1={300 + 18 * Math.sin((angle * Math.PI) / 180)}
            x2={210 + 48 * Math.cos((angle * Math.PI) / 180)}
            y2={300 + 48 * Math.sin((angle * Math.PI) / 180)}
            stroke={P.detail} strokeWidth="4" strokeLinecap="round"
          />
        ))}

        <circle cx="750" cy="300" r="70" fill={P.wheel} stroke={P.label} strokeWidth="2" />
        <circle cx="750" cy="300" r="50" fill={P.wheelRim} stroke={P.wheel} strokeWidth="1.5" />
        <circle cx="750" cy="300" r="18" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1" />
        {[0, 72, 144, 216, 288].map((angle) => (
          <line
            key={`rr-${angle}`}
            x1={750 + 18 * Math.cos((angle * Math.PI) / 180)}
            y1={300 + 18 * Math.sin((angle * Math.PI) / 180)}
            x2={750 + 48 * Math.cos((angle * Math.PI) / 180)}
            y2={300 + 48 * Math.sin((angle * Math.PI) / 180)}
            stroke={P.detail} strokeWidth="4" strokeLinecap="round"
          />
        ))}

        {/* ── DETAILS ── */}
        <rect x="295" y="170" width="30" height="18" rx="4" fill={P.pillar} stroke={P.label} strokeWidth="1" />
        <rect x="32" y="196" width="48" height="22" rx="3" fill={P.headlight} stroke={P.headlightS} strokeWidth="1.5" />
        <rect x="955" y="196" width="14" height="22" rx="2" fill={P.taillight} stroke={P.taillightS} strokeWidth="1.5" />
        <rect x="330" y="285" width="430" height="8" rx="3" fill={P.detail} stroke={P.chassis} strokeWidth="1" />
        <line x1="30" y1="370" x2="970" y2="370" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
      </g>
    </svg>
  );
}

// ─── TopViewSVG ───────────────────────────────────────────────────────────────
// viewBox 1000×420. Front = left (x=30), rear = right (x=970).
// Body: x=30..970 (940 px), y=20..400 (380 px = body width).
// Wheel rects: 140 px long (x-axis) × 45 px wide (y-axis).
//   Front axle x=210: rect x=140..280 (210−70..210+70)
//   Rear axle x=750:  rect x=680..820 (750−70..750+70)
//   Left side y=20..65 (45 px), right side y=355..400 (45 px)
// Cabin: x=330..870, y=65..355 (inner glass area)
// Hood: x=30..330, Trunk: x=870..970

function TopViewSVG() {
  return (
    <svg viewBox="0 0 1000 420" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

      {/* ── MAIN BODY OUTLINE ── x=30..970, y=20..400 */}
      {/* calculado a mano: body width 380 px, centered in 420 px → margin 20 px each side */}
      <rect x="30" y="20" width="940" height="380" rx="20" fill={P.body} stroke={P.bodyStroke} strokeWidth="2.5" />

      {/* ── HOOD ── x=30..330, y=20..400 */}
      {/* calculado a mano: front overhang 180 px + windshield base at x=330 */}
      <rect x="30" y="20" width="300" height="380" rx="20" fill={P.bg} stroke={P.bodyStroke} strokeWidth="1.5" />
      {/* Hood center crease */}
      <line x1="30" y1="210" x2="330" y2="210" stroke={P.detail} strokeWidth="1" strokeDasharray="6,4" />
      {/* Front bumper edge */}
      <line x1="30" y1="20" x2="30" y2="400" stroke={P.bodyStroke} strokeWidth="2" />

      {/* ── WINDSHIELD (top view = thin band) ── x=330..450 */}
      <rect x="330" y="65" width="120" height="290" fill={P.glass} stroke={P.glassStroke} strokeWidth="1.5" />

      {/* ── ROOF PANEL ── x=450..870 */}
      <rect x="450" y="65" width="420" height="290" fill={P.bg} stroke={P.detail} strokeWidth="1" />

      {/* ── REAR WINDOW (top view = thin band) ── x=870..960 */}
      <rect x="870" y="65" width="90" height="290" fill={P.glass} stroke={P.glassStroke} strokeWidth="1.5" />

      {/* ── TRUNK ── x=870..970 */}
      <rect x="870" y="20" width="100" height="380" rx="20" fill={P.bg} stroke={P.bodyStroke} strokeWidth="1.5" />

      {/* Door lines */}
      <line x1="330" y1="20" x2="330" y2="400" stroke={P.bodyStroke} strokeWidth="1.5" />
      <line x1="540" y1="20" x2="540" y2="400" stroke={P.detail} strokeWidth="1.5" />
      <line x1="760" y1="20" x2="760" y2="400" stroke={P.detail} strokeWidth="1.5" />
      <line x1="870" y1="20" x2="870" y2="400" stroke={P.bodyStroke} strokeWidth="1.5" />

      {/* ── LEFT SIDE MIRRORS ── y=20 side */}
      <rect x="270" y="2" width="60" height="18" rx="4" fill={P.pillar} stroke={P.label} strokeWidth="1" />

      {/* ── RIGHT SIDE MIRRORS ── y=400 side */}
      <rect x="270" y="400" width="60" height="18" rx="4" fill={P.pillar} stroke={P.label} strokeWidth="1" />

      {/* ── FRONT WHEELS ── */}
      {/* calculado a mano: axle x=210, wheel half-length=70 → x=140..280 */}
      {/* Left front: y=20..65 (45 px wide) */}
      <rect x="140" y="20" width="140" height="45" rx="8" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <rect x="148" y="26" width="124" height="33" rx="5" fill={P.wheelRim} />
      {/* Right front: y=355..400 */}
      <rect x="140" y="355" width="140" height="45" rx="8" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <rect x="148" y="361" width="124" height="33" rx="5" fill={P.wheelRim} />

      {/* ── REAR WHEELS ── */}
      {/* calculado a mano: axle x=750, wheel half-length=70 → x=680..820 */}
      {/* Left rear: y=20..65 */}
      <rect x="680" y="20" width="140" height="45" rx="8" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <rect x="688" y="26" width="124" height="33" rx="5" fill={P.wheelRim} />
      {/* Right rear: y=355..400 */}
      <rect x="680" y="355" width="140" height="45" rx="8" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <rect x="688" y="361" width="124" height="33" rx="5" fill={P.wheelRim} />

      {/* Axle lines (dashed) */}
      <line x1="210" y1="20" x2="210" y2="400" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
      <line x1="750" y1="20" x2="750" y2="400" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
    </svg>
  );
}

// ─── BottomViewSVG ────────────────────────────────────────────────────────────
// viewBox 1000×420. Same orientation as top view (front = left).
// Wheels same position as top view.
// Shows underbody: chassis rails, cross-members, engine, gearbox, fuel tank,
// differentials, exhaust. Labels visible (not covered by shapes).

function BottomViewSVG() {
  return (
    <svg viewBox="0 0 1000 420" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

      {/* ── UNDERBODY OUTLINE ── */}
      <rect x="30" y="20" width="940" height="380" rx="20" fill={P.body} stroke={P.bodyStroke} strokeWidth="2.5" />

      {/* ── CHASSIS RAILS ── longitudinal, 30 px wide */}
      {/* Left rail: y=80..100 (center y=90) */}
      <rect x="60" y="80" width="880" height="25" rx="6" fill={P.chassis} stroke={P.label} strokeWidth="1" />
      {/* Right rail: y=315..335 (center y=325) */}
      <rect x="60" y="315" width="880" height="25" rx="6" fill={P.chassis} stroke={P.label} strokeWidth="1" />

      {/* ── CROSS MEMBERS ── */}
      {/* Front cross: x=140..280 (front axle area) */}
      <rect x="140" y="80" width="140" height="265" rx="4" fill={P.detail} stroke={P.chassis} strokeWidth="1" opacity="0.5" />
      {/* Rear cross: x=680..820 (rear axle area) */}
      <rect x="680" y="80" width="140" height="265" rx="4" fill={P.detail} stroke={P.chassis} strokeWidth="1" opacity="0.5" />
      {/* Mid cross member */}
      <rect x="60" y="195" width="880" height="12" rx="4" fill={P.chassis} stroke={P.label} strokeWidth="1" />

      {/* ── ENGINE BLOCK ── x=60..360, y=105..195 */}
      {/* calculado a mano: front zone, 300 px wide × 90 px tall */}
      <rect x="60" y="105" width="300" height="90" rx="10" fill={P.pillar} stroke={P.label} strokeWidth="2" />
      {/* MOTOR label above the block so it is not covered */}
      <text x="210" y="100" textAnchor="middle" fontSize="18" fill={P.label} fontWeight="bold" fontFamily="monospace">MOTOR</text>

      {/* ── GEARBOX ── x=360..520, y=130..195 */}
      <rect x="360" y="130" width="160" height="65" rx="8" fill={P.chassis} stroke={P.label} strokeWidth="1.5" />
      <text x="440" y="168" textAnchor="middle" fontSize="14" fill={P.detail} fontFamily="monospace">CAJA</text>

      {/* ── FUEL TANK ── x=560..780, y=215..310 */}
      <rect x="560" y="215" width="220" height="95" rx="10" fill={P.chassis} stroke={P.label} strokeWidth="1.5" />
      <text x="670" y="268" textAnchor="middle" fontSize="14" fill={P.detail} fontFamily="monospace">TANQUE</text>

      {/* ── FRONT DIFFERENTIAL ── centered on front axle x=210, y=155..235 */}
      {/* calculado a mano: ellipse cx=210, cy=195 */}
      <ellipse cx="210" cy="195" rx="50" ry="25" fill={P.label} stroke={P.wheel} strokeWidth="2" />

      {/* ── REAR DIFFERENTIAL ── centered on rear axle x=750, y=155..235 */}
      <ellipse cx="750" cy="195" rx="50" ry="25" fill={P.label} stroke={P.wheel} strokeWidth="2" />

      {/* ── PROPSHAFT ── connecting differentials */}
      <line x1="260" y1="195" x2="700" y2="195" stroke={P.detail} strokeWidth="6" strokeLinecap="round" />

      {/* ── EXHAUST ── two pipes from engine to rear */}
      {/* Left exhaust: y=115 */}
      <path d="M360 115 Q600 115 820 130 L940 140" stroke={P.chassis} strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* Right exhaust: y=275 */}
      <path d="M360 275 Q600 275 820 290 L940 300" stroke={P.chassis} strokeWidth="5" fill="none" strokeLinecap="round" />

      {/* ── FRONT WHEELS ── same position as top view */}
      <rect x="140" y="20" width="140" height="45" rx="8" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <rect x="148" y="26" width="124" height="33" rx="5" fill={P.wheelRim} />
      <rect x="140" y="355" width="140" height="45" rx="8" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <rect x="148" y="361" width="124" height="33" rx="5" fill={P.wheelRim} />

      {/* ── REAR WHEELS ── */}
      <rect x="680" y="20" width="140" height="45" rx="8" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <rect x="688" y="26" width="124" height="33" rx="5" fill={P.wheelRim} />
      <rect x="680" y="355" width="140" height="45" rx="8" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <rect x="688" y="361" width="124" height="33" rx="5" fill={P.wheelRim} />

      {/* Axle lines */}
      <line x1="210" y1="20" x2="210" y2="400" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
      <line x1="750" y1="20" x2="750" y2="400" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
    </svg>
  );
}

// ─── FrontViewSVG ─────────────────────────────────────────────────────────────
// viewBox 440×400. Body x=30..410 (380 px), ground y=370, roof y=30.
// Cabin x=70..370 (300 px). Center x=220.
// Wheel rects: 45 px wide × 140 px tall.
//   Left wheel:  x=30..75,  y=230..370 (center x=52, y=300)
//   Right wheel: x=365..410, y=230..370 (center x=388, y=300)
// Windshield: x=90..350, y=30..220 (trapezoid, narrower at top)
// Hood: x=30..410, y=220..280 (flat top of hood)
// Bumper: x=30..410, y=320..370

function FrontViewSVG() {
  return (
    <svg viewBox="0 0 440 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

      {/* ── MAIN BODY ── x=30..410, y=30..370 */}
      <rect x="30" y="30" width="380" height="340" rx="10" fill={P.body} stroke={P.bodyStroke} strokeWidth="2.5" />

      {/* ── HOOD TOP ── x=30..410, y=220..280 */}
      {/* calculado a mano: hood occupies y=220..280 (60 px tall) */}
      <rect x="30" y="220" width="380" height="60" fill={P.bg} stroke={P.bodyStroke} strokeWidth="1.5" />
      {/* Hood center crease */}
      <line x1="220" y1="220" x2="220" y2="280" stroke={P.detail} strokeWidth="1" strokeDasharray="4,4" />

      {/* ── WINDSHIELD ── trapezoid: bottom x=90..350 y=220, top x=110..330 y=30 */}
      {/* calculado a mano: cabin x=70..370 (300 px), windshield inset 20 px each side */}
      <path
        d="M90 220 L110 30 L330 30 L350 220 Z"
        fill={P.glass} stroke={P.glassStroke} strokeWidth="1.5"
      />
      {/* A-pillars */}
      <line x1="90" y1="220" x2="110" y2="30" stroke={P.pillar} strokeWidth="3" />
      <line x1="350" y1="220" x2="330" y2="30" stroke={P.pillar} strokeWidth="3" />

      {/* ── GRILLE ── x=100..340, y=280..320 */}
      <rect x="100" y="280" width="240" height="40" rx="5" fill={P.label} stroke={P.wheel} strokeWidth="2" />
      {/* Grille bars */}
      <line x1="108" y1="292" x2="332" y2="292" stroke={P.chassis} strokeWidth="1.5" />
      <line x1="108" y1="304" x2="332" y2="304" stroke={P.chassis} strokeWidth="1.5" />
      <line x1="108" y1="316" x2="332" y2="316" stroke={P.chassis} strokeWidth="1.5" />
      {/* Logo */}
      <circle cx="220" cy="300" r="14" fill={P.chassis} stroke={P.detail} strokeWidth="1.5" />

      {/* ── HEADLIGHTS ── */}
      {/* Left headlight: x=30..90, y=220..280 */}
      <rect x="32" y="222" width="56" height="56" rx="4" fill={P.headlight} stroke={P.headlightS} strokeWidth="1.5" />
      {/* Right headlight: x=350..410, y=220..280 */}
      <rect x="352" y="222" width="56" height="56" rx="4" fill={P.headlight} stroke={P.headlightS} strokeWidth="1.5" />

      {/* ── BUMPER ── x=30..410, y=320..370 */}
      <rect x="30" y="320" width="380" height="50" rx="8" fill={P.bg} stroke={P.bodyStroke} strokeWidth="1.5" />
      {/* Bumper lower intake */}
      <rect x="80" y="330" width="280" height="25" rx="4" fill={P.label} stroke={P.wheel} strokeWidth="1" />

      {/* ── WHEELS ── 45 px wide × 140 px tall */}
      {/* calculado a mano: wheel height 140 px (= diameter), y=230..370 */}
      {/* Left wheel: x=30..75 */}
      <rect x="30" y="230" width="45" height="140" rx="8" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <rect x="36" y="238" width="33" height="124" rx="5" fill={P.wheelRim} />
      <ellipse cx="52" cy="300" rx="12" ry="20" fill={P.chassis} />
      {/* Right wheel: x=365..410 */}
      <rect x="365" y="230" width="45" height="140" rx="8" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <rect x="371" y="238" width="33" height="124" rx="5" fill={P.wheelRim} />
      <ellipse cx="388" cy="300" rx="12" ry="20" fill={P.chassis} />

      {/* ── SIDE MIRRORS ── */}
      {/* Left mirror */}
      <rect x="10" y="140" width="20" height="30" rx="4" fill={P.pillar} stroke={P.label} strokeWidth="1" />
      {/* Right mirror */}
      <rect x="410" y="140" width="20" height="30" rx="4" fill={P.pillar} stroke={P.label} strokeWidth="1" />

      {/* Ground line */}
      <line x1="30" y1="370" x2="410" y2="370" stroke={P.detail} strokeWidth="1.5" />
    </svg>
  );
}

// ─── RearViewSVG ──────────────────────────────────────────────────────────────
// viewBox 440×400. Same proportions as front view.
// Rear window instead of windshield. Tail lights instead of headlights.
// License plate, exhaust pipes, rear bumper.

function RearViewSVG() {
  return (
    <svg viewBox="0 0 440 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

      {/* ── MAIN BODY ── */}
      <rect x="30" y="30" width="380" height="340" rx="10" fill={P.body} stroke={P.bodyStroke} strokeWidth="2.5" />

      {/* ── TRUNK LID ── x=30..410, y=220..280 */}
      <rect x="30" y="220" width="380" height="60" fill={P.bg} stroke={P.bodyStroke} strokeWidth="1.5" />
      <line x1="220" y1="220" x2="220" y2="280" stroke={P.detail} strokeWidth="1" strokeDasharray="4,4" />

      {/* ── REAR WINDOW ── same trapezoid as windshield */}
      <path
        d="M90 220 L110 30 L330 30 L350 220 Z"
        fill={P.glass} stroke={P.glassStroke} strokeWidth="1.5"
      />
      {/* C-pillars */}
      <line x1="90" y1="220" x2="110" y2="30" stroke={P.pillar} strokeWidth="3" />
      <line x1="350" y1="220" x2="330" y2="30" stroke={P.pillar} strokeWidth="3" />

      {/* ── TAIL LIGHTS ── */}
      {/* Left tail light: x=30..90, y=220..280 */}
      <rect x="32" y="222" width="56" height="56" rx="4" fill={P.taillight} stroke={P.taillightS} strokeWidth="1.5" />
      {/* LED strip */}
      <line x1="36" y1="232" x2="84" y2="232" stroke={P.taillightS} strokeWidth="3" strokeLinecap="round" />
      {/* Right tail light: x=350..410, y=220..280 */}
      <rect x="352" y="222" width="56" height="56" rx="4" fill={P.taillight} stroke={P.taillightS} strokeWidth="1.5" />
      <line x1="356" y1="232" x2="404" y2="232" stroke={P.taillightS} strokeWidth="3" strokeLinecap="round" />
      {/* Connecting strip */}
      <rect x="88" y="228" width="264" height="8" rx="3" fill={P.taillight} opacity="0.4" />

      {/* ── TRUNK HANDLE ── */}
      <rect x="185" y="282" width="70" height="10" rx="5" fill={P.detail} stroke={P.chassis} strokeWidth="1.5" />

      {/* ── BUMPER ── */}
      <rect x="30" y="320" width="380" height="50" rx="8" fill={P.bg} stroke={P.bodyStroke} strokeWidth="1.5" />

      {/* ── LICENSE PLATE ── x=160..280, y=328..358 */}
      <rect x="160" y="328" width="120" height="30" rx="4" fill={P.bg} stroke={P.detail} strokeWidth="2" />
      <rect x="165" y="332" width="110" height="22" rx="3" fill={P.body} />

      {/* ── EXHAUST PIPES ── */}
      <ellipse cx="90" cy="368" rx="14" ry="6" fill={P.chassis} stroke={P.pillar} strokeWidth="1.5" />
      <ellipse cx="90" cy="368" rx="8" ry="4" fill={P.wheel} />
      <ellipse cx="350" cy="368" rx="14" ry="6" fill={P.chassis} stroke={P.pillar} strokeWidth="1.5" />
      <ellipse cx="350" cy="368" rx="8" ry="4" fill={P.wheel} />

      {/* ── WHEELS ── same as front view */}
      <rect x="30" y="230" width="45" height="140" rx="8" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <rect x="36" y="238" width="33" height="124" rx="5" fill={P.wheelRim} />
      <ellipse cx="52" cy="300" rx="12" ry="20" fill={P.chassis} />
      <rect x="365" y="230" width="45" height="140" rx="8" fill={P.wheel} stroke={P.label} strokeWidth="2" />
      <rect x="371" y="238" width="33" height="124" rx="5" fill={P.wheelRim} />
      <ellipse cx="388" cy="300" rx="12" ry="20" fill={P.chassis} />

      {/* ── SIDE MIRRORS ── */}
      <rect x="10" y="140" width="20" height="30" rx="4" fill={P.pillar} stroke={P.label} strokeWidth="1" />
      <rect x="410" y="140" width="20" height="30" rx="4" fill={P.pillar} stroke={P.label} strokeWidth="1" />

      {/* Ground line */}
      <line x1="30" y1="370" x2="410" y2="370" stroke={P.detail} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Zone definitions per view ────────────────────────────────────────────────
// IMPORTANT: Zone IDs are stable and must not be renamed (existing inspections reference them).
// Only x, y, w, h (percentages) are updated to match the new geometry.
// id, nombre, view are UNCHANGED.
//
// LATERAL (viewBox 1000×400):
//   Body x=30..970 → x%: 30/1000=3, 970/1000=97
//   Waistline y=185 → y%: 185/400=46.25 ≈ 46
//   Body bottom y=290 → y%: 290/400=72.5 ≈ 73
//   Ground y=370 → y%: 370/400=92.5 ≈ 93
//   Hood x=30..330 → x%: 3..33 (w=30)
//   Front door x=330..540 → x%: 33..54 (w=21)
//   Rear door x=540..760 → x%: 54..76 (w=22)
//   Rear hatch x=760..970 → x%: 76..97 (w=21)
//   Roof y=30..185 → y%: 7.5..46 (h=38.5 ≈ 39)
//   Estribo y=285..295 → y%: 71.25..73.75 (h=2.5 ≈ 3) — use y=70, h=8 for clickability
//
// SUPERIOR (viewBox 1000×420):
//   Body x=30..970, y=20..400
//   Hood x=30..330 → x%: 3..33 (w=30)
//   Windshield x=330..450 → x%: 33..45 (w=12)
//   Roof x=450..870 → x%: 45..87 (w=42)
//   Rear window x=870..960 → x%: 87..96 (w=9)
//   Trunk x=960..970 → x%: 96..97 (w=1) — merge with maletero
//   Left side y=20..65 → y%: 4.76..15.5 (h=10.7 ≈ 11)
//   Right side y=355..400 → y%: 84.5..95.2 (h=10.7 ≈ 11)
//   Front door x=330..540 → x%: 33..54 (w=21)
//   Rear door x=540..760 → x%: 54..76 (w=22)
//   Parachoques del x=30..140 → x%: 3..14 (w=11) — front bumper area
//   Parachoques tra x=860..970 → x%: 86..97 (w=11)
//
// FRONTAL (viewBox 440×400):
//   Body x=30..410, y=30..370
//   Windshield y=30..220 → y%: 7.5..55 (h=47.5 ≈ 48)
//   Hood y=220..280 → y%: 55..70 (h=15)
//   Headlights x=30..90 and x=350..410, y=220..280 → x%: 7..20 and 80..93
//   Grille y=280..320 → y%: 70..80 (h=10)
//   Bumper y=320..370 → y%: 80..92.5 (h=12.5 ≈ 13)
//   Guardabarro izq x=30..90, y=280..370 → x%: 7..20, y%: 70..92.5
//   Guardabarro der x=350..410, y=280..370 → x%: 80..93, y%: 70..92.5
//
// TRASERA (viewBox 440×400): same proportions as frontal
//
// INFERIOR (viewBox 1000×420):
//   Motor x=60..360, y=105..195 → x%: 6..36 (w=30), y%: 25..46 (h=21)
//   Transmision x=360..520, y=130..195 → x%: 36..52 (w=16), y%: 31..46 (h=15)
//   Tanque x=560..780, y=215..310 → x%: 56..78 (w=22), y%: 51..74 (h=23)
//   Escape izq y=115 (path) → approximate band x%: 10..90, y%: 25..32
//   Escape der y=275 (path) → approximate band x%: 10..90, y%: 62..70
//   Dif del cx=210, cy=195 → x%: 16..26 (w=10), y%: 42..52 (h=10)
//   Dif tra cx=750, cy=195 → x%: 70..80 (w=10), y%: 42..52 (h=10)
//   Piso: full underbody x%: 3..97, y%: 5..95

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
  // ── Superior view (viewBox 1000×420) ──────────────────────────────────────
  // Hood: x=30..330 → x%=3, w%=30; full width y=20..400 → y%=5, h%=90
  { id: 'sup-capo',      nombre: 'Capó',               x: 3,  y: 5,  w: 30, h: 90, view: 'superior' },
  // Roof: x=450..870 → x%=45, w%=42; y%=5, h%=90
  { id: 'sup-techo',     nombre: 'Techo',               x: 45, y: 5,  w: 42, h: 90, view: 'superior' },
  // Trunk: x=870..970 → x%=87, w%=10; y%=5, h%=90
  { id: 'sup-maletero',  nombre: 'Maletero',            x: 87, y: 5,  w: 10, h: 90, view: 'superior' },
  // Front door left: x=330..540 → x%=33, w%=21; left side y=20..65 → y%=5, h%=11
  { id: 'sup-puerta-di', nombre: 'Puerta Del. Izq.',    x: 33, y: 5,  w: 21, h: 11, view: 'superior' },
  // Front door right: x=330..540 → x%=33, w%=21; right side y=355..400 → y%=85, h%=11
  { id: 'sup-puerta-dd', nombre: 'Puerta Del. Der.',    x: 33, y: 85, w: 21, h: 11, view: 'superior' },
  // Rear door left: x=540..760 → x%=54, w%=22; left side y%=5, h%=11
  { id: 'sup-puerta-ti', nombre: 'Puerta Tra. Izq.',    x: 54, y: 5,  w: 22, h: 11, view: 'superior' },
  // Rear door right: x=540..760 → x%=54, w%=22; right side y%=85, h%=11
  { id: 'sup-puerta-td', nombre: 'Puerta Tra. Der.',    x: 54, y: 85, w: 22, h: 11, view: 'superior' },
  // Front bumper: x=30..140 → x%=3, w%=11; y%=5, h%=90
  { id: 'sup-para-del',  nombre: 'Parachoques Del.',    x: 3,  y: 5,  w: 11, h: 90, view: 'superior' },
  // Rear bumper: x=860..970 → x%=86, w%=11; y%=5, h%=90
  { id: 'sup-para-tra',  nombre: 'Parachoques Tra.',    x: 86, y: 5,  w: 11, h: 90, view: 'superior' },

  // ── Frontal view (viewBox 440×400) ────────────────────────────────────────
  // Bumper: y=320..370 → y%=80, h%=12.5≈13; x=30..410 → x%=7, w%=84
  { id: 'fro-bumper',     nombre: 'Parachoques Del.',      x: 7,  y: 80, w: 84, h: 13, view: 'frontal' },
  // Hood: y=220..280 → y%=55, h%=15; x=30..410 → x%=7, w%=84
  { id: 'fro-capo',       nombre: 'Capó',                  x: 7,  y: 55, w: 84, h: 15, view: 'frontal' },
  // Left headlight: x=30..90 → x%=7, w%=14; y=220..280 → y%=55, h%=15
  { id: 'fro-luz-izq',    nombre: 'Faro Izquierdo',        x: 7,  y: 55, w: 14, h: 15, view: 'frontal' },
  // Right headlight: x=350..410 → x%=80, w%=14; y=220..280 → y%=55, h%=15
  { id: 'fro-luz-der',    nombre: 'Faro Derecho',          x: 80, y: 55, w: 14, h: 15, view: 'frontal' },
  // Windshield: x=90..350 → x%=20, w%=60; y=30..220 → y%=7.5≈8, h%=47.5≈48
  { id: 'fro-parabrisas', nombre: 'Parabrisas',            x: 20, y: 8,  w: 60, h: 48, view: 'frontal' },
  // Left fender: x=30..90 → x%=7, w%=14; y=280..370 → y%=70, h%=22.5≈23
  { id: 'fro-guar-izq',   nombre: 'Guardabarro Del. Izq.', x: 7,  y: 70, w: 14, h: 23, view: 'frontal' },
  // Right fender: x=350..410 → x%=80, w%=14; y=280..370 → y%=70, h%=23
  { id: 'fro-guar-der',   nombre: 'Guardabarro Del. Der.', x: 80, y: 70, w: 14, h: 23, view: 'frontal' },

  // ── Trasera view (viewBox 440×400) ────────────────────────────────────────
  { id: 'tra-bumper',   nombre: 'Parachoques Tra.',      x: 7,  y: 80, w: 84, h: 13, view: 'trasera' },
  { id: 'tra-maletero', nombre: 'Maletero',              x: 7,  y: 55, w: 84, h: 15, view: 'trasera' },
  // Left tail light: x=30..90 → x%=7, w%=14; y=220..280 → y%=55, h%=15
  { id: 'tra-luz-izq',  nombre: 'Luz Tra. Izquierda',   x: 7,  y: 55, w: 14, h: 15, view: 'trasera' },
  // Right tail light: x=350..410 → x%=80, w%=14
  { id: 'tra-luz-der',  nombre: 'Luz Tra. Derecha',     x: 80, y: 55, w: 14, h: 15, view: 'trasera' },
  // Rear window: same as windshield
  { id: 'tra-luna',     nombre: 'Luna Trasera',         x: 20, y: 8,  w: 60, h: 48, view: 'trasera' },
  // Left rear fender
  { id: 'tra-guar-izq', nombre: 'Guardabarro Tra. Izq.', x: 7,  y: 70, w: 14, h: 23, view: 'trasera' },
  // Right rear fender
  { id: 'tra-guar-der', nombre: 'Guardabarro Tra. Der.', x: 80, y: 70, w: 14, h: 23, view: 'trasera' },

  // ── Lateral Izquierdo (viewBox 1000×400) ──────────────────────────────────
  // Hood: x=30..330 → x%=3, w%=30; y=185..290 → y%=46, h%=26
  { id: 'liz-capo',     nombre: 'Capó Izq.',            x: 3,  y: 46, w: 30, h: 26, view: 'lateral-izq' },
  // Front door: x=330..540 → x%=33, w%=21; y=185..290 → y%=46, h%=26
  { id: 'liz-puerta-d', nombre: 'Puerta Del. Izq.',     x: 33, y: 46, w: 21, h: 26, view: 'lateral-izq' },
  // Rear door: x=540..760 → x%=54, w%=22; y=185..290 → y%=46, h%=26
  { id: 'liz-puerta-t', nombre: 'Puerta Tra. Izq.',     x: 54, y: 46, w: 22, h: 26, view: 'lateral-izq' },
  // Rear hatch: x=760..970 → x%=76, w%=21; y=185..290 → y%=46, h%=26
  { id: 'liz-maletero', nombre: 'Maletero Izq.',        x: 76, y: 46, w: 21, h: 26, view: 'lateral-izq' },
  // Roof: x=330..870 → x%=33, w%=54; y=30..185 → y%=7.5≈8, h%=38.75≈39
  { id: 'liz-techo',    nombre: 'Techo Izq.',           x: 33, y: 8,  w: 54, h: 39, view: 'lateral-izq' },
  // Estribo (rocker): x=330..760 → x%=33, w%=43; y=285..295 → y%=71, h%=8 (enlarged for clickability)
  { id: 'liz-estribo',  nombre: 'Estribo Izquierdo',    x: 33, y: 71, w: 43, h: 8,  view: 'lateral-izq' },

  // ── Lateral Derecho (viewBox 1000×400) ────────────────────────────────────
  // Mirror of liz-*: x' = 100 − x − w
  // liz-capo:     x=3,  w=30 → x'=100−3−30=67
  { id: 'lde-capo',     nombre: 'Capó Der.',            x: 67, y: 46, w: 30, h: 26, view: 'lateral-der' },
  // liz-puerta-d: x=33, w=21 → x'=100−33−21=46
  { id: 'lde-puerta-d', nombre: 'Puerta Del. Der.',     x: 46, y: 46, w: 21, h: 26, view: 'lateral-der' },
  // liz-puerta-t: x=54, w=22 → x'=100−54−22=24
  { id: 'lde-puerta-t', nombre: 'Puerta Tra. Der.',     x: 24, y: 46, w: 22, h: 26, view: 'lateral-der' },
  // liz-maletero: x=76, w=21 → x'=100−76−21=3
  { id: 'lde-maletero', nombre: 'Maletero Der.',        x: 3,  y: 46, w: 21, h: 26, view: 'lateral-der' },
  // liz-techo:    x=33, w=54 → x'=100−33−54=13
  { id: 'lde-techo',    nombre: 'Techo Der.',           x: 13, y: 8,  w: 54, h: 39, view: 'lateral-der' },
  // liz-estribo:  x=33, w=43 → x'=100−33−43=24
  { id: 'lde-estribo',  nombre: 'Estribo Derecho',      x: 24, y: 71, w: 43, h: 8,  view: 'lateral-der' },

  // ── Inferior view (viewBox 1000×420) ──────────────────────────────────────
  // Motor: x=60..360 → x%=6, w%=30; y=105..195 → y%=25, h%=21
  { id: 'inf-motor',        nombre: 'Motor / Cárter',        x: 6,  y: 25, w: 30, h: 21, view: 'inferior' },
  // Transmision: x=360..520 → x%=36, w%=16; y=130..195 → y%=31, h%=15
  { id: 'inf-transmision',  nombre: 'Transmisión / Caja',    x: 36, y: 31, w: 16, h: 15, view: 'inferior' },
  // Tanque: x=560..780 → x%=56, w%=22; y=215..310 → y%=51, h%=23
  { id: 'inf-tanque',       nombre: 'Tanque de combustible', x: 56, y: 51, w: 22, h: 23, view: 'inferior' },
  // Escape izq: path y≈115 → band x%=10, w%=80, y%=25, h%=7
  { id: 'inf-escape-izq',   nombre: 'Escape Izquierdo',      x: 10, y: 25, w: 80, h: 7,  view: 'inferior' },
  // Escape der: path y≈275 → band x%=10, w%=80, y%=62, h%=7
  { id: 'inf-escape-der',   nombre: 'Escape Derecho',        x: 10, y: 62, w: 80, h: 7,  view: 'inferior' },
  // Dif del: cx=210, cy=195 → x%=16, w%=10, y%=42, h%=10
  { id: 'inf-dif-del',      nombre: 'Diferencial Delantero', x: 16, y: 42, w: 10, h: 10, view: 'inferior' },
  // Dif tra: cx=750, cy=195 → x%=70, w%=10, y%=42, h%=10
  { id: 'inf-dif-tra',      nombre: 'Diferencial Trasero',   x: 70, y: 42, w: 10, h: 10, view: 'inferior' },
  // Piso: full underbody
  { id: 'inf-piso',         nombre: 'Piso / Carrocería',     x: 3,  y: 5,  w: 94, h: 90, view: 'inferior' },
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
  void externalZonas;

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