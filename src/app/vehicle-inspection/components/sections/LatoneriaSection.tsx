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

// ─── Palette (flat technical style — no gradients, no shadows, no filters) ───
const P = {
  body:        '#d1d5db', // body fill (light gray)
  bodyDark:    '#9ca3af', // darker body panels
  bodyStroke:  '#374151', // body outline
  glass:       '#bae6fd', // window fill
  glassStroke: '#0ea5e9', // window outline
  wheel:       '#111827', // tyre fill
  wheelRim:    '#4b5563', // rim fill
  wheelSpoke:  '#9ca3af', // spoke color
  pillar:      '#4b5563', // A/B/C pillars
  detail:      '#9ca3af', // secondary details
  headlight:   '#fef9c3', // headlight fill
  taillight:   '#fecaca', // tail light fill
  taillightS:  '#dc2626', // tail light stroke
  headlightS:  '#d97706', // headlight stroke
  chassis:     '#6b7280', // chassis / mechanical
  label:       '#1f2937', // text labels
  bg:          '#f9fafb', // panel background
  rocker:      '#6b7280', // rocker panel / sill
  mirror:      '#374151', // side mirror
  grille:      '#1f2937', // grille
  accent:      '#e5e7eb', // subtle accent
};

// ─── SUV Geometry constants (viewBox 1000×400 for side views) ─────────────────
// Front of vehicle = LEFT (x=30), rear = RIGHT (x=970)
// Ground y=375, wheel center y=298 (375−77), wheel radius=77
// Front axle x=215, rear axle x=755, wheelbase=540 px
// Body bottom y=295, waistline y=210, beltline y=185
// Hood top: starts at x=30 y=295, rises to x=60 y=250, then to x=340 y=185
// Windshield base x=340 y=185, top x=460 y=55
// Roof: x=460..860 y=55 (flat with slight curve)
// Rear window: x=860 y=55 down to x=945 y=185
// Rear hatch: x=945..970 y=185..295
// Cabin height: 185−55=130 px. Lower body: 295−185=110 px.
// Wheel arch radius=90 centered on axle at y=295 (body bottom)
// Front door: x=340..555, rear door: x=555..775
// B-pillar at x=555

// ─── Shared SUV side body — used by both left and right views ─────────────────
// Defined once in <defs>, referenced via <use> with mirror transform for right view.

function SuvSideBodyDefs() {
  return (
    <defs>
      <g id="suv-side-body">
        {/* ── GROUND LINE ── */}
        <line x1="30" y1="375" x2="970" y2="375" stroke={P.detail} strokeWidth="1" strokeDasharray="5,7" />

        {/* ── MAIN BODY SILHOUETTE ── complex path for realistic SUV shape */}
        {/* Lower body: x=30..970, y=295 (bottom edge) */}
        {/* Hood: slopes from front bumper up to windshield base */}
        {/* Cabin: windshield, roof, rear window */}
        {/* Rear: hatch and bumper */}
        <path
          d={[
            // Start at front bumper bottom-left
            'M 30 295',
            // Front bumper face (vertical)
            'L 30 260',
            // Front bumper top curves into hood
            'Q 35 255 50 252',
            // Hood rises from front to windshield base
            'L 80 248',
            'Q 160 235 260 210',
            'Q 310 198 340 185',
            // Windshield (A-pillar slope)
            'Q 370 155 400 110',
            'Q 430 75 460 55',
            // Roof (nearly flat with slight forward slope)
            'Q 550 48 660 48',
            'Q 760 48 860 55',
            // Rear window (C-pillar slope)
            'Q 900 80 930 130',
            'Q 950 165 955 185',
            // Rear hatch top
            'L 965 185',
            // Rear hatch face
            'L 970 210',
            'L 970 260',
            // Rear bumper
            'Q 968 270 960 275',
            'L 960 295',
            // Body bottom — skip wheel arch areas
            // Rear wheel arch
            'L 840 295',
            'A 90 90 0 0 0 665 295',
            // Between arches (rocker panel)
            'L 300 295',
            // Front wheel arch
            'A 90 90 0 0 0 125 295',
            // Return to front bumper
            'L 30 295',
            'Z',
          ].join(' ')}
          fill={P.body}
          stroke={P.bodyStroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* ── HOOD PANEL LINE ── crease line on hood */}
        <path
          d="M 55 252 Q 200 228 340 185"
          fill="none"
          stroke={P.detail}
          strokeWidth="1"
          strokeDasharray="6,4"
        />

        {/* ── WINDSHIELD ── */}
        <path
          d="M 340 185 Q 370 155 400 110 Q 430 75 460 55 L 540 55 L 540 185 Z"
          fill={P.glass}
          stroke={P.glassStroke}
          strokeWidth="1.5"
        />
        {/* A-pillar */}
        <path
          d="M 340 185 Q 370 155 400 110 Q 430 75 460 55"
          fill="none"
          stroke={P.pillar}
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* ── ROOF PANEL ── */}
        <rect x="460" y="48" width="400" height="10" rx="3" fill={P.bodyDark} stroke={P.bodyStroke} strokeWidth="1" />

        {/* ── REAR WINDOW ── */}
        <path
          d="M 860 55 Q 900 80 930 130 Q 950 165 955 185 L 860 185 Z"
          fill={P.glass}
          stroke={P.glassStroke}
          strokeWidth="1.5"
        />
        {/* C-pillar */}
        <path
          d="M 860 55 Q 900 80 930 130 Q 950 165 955 185"
          fill="none"
          stroke={P.pillar}
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* ── BELTLINE (waistline) ── */}
        <line x1="340" y1="185" x2="955" y2="185" stroke={P.detail} strokeWidth="1.5" strokeDasharray="8,5" />

        {/* ── FRONT DOOR ── x=340..555, y=185..295 */}
        <rect x="340" y="185" width="215" height="110" fill="none" stroke={P.detail} strokeWidth="1.5" />
        {/* Front door window */}
        <path
          d="M 348 193 L 348 178 Q 350 172 360 168 L 540 168 L 540 193 Z"
          fill={P.glass}
          stroke={P.glassStroke}
          strokeWidth="1"
        />
        {/* Front door handle */}
        <rect x="500" y="248" width="32" height="8" rx="4" fill={P.detail} stroke={P.chassis} strokeWidth="1" />
        <circle cx="530" cy="252" r="4" fill={P.chassis} />

        {/* ── REAR DOOR ── x=555..775, y=185..295 */}
        <rect x="555" y="185" width="220" height="110" fill="none" stroke={P.detail} strokeWidth="1.5" />
        {/* Rear door window */}
        <rect x="563" y="193" width="204" height="75" rx="4" fill={P.glass} stroke={P.glassStroke} strokeWidth="1" />
        {/* Rear door handle */}
        <rect x="720" y="248" width="32" height="8" rx="4" fill={P.detail} stroke={P.chassis} strokeWidth="1" />
        <circle cx="750" cy="252" r="4" fill={P.chassis} />

        {/* ── B-PILLAR ── */}
        <rect x="552" y="185" width="6" height="110" fill={P.pillar} />

        {/* ── REAR QUARTER PANEL ── x=775..955, y=185..295 */}
        <rect x="775" y="185" width="180" height="110" fill="none" stroke={P.detail} strokeWidth="1" />
        {/* Small quarter window */}
        <path
          d="M 783 193 L 783 178 Q 785 172 795 168 L 855 168 L 855 193 Z"
          fill={P.glass}
          stroke={P.glassStroke}
          strokeWidth="1"
        />

        {/* ── ROCKER PANEL (estribo) ── */}
        <rect x="340" y="288" width="435" height="10" rx="3" fill={P.rocker} stroke={P.bodyStroke} strokeWidth="1" />

        {/* ── WHEEL ARCHES ── semi-circles r=90 at y=295 */}
        {/* Front arch: center (215, 295) */}
        <path d="M 125 295 A 90 90 0 0 1 305 295" fill={P.bg} stroke={P.bodyStroke} strokeWidth="2.5" />
        {/* Rear arch: center (755, 295) */}
        <path d="M 665 295 A 90 90 0 0 1 845 295" fill={P.bg} stroke={P.bodyStroke} strokeWidth="2.5" />

        {/* ── FRONT WHEEL ── cx=215, cy=298, r=77 */}
        <circle cx="215" cy="298" r="77" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
        <circle cx="215" cy="298" r="60" fill={P.wheelRim} stroke={P.wheel} strokeWidth="1.5" />
        <circle cx="215" cy="298" r="22" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1.5" />
        {/* 5 spokes */}
        {[18, 90, 162, 234, 306].map((angle) => (
          <line
            key={`lf-${angle}`}
            x1={215 + 22 * Math.cos((angle * Math.PI) / 180)}
            y1={298 + 22 * Math.sin((angle * Math.PI) / 180)}
            x2={215 + 58 * Math.cos((angle * Math.PI) / 180)}
            y2={298 + 58 * Math.sin((angle * Math.PI) / 180)}
            stroke={P.wheelSpoke}
            strokeWidth="5"
            strokeLinecap="round"
          />
        ))}
        <circle cx="215" cy="298" r="8" fill={P.detail} />

        {/* ── REAR WHEEL ── cx=755, cy=298, r=77 */}
        <circle cx="755" cy="298" r="77" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
        <circle cx="755" cy="298" r="60" fill={P.wheelRim} stroke={P.wheel} strokeWidth="1.5" />
        <circle cx="755" cy="298" r="22" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1.5" />
        {[18, 90, 162, 234, 306].map((angle) => (
          <line
            key={`lr-${angle}`}
            x1={755 + 22 * Math.cos((angle * Math.PI) / 180)}
            y1={298 + 22 * Math.sin((angle * Math.PI) / 180)}
            x2={755 + 58 * Math.cos((angle * Math.PI) / 180)}
            y2={298 + 58 * Math.sin((angle * Math.PI) / 180)}
            stroke={P.wheelSpoke}
            strokeWidth="5"
            strokeLinecap="round"
          />
        ))}
        <circle cx="755" cy="298" r="8" fill={P.detail} />

        {/* ── SIDE MIRROR ── near A-pillar */}
        <path
          d="M 308 172 L 340 168 L 340 185 L 308 185 Z"
          fill={P.mirror}
          stroke={P.bodyStroke}
          strokeWidth="1.5"
        />
        <rect x="300" y="175" width="10" height="8" rx="2" fill={P.chassis} />

        {/* ── FRONT HEADLIGHT ── */}
        <path
          d="M 32 252 L 32 295 L 80 295 L 80 252 Q 60 248 32 252 Z"
          fill={P.headlight}
          stroke={P.headlightS}
          strokeWidth="1.5"
        />
        {/* DRL strip */}
        <line x1="36" y1="260" x2="76" y2="258" stroke={P.headlightS} strokeWidth="2.5" strokeLinecap="round" />
        {/* Low beam */}
        <ellipse cx="55" cy="278" rx="18" ry="12" fill={P.headlight} stroke={P.headlightS} strokeWidth="1" />

        {/* ── REAR TAIL LIGHT ── */}
        <path
          d="M 955 185 L 970 210 L 970 295 L 940 295 L 940 185 Z"
          fill={P.taillight}
          stroke={P.taillightS}
          strokeWidth="1.5"
        />
        {/* LED strip */}
        <line x1="944" y1="195" x2="966" y2="215" stroke={P.taillightS} strokeWidth="3" strokeLinecap="round" />
        <line x1="944" y1="210" x2="966" y2="230" stroke={P.taillightS} strokeWidth="2" strokeLinecap="round" />

        {/* ── FRONT BUMPER LOWER DETAIL ── */}
        <path
          d="M 30 275 Q 35 270 55 268 L 125 268 L 125 280 L 55 280 Q 35 280 30 275 Z"
          fill={P.bodyDark}
          stroke={P.bodyStroke}
          strokeWidth="1"
        />

        {/* ── REAR BUMPER LOWER DETAIL ── */}
        <path
          d="M 970 275 Q 965 270 945 268 L 875 268 L 875 280 L 945 280 Q 965 280 970 275 Z"
          fill={P.bodyDark}
          stroke={P.bodyStroke}
          strokeWidth="1"
        />

        {/* ── BODY CREASE LINE ── character line along lower body */}
        <path
          d="M 80 260 Q 300 255 500 252 Q 700 250 870 255 Q 920 258 955 265"
          fill="none"
          stroke={P.detail}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </defs>
  );
}

// ─── LeftSideViewSVG ──────────────────────────────────────────────────────────
// Front of vehicle points LEFT (x=30), rear points RIGHT (x=970).
// Uses shared geometry group from <defs>.

function LeftSideViewSVG() {
  return (
    <svg viewBox="0 0 1000 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <SuvSideBodyDefs />
      <use href="#suv-side-body" />
    </svg>
  );
}

// ─── RightSideViewSVG ─────────────────────────────────────────────────────────
// Exact mirror of LeftSideViewSVG.
// Uses shared geometry group with transform="translate(1000,0) scale(-1,1)"
// which mirrors horizontally within the same 1000×400 viewBox.
// Front of vehicle points RIGHT (x=970), rear points LEFT (x=30).

function RightSideViewSVG() {
  return (
    <svg viewBox="0 0 1000 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <SuvSideBodyDefs />
      <g transform="translate(1000,0) scale(-1,1)">
        <use href="#suv-side-body" />
      </g>
    </svg>
  );
}

// ─── TopViewSVG ───────────────────────────────────────────────────────────────
// viewBox 1000×420. Front = left (x=30), rear = right (x=970).
// Body: tapered shape — wider at cabin, narrower at front/rear.
// Wheel rects: 140 px long (x-axis) × 50 px wide (y-axis).
//   Front axle x=215: rect x=145..285 (215−70..215+70)
//   Rear axle x=755:  rect x=685..825 (755−70..755+70)
//   Left side y=65..355 (50 px), right side y=350..400 (50 px)
// Cabin: x=340..860, y=65..355 (inner glass area)
// Hood: x=30..340, Trunk: x=860..970

function TopViewSVG() {
  return (
    <svg viewBox="0 0 1000 420" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

      {/* ── MAIN BODY OUTLINE ── tapered SUV shape from above */}
      <path
        d={[
          // Front-left corner (tapered)
          'M 60 80',
          // Front bumper (slightly curved)
          'Q 30 80 30 100',
          'L 30 320',
          'Q 30 340 60 340',
          // Rear-left corner
          'L 60 340',
          // Rear bumper
          'Q 30 340 30 320',
          // Actually let's do a proper tapered shape:
        ].join(' ')}
        fill="none"
      />
      {/* Proper tapered body outline */}
      <path
        d={[
          // Front-left (narrow)
          'M 50 95',
          // Front bumper curve
          'Q 30 95 30 115',
          'L 30 305',
          'Q 30 325 50 325',
          // Rear-left (narrow)
          'L 80 340',
          // Rear bumper
          'Q 30 360 30 340',
        ].join(' ')}
        fill="none"
      />

      {/* Clean tapered SUV body */}
      <path
        d={[
          // Top edge (left side of vehicle = top of SVG)
          // Front bumper left corner
          'M 55 70',
          // Hood narrows toward front
          'Q 30 70 30 90',
          // Front bumper face
          'L 30 100',
          // Front-left fender
          'Q 30 70 55 70',
          // Redo with proper shape:
        ].join(' ')}
        fill="none"
      />

      {/* ── ACTUAL BODY SHAPE ── */}
      <path
        d={[
          // Left side (top of SVG), front to rear
          'M 55 65',           // front-left corner
          'Q 30 65 30 90',     // front bumper left
          'L 30 330',          // front bumper right side
          'Q 30 355 55 355',   // rear-left corner
          'L 940 355',         // rear bumper left
          'Q 970 355 970 330', // rear-right corner
          'L 970 90',          // rear bumper right
          'Q 970 65 940 65',   // front-right corner
          'L 55 65',           // close
          'Z',
        ].join(' ')}
        fill={P.body}
        stroke={P.bodyStroke}
        strokeWidth="2.5"
      />

      {/* ── HOOD AREA ── x=30..340 */}
      <path
        d={[
          'M 55 65',
          'Q 30 65 30 90',
          'L 30 330',
          'Q 30 355 55 355',
          'L 340 355',
          'L 340 65',
          'Z',
        ].join(' ')}
        fill={P.bg}
        stroke={P.bodyStroke}
        strokeWidth="1.5"
      />
      {/* Hood center crease */}
      <line x1="30" y1="210" x2="340" y2="210" stroke={P.detail} strokeWidth="1" strokeDasharray="6,4" />
      {/* Hood vents */}
      <rect x="120" y="150" width="160" height="8" rx="4" fill={P.detail} opacity="0.6" />
      <rect x="120" y="165" width="160" height="8" rx="4" fill={P.detail} opacity="0.6" />
      <rect x="120" y="245" width="160" height="8" rx="4" fill={P.detail} opacity="0.6" />
      <rect x="120" y="260" width="160" height="8" rx="4" fill={P.detail} opacity="0.6" />

      {/* ── WINDSHIELD (top view = angled band) ── x=340..460 */}
      <path
        d="M 340 80 L 460 65 L 460 355 L 340 340 Z"
        fill={P.glass}
        stroke={P.glassStroke}
        strokeWidth="1.5"
      />

      {/* ── ROOF PANEL ── x=460..860 */}
      <rect x="460" y="65" width="400" height="290" fill={P.bg} stroke={P.detail} strokeWidth="1" />
      {/* Roof rails */}
      <rect x="460" y="75" width="400" height="12" rx="4" fill={P.detail} opacity="0.5" />
      <rect x="460" y="333" width="400" height="12" rx="4" fill={P.detail} opacity="0.5" />
      {/* Sunroof */}
      <rect x="530" y="130" width="260" height="160" rx="8" fill={P.glass} stroke={P.glassStroke} strokeWidth="1.5" />

      {/* ── REAR WINDOW (top view = angled band) ── x=860..960 */}
      <path
        d="M 860 65 L 960 80 L 960 340 L 860 355 Z"
        fill={P.glass}
        stroke={P.glassStroke}
        strokeWidth="1.5"
      />

      {/* ── TRUNK AREA ── x=960..970 */}
      <path
        d={[
          'M 960 80',
          'L 970 90',
          'L 970 330',
          'L 960 340',
          'Z',
        ].join(' ')}
        fill={P.bg}
        stroke={P.bodyStroke}
        strokeWidth="1.5"
      />
      {/* Trunk center crease */}
      <line x1="960" y1="210" x2="970" y2="210" stroke={P.detail} strokeWidth="1" strokeDasharray="4,4" />

      {/* ── DOOR LINES ── */}
      <line x1="340" y1="65" x2="340" y2="355" stroke={P.bodyStroke} strokeWidth="2" />
      <line x1="555" y1="65" x2="555" y2="355" stroke={P.detail} strokeWidth="1.5" />
      <line x1="775" y1="65" x2="775" y2="355" stroke={P.detail} strokeWidth="1.5" />
      <line x1="860" y1="65" x2="860" y2="355" stroke={P.bodyStroke} strokeWidth="2" />

      {/* ── LEFT SIDE MIRRORS ── (top of SVG = left side of car) */}
      <path
        d="M 280 65 L 310 50 L 340 50 L 340 65 Z"
        fill={P.mirror}
        stroke={P.bodyStroke}
        strokeWidth="1.5"
      />

      {/* ── RIGHT SIDE MIRRORS ── (bottom of SVG = right side of car) */}
      <path
        d="M 280 355 L 310 370 L 340 370 L 340 355 Z"
        fill={P.mirror}
        stroke={P.bodyStroke}
        strokeWidth="1.5"
      />

      {/* ── FRONT WHEELS ── */}
      {/* Left front: y=20..70 (50 px wide) */}
      <rect x="145" y="20" width="140" height="50" rx="10" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="153" y="27" width="124" height="36" rx="6" fill={P.wheelRim} />
      <line x1="215" y1="20" x2="215" y2="70" stroke={P.wheelSpoke} strokeWidth="2" />
      {/* Right front: y=350..400 */}
      <rect x="145" y="350" width="140" height="50" rx="10" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="153" y="357" width="124" height="36" rx="6" fill={P.wheelRim} />
      <line x1="215" y1="350" x2="215" y2="400" stroke={P.wheelSpoke} strokeWidth="2" />

      {/* ── REAR WHEELS ── */}
      {/* Left rear: y=20..70 */}
      <rect x="685" y="20" width="140" height="50" rx="10" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="693" y="27" width="124" height="36" rx="6" fill={P.wheelRim} />
      <line x1="755" y1="20" x2="755" y2="70" stroke={P.wheelSpoke} strokeWidth="2" />
      {/* Right rear: y=350..400 */}
      <rect x="685" y="350" width="140" height="50" rx="10" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="693" y="357" width="124" height="36" rx="6" fill={P.wheelRim} />
      <line x1="755" y1="350" x2="755" y2="400" stroke={P.wheelSpoke} strokeWidth="2" />

      {/* Axle lines (dashed) */}
      <line x1="215" y1="65" x2="215" y2="355" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
      <line x1="755" y1="65" x2="755" y2="355" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
    </svg>
  );
}

// ─── BottomViewSVG ────────────────────────────────────────────────────────────
// viewBox 1000×420. Same orientation as top view (front = left).
// Shows underbody: chassis rails, cross-members, engine, gearbox, fuel tank,
// differentials, exhaust. Labels visible.

function BottomViewSVG() {
  return (
    <svg viewBox="0 0 1000 420" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

      {/* ── UNDERBODY OUTLINE ── same tapered shape as top view */}
      <path
        d={[
          'M 55 65',
          'Q 30 65 30 90',
          'L 30 330',
          'Q 30 355 55 355',
          'L 940 355',
          'Q 970 355 970 330',
          'L 970 90',
          'Q 970 65 940 65',
          'L 55 65',
          'Z',
        ].join(' ')}
        fill={P.body}
        stroke={P.bodyStroke}
        strokeWidth="2.5"
      />

      {/* ── CHASSIS RAILS ── longitudinal, 28 px wide */}
      {/* Left rail: y=90..118 */}
      <rect x="60" y="90" width="880" height="28" rx="6" fill={P.chassis} stroke={P.label} strokeWidth="1.5" />
      {/* Right rail: y=302..330 */}
      <rect x="60" y="302" width="880" height="28" rx="6" fill={P.chassis} stroke={P.label} strokeWidth="1.5" />

      {/* ── CROSS MEMBERS ── */}
      {/* Front cross member */}
      <rect x="60" y="90" width="20" height="240" rx="4" fill={P.chassis} stroke={P.label} strokeWidth="1" />
      {/* Rear cross member */}
      <rect x="920" y="90" width="20" height="240" rx="4" fill={P.chassis} stroke={P.label} strokeWidth="1" />
      {/* Mid cross member */}
      <rect x="60" y="196" width="880" height="18" rx="4" fill={P.chassis} stroke={P.label} strokeWidth="1" />
      {/* Front axle cross */}
      <rect x="145" y="90" width="140" height="240" rx="4" fill={P.detail} stroke={P.chassis} strokeWidth="1" opacity="0.4" />
      {/* Rear axle cross */}
      <rect x="685" y="90" width="140" height="240" rx="4" fill={P.detail} stroke={P.chassis} strokeWidth="1" opacity="0.4" />

      {/* ── ENGINE BLOCK ── x=65..370, y=118..196 */}
      <rect x="65" y="118" width="305" height="78" rx="10" fill={P.pillar} stroke={P.label} strokeWidth="2" />
      <text x="218" y="162" textAnchor="middle" fontSize="16" fill={P.bg} fontWeight="bold" fontFamily="monospace">MOTOR</text>
      {/* Engine detail lines */}
      <line x1="100" y1="130" x2="100" y2="184" stroke={P.chassis} strokeWidth="1" />
      <line x1="140" y1="130" x2="140" y2="184" stroke={P.chassis} strokeWidth="1" />
      <line x1="180" y1="130" x2="180" y2="184" stroke={P.chassis} strokeWidth="1" />
      <line x1="220" y1="130" x2="220" y2="184" stroke={P.chassis} strokeWidth="1" />
      <line x1="260" y1="130" x2="260" y2="184" stroke={P.chassis} strokeWidth="1" />
      <line x1="300" y1="130" x2="300" y2="184" stroke={P.chassis} strokeWidth="1" />
      <line x1="340" y1="130" x2="340" y2="184" stroke={P.chassis} strokeWidth="1" />

      {/* ── GEARBOX / TRANSMISSION ── x=370..540, y=140..214 */}
      <rect x="370" y="140" width="170" height="74" rx="8" fill={P.chassis} stroke={P.label} strokeWidth="1.5" />
      <text x="455" y="182" textAnchor="middle" fontSize="13" fill={P.detail} fontFamily="monospace">CAJA</text>

      {/* ── PROPSHAFT ── connecting front to rear differential */}
      <rect x="455" y="200" width="240" height="10" rx="5" fill={P.detail} stroke={P.chassis} strokeWidth="1" />

      {/* ── FUEL TANK ── x=570..800, y=214..318 */}
      <rect x="570" y="214" width="230" height="104" rx="12" fill={P.chassis} stroke={P.label} strokeWidth="1.5" />
      <text x="685" y="271" textAnchor="middle" fontSize="13" fill={P.detail} fontFamily="monospace">TANQUE</text>
      {/* Tank straps */}
      <line x1="620" y1="214" x2="620" y2="318" stroke={P.label} strokeWidth="2" />
      <line x1="750" y1="214" x2="750" y2="318" stroke={P.label} strokeWidth="2" />

      {/* ── FRONT DIFFERENTIAL ── centered on front axle x=215, cy=205 */}
      <ellipse cx="215" cy="205" rx="55" ry="28" fill={P.label} stroke={P.wheel} strokeWidth="2" />
      <text x="215" y="210" textAnchor="middle" fontSize="10" fill={P.bg} fontFamily="monospace">DIF</text>

      {/* ── REAR DIFFERENTIAL ── centered on rear axle x=755, cy=205 */}
      <ellipse cx="755" cy="205" rx="55" ry="28" fill={P.label} stroke={P.wheel} strokeWidth="2" />
      <text x="755" y="210" textAnchor="middle" fontSize="10" fill={P.bg} fontFamily="monospace">DIF</text>

      {/* ── EXHAUST PIPES ── */}
      {/* Left exhaust: from engine to rear, near left rail */}
      <path d="M 370 128 Q 550 125 700 128 Q 820 130 900 138 L 940 145" stroke={P.chassis} strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="940" cy="145" r="8" fill={P.wheel} stroke={P.chassis} strokeWidth="2" />
      {/* Right exhaust: near right rail */}
      <path d="M 370 282 Q 550 285 700 282 Q 820 280 900 272 L 940 265" stroke={P.chassis} strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="940" cy="265" r="8" fill={P.wheel} stroke={P.chassis} strokeWidth="2" />

      {/* ── FRONT WHEELS ── same position as top view */}
      <rect x="145" y="20" width="140" height="50" rx="10" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="153" y="27" width="124" height="36" rx="6" fill={P.wheelRim} />
      <rect x="145" y="350" width="140" height="50" rx="10" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="153" y="357" width="124" height="36" rx="6" fill={P.wheelRim} />

      {/* ── REAR WHEELS ── */}
      <rect x="685" y="20" width="140" height="50" rx="10" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="693" y="27" width="124" height="36" rx="6" fill={P.wheelRim} />
      <rect x="685" y="350" width="140" height="50" rx="10" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="693" y="357" width="124" height="36" rx="6" fill={P.wheelRim} />

      {/* Axle lines */}
      <line x1="215" y1="65" x2="215" y2="355" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
      <line x1="755" y1="65" x2="755" y2="355" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
    </svg>
  );
}

// ─── FrontViewSVG ─────────────────────────────────────────────────────────────
// viewBox 440×420. Body x=30..410 (380 px), ground y=390, roof y=25.
// Cabin x=70..370 (300 px). Center x=220.
// Wheel rects: 50 px wide × 150 px tall.
//   Left wheel:  x=25..75,  y=240..390
//   Right wheel: x=365..415, y=240..390
// Windshield: trapezoid, bottom x=80..360 y=210, top x=100..340 y=25
// Hood: x=30..410, y=210..270
// Bumper: x=30..410, y=330..390

function FrontViewSVG() {
  return (
    <svg viewBox="0 0 440 420" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

      {/* ── MAIN BODY SILHOUETTE ── */}
      <path
        d={[
          // Roof
          'M 100 25',
          'L 340 25',
          // C-pillar right
          'Q 380 25 400 60',
          'L 410 210',
          // Right body side
          'L 415 240',
          // Right wheel arch
          'L 415 390',
          'L 365 390',
          'L 365 240',
          // Right body lower
          'L 75 240',
          // Left wheel arch
          'L 75 390',
          'L 25 390',
          'L 25 240',
          // Left body side
          'L 30 210',
          'Q 40 60 100 25',
          'Z',
        ].join(' ')}
        fill={P.body}
        stroke={P.bodyStroke}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* ── WINDSHIELD ── trapezoid */}
      <path
        d="M 80 210 L 100 25 L 340 25 L 360 210 Z"
        fill={P.glass}
        stroke={P.glassStroke}
        strokeWidth="1.5"
      />
      {/* Windshield wiper line */}
      <path d="M 100 200 Q 220 185 340 200" fill="none" stroke={P.detail} strokeWidth="1.5" />
      {/* A-pillars */}
      <line x1="80" y1="210" x2="100" y2="25" stroke={P.pillar} strokeWidth="4" />
      <line x1="360" y1="210" x2="340" y2="25" stroke={P.pillar} strokeWidth="4" />

      {/* ── HOOD PANEL ── x=30..410, y=210..270 */}
      <rect x="30" y="210" width="380" height="60" fill={P.bg} stroke={P.bodyStroke} strokeWidth="1.5" />
      {/* Hood center crease */}
      <line x1="220" y1="210" x2="220" y2="270" stroke={P.detail} strokeWidth="1.5" strokeDasharray="4,4" />
      {/* Hood edge highlight */}
      <line x1="35" y1="215" x2="405" y2="215" stroke={P.accent} strokeWidth="2" />

      {/* ── HEADLIGHTS ── angular modern style */}
      {/* Left headlight: x=30..80, y=210..270 */}
      <path
        d="M 32 212 L 78 212 L 78 268 L 32 268 Q 28 268 28 264 L 28 216 Q 28 212 32 212 Z"
        fill={P.headlight}
        stroke={P.headlightS}
        strokeWidth="1.5"
      />
      {/* DRL strip */}
      <line x1="34" y1="222" x2="74" y2="222" stroke={P.headlightS} strokeWidth="3" strokeLinecap="round" />
      {/* Low beam */}
      <ellipse cx="55" cy="248" rx="16" ry="12" fill={P.headlight} stroke={P.headlightS} strokeWidth="1" />

      {/* Right headlight: x=362..410, y=210..270 */}
      <path
        d="M 362 212 L 408 212 Q 412 212 412 216 L 412 264 Q 412 268 408 268 L 362 268 Z"
        fill={P.headlight}
        stroke={P.headlightS}
        strokeWidth="1.5"
      />
      <line x1="366" y1="222" x2="406" y2="222" stroke={P.headlightS} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="385" cy="248" rx="16" ry="12" fill={P.headlight} stroke={P.headlightS} strokeWidth="1" />

      {/* ── GRILLE ── x=85..355, y=270..330 */}
      <rect x="85" y="270" width="270" height="60" rx="6" fill={P.grille} stroke={P.bodyStroke} strokeWidth="2" />
      {/* Grille mesh */}
      {[280, 292, 304, 316, 322].map((y) => (
        <line key={`gh-${y}`} x1="90" y1={y} x2="350" y2={y} stroke={P.chassis} strokeWidth="1.5" />
      ))}
      {[120, 155, 190, 225, 260, 295, 330].map((x) => (
        <line key={`gv-${x}`} x1={x} y1="272" x2={x} y2="328" stroke={P.chassis} strokeWidth="1" />
      ))}
      {/* Brand logo */}
      <ellipse cx="220" cy="300" rx="18" ry="18" fill={P.chassis} stroke={P.detail} strokeWidth="2" />
      <line x1="210" y1="300" x2="230" y2="300" stroke={P.detail} strokeWidth="2" />
      <line x1="220" y1="290" x2="220" y2="310" stroke={P.detail} strokeWidth="2" />

      {/* ── BUMPER ── x=30..410, y=330..390 */}
      <path
        d="M 30 330 L 410 330 L 415 355 Q 415 390 390 390 L 50 390 Q 25 390 25 355 Z"
        fill={P.bg}
        stroke={P.bodyStroke}
        strokeWidth="1.5"
      />
      {/* Lower air intake */}
      <rect x="75" y="340" width="290" height="35" rx="5" fill={P.grille} stroke={P.bodyStroke} strokeWidth="1" />
      {/* Fog lights */}
      <rect x="40" y="345" width="30" height="22" rx="4" fill={P.headlight} stroke={P.headlightS} strokeWidth="1" />
      <rect x="370" y="345" width="30" height="22" rx="4" fill={P.headlight} stroke={P.headlightS} strokeWidth="1" />

      {/* ── WHEELS ── 50 px wide × 150 px tall */}
      {/* Left wheel: x=25..75, y=240..390 */}
      <rect x="25" y="240" width="50" height="150" rx="10" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="31" y="248" width="38" height="134" rx="7" fill={P.wheelRim} />
      <ellipse cx="50" cy="315" rx="14" ry="24" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1.5" />
      <line x1="50" y1="291" x2="50" y2="339" stroke={P.wheelSpoke} strokeWidth="3" />
      <line x1="36" y1="315" x2="64" y2="315" stroke={P.wheelSpoke} strokeWidth="3" />

      {/* Right wheel: x=365..415, y=240..390 */}
      <rect x="365" y="240" width="50" height="150" rx="10" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="371" y="248" width="38" height="134" rx="7" fill={P.wheelRim} />
      <ellipse cx="390" cy="315" rx="14" ry="24" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1.5" />
      <line x1="390" y1="291" x2="390" y2="339" stroke={P.wheelSpoke} strokeWidth="3" />
      <line x1="376" y1="315" x2="404" y2="315" stroke={P.wheelSpoke} strokeWidth="3" />

      {/* ── SIDE MIRRORS ── */}
      <path d="M 8 150 L 30 145 L 30 175 L 8 175 Q 4 175 4 170 L 4 155 Q 4 150 8 150 Z"
        fill={P.mirror} stroke={P.bodyStroke} strokeWidth="1.5" />
      <path d="M 432 150 L 410 145 L 410 175 L 432 175 Q 436 175 436 170 L 436 155 Q 436 150 432 150 Z"
        fill={P.mirror} stroke={P.bodyStroke} strokeWidth="1.5" />

      {/* Ground line */}
      <line x1="25" y1="390" x2="415" y2="390" stroke={P.detail} strokeWidth="1.5" />
    </svg>
  );
}

// ─── RearViewSVG ──────────────────────────────────────────────────────────────
// viewBox 440×420. Same proportions as front view.
// Rear window instead of windshield. Tail lights instead of headlights.
// License plate, exhaust pipes, rear bumper.

function RearViewSVG() {
  return (
    <svg viewBox="0 0 440 420" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

      {/* ── MAIN BODY SILHOUETTE ── same as front */}
      <path
        d={[
          'M 100 25',
          'L 340 25',
          'Q 380 25 400 60',
          'L 410 210',
          'L 415 240',
          'L 415 390',
          'L 365 390',
          'L 365 240',
          'L 75 240',
          'L 75 390',
          'L 25 390',
          'L 25 240',
          'L 30 210',
          'Q 40 60 100 25',
          'Z',
        ].join(' ')}
        fill={P.body}
        stroke={P.bodyStroke}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* ── REAR WINDOW ── same trapezoid as windshield */}
      <path
        d="M 80 210 L 100 25 L 340 25 L 360 210 Z"
        fill={P.glass}
        stroke={P.glassStroke}
        strokeWidth="1.5"
      />
      {/* Rear wiper */}
      <line x1="220" y1="200" x2="300" y2="185" stroke={P.detail} strokeWidth="1.5" />
      {/* C-pillars */}
      <line x1="80" y1="210" x2="100" y2="25" stroke={P.pillar} strokeWidth="4" />
      <line x1="360" y1="210" x2="340" y2="25" stroke={P.pillar} strokeWidth="4" />

      {/* ── TRUNK LID ── x=30..410, y=210..270 */}
      <rect x="30" y="210" width="380" height="60" fill={P.bg} stroke={P.bodyStroke} strokeWidth="1.5" />
      {/* Trunk center crease */}
      <line x1="220" y1="210" x2="220" y2="270" stroke={P.detail} strokeWidth="1.5" strokeDasharray="4,4" />
      {/* Trunk handle */}
      <rect x="185" y="258" width="70" height="10" rx="5" fill={P.detail} stroke={P.chassis} strokeWidth="1.5" />
      {/* Spoiler */}
      <rect x="80" y="22" width="280" height="8" rx="4" fill={P.bodyDark} stroke={P.bodyStroke} strokeWidth="1" />

      {/* ── TAIL LIGHTS ── full-width LED bar style */}
      {/* Left tail light: x=30..90, y=210..270 */}
      <path
        d="M 32 212 L 78 212 L 78 268 L 32 268 Q 28 268 28 264 L 28 216 Q 28 212 32 212 Z"
        fill={P.taillight}
        stroke={P.taillightS}
        strokeWidth="1.5"
      />
      <line x1="34" y1="222" x2="74" y2="222" stroke={P.taillightS} strokeWidth="3" strokeLinecap="round" />
      <line x1="34" y1="232" x2="74" y2="232" stroke={P.taillightS} strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="55" cy="252" rx="14" ry="10" fill={P.taillight} stroke={P.taillightS} strokeWidth="1" />

      {/* Right tail light: x=362..410, y=210..270 */}
      <path
        d="M 362 212 L 408 212 Q 412 212 412 216 L 412 264 Q 412 268 408 268 L 362 268 Z"
        fill={P.taillight}
        stroke={P.taillightS}
        strokeWidth="1.5"
      />
      <line x1="366" y1="222" x2="406" y2="222" stroke={P.taillightS} strokeWidth="3" strokeLinecap="round" />
      <line x1="366" y1="232" x2="406" y2="232" stroke={P.taillightS} strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="385" cy="252" rx="14" ry="10" fill={P.taillight} stroke={P.taillightS} strokeWidth="1" />

      {/* LED connecting strip */}
      <rect x="78" y="218" width="284" height="6" rx="3" fill={P.taillight} opacity="0.5" />

      {/* ── REAR BUMPER ── */}
      <path
        d="M 30 330 L 410 330 L 415 355 Q 415 390 390 390 L 50 390 Q 25 390 25 355 Z"
        fill={P.bg}
        stroke={P.bodyStroke}
        strokeWidth="1.5"
      />
      {/* Diffuser / lower bumper detail */}
      <rect x="75" y="340" width="290" height="35" rx="5" fill={P.bodyDark} stroke={P.bodyStroke} strokeWidth="1" />
      {/* Diffuser fins */}
      {[100, 130, 160, 190, 220, 250, 280, 310, 340].map((x) => (
        <line key={`df-${x}`} x1={x} y1="342" x2={x} y2="373" stroke={P.chassis} strokeWidth="1.5" />
      ))}

      {/* ── LICENSE PLATE ── x=160..280, y=270..300 */}
      <rect x="160" y="270" width="120" height="32" rx="4" fill={P.bg} stroke={P.detail} strokeWidth="2" />
      <rect x="165" y="274" width="110" height="24" rx="3" fill={P.accent} />
      <text x="220" y="291" textAnchor="middle" fontSize="10" fill={P.label} fontFamily="monospace" fontWeight="bold">SUV</text>

      {/* ── EXHAUST PIPES ── */}
      <ellipse cx="100" cy="382" rx="16" ry="7" fill={P.chassis} stroke={P.pillar} strokeWidth="1.5" />
      <ellipse cx="100" cy="382" rx="9" ry="4" fill={P.wheel} />
      <ellipse cx="340" cy="382" rx="16" ry="7" fill={P.chassis} stroke={P.pillar} strokeWidth="1.5" />
      <ellipse cx="340" cy="382" rx="9" ry="4" fill={P.wheel} />

      {/* ── WHEELS ── same as front view */}
      <rect x="25" y="240" width="50" height="150" rx="10" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="31" y="248" width="38" height="134" rx="7" fill={P.wheelRim} />
      <ellipse cx="50" cy="315" rx="14" ry="24" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1.5" />
      <line x1="50" y1="291" x2="50" y2="339" stroke={P.wheelSpoke} strokeWidth="3" />
      <line x1="36" y1="315" x2="64" y2="315" stroke={P.wheelSpoke} strokeWidth="3" />

      <rect x="365" y="240" width="50" height="150" rx="10" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="371" y="248" width="38" height="134" rx="7" fill={P.wheelRim} />
      <ellipse cx="390" cy="315" rx="14" ry="24" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1.5" />
      <line x1="390" y1="291" x2="390" y2="339" stroke={P.wheelSpoke} strokeWidth="3" />
      <line x1="376" y1="315" x2="404" y2="315" stroke={P.wheelSpoke} strokeWidth="3" />

      {/* ── SIDE MIRRORS ── */}
      <path d="M 8 150 L 30 145 L 30 175 L 8 175 Q 4 175 4 170 L 4 155 Q 4 150 8 150 Z"
        fill={P.mirror} stroke={P.bodyStroke} strokeWidth="1.5" />
      <path d="M 432 150 L 410 145 L 410 175 L 432 175 Q 436 175 436 170 L 436 155 Q 436 150 432 150 Z"
        fill={P.mirror} stroke={P.bodyStroke} strokeWidth="1.5" />

      {/* Ground line */}
      <line x1="25" y1="390" x2="415" y2="390" stroke={P.detail} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Zone definitions per view ────────────────────────────────────────────────
// IMPORTANT: Zone IDs are stable and must not be renamed (existing inspections reference them).
// Only x, y, w, h (percentages) are updated to match the new geometry.
// id, nombre, view are UNCHANGED.
//
// LATERAL (viewBox 1000×400):
//   Body x=30..970 → x%: 3..97
//   Beltline y=185 → y%: 185/400=46.25 ≈ 46
//   Body bottom y=295 → y%: 295/400=73.75 ≈ 74
//   Hood x=30..340 → x%: 3..34 (w=31)
//   Front door x=340..555 → x%: 34..55.5 (w=21.5 ≈ 22)
//   Rear door x=555..775 → x%: 55.5..77.5 (w=22)
//   Rear hatch x=775..970 → x%: 77.5..97 (w=19.5 ≈ 20)
//   Roof y=55..185 → y%: 13.75..46.25 (h=32.5 ≈ 33)
//   Estribo y=288..298 → y%: 72..74.5 (h=2.5) — use y=70, h=8 for clickability
//
// SUPERIOR (viewBox 1000×420):
//   Body x=30..970, y=65..355
//   Hood x=30..340 → x%: 3..34 (w=31)
//   Windshield x=340..460 → x%: 34..46 (w=12)
//   Roof x=460..860 → x%: 46..86 (w=40)
//   Rear window x=860..960 → x%: 86..96 (w=10)
//   Trunk x=960..970 → x%: 96..97 (w=1) — merge with maletero
//   Left side y=65..355 → y%: 15.5..84.5
//   Front door x=340..555 → x%: 34..55.5 (w=21.5 ≈ 22)
//   Rear door x=555..775 → x%: 55.5..77.5 (w=22)
//   Parachoques del x=30..145 → x%: 3..14.5 (w=11.5 ≈ 12)
//   Parachoques tra x=855..970 → x%: 85.5..97 (w=11.5 ≈ 12)
//
// FRONTAL (viewBox 440×420):
//   Body x=25..415, y=25..390
//   Windshield y=25..210 → y%: 5.95..50 (h=44)
//   Hood y=210..270 → y%: 50..64.3 (h=14.3 ≈ 14)
//   Headlights x=28..78 and x=362..412, y=210..270 → x%: 6.4..17.7 and 82.3..93.6
//   Grille y=270..330 → y%: 64.3..78.6 (h=14.3 ≈ 14)
//   Bumper y=330..390 → y%: 78.6..92.9 (h=14.3 ≈ 14)
//   Guardabarro izq x=25..75 → x%: 5.7..17 (w=11.4 ≈ 11)
//   Guardabarro der x=365..415 → x%: 83..94.3 (w=11.4 ≈ 11)
//
// TRASERA (viewBox 440×420): same proportions as frontal
//
// INFERIOR (viewBox 1000×420):
//   Motor x=65..370, y=118..196 → x%: 6.5..37 (w=30.5 ≈ 31), y%: 28..46.7 (h=18.7 ≈ 19)
//   Transmision x=370..540, y=140..214 → x%: 37..54 (w=17), y%: 33.3..51 (h=17.7 ≈ 18)
//   Tanque x=570..800, y=214..318 → x%: 57..80 (w=23), y%: 51..75.7 (h=24.7 ≈ 25)
//   Escape izq y≈128 → band x%: 10..90, y%: 28..35
//   Escape der y≈282 → band x%: 10..90, y%: 62..70
//   Dif del cx=215, cy=205 → x%: 14.5..24.5 (w=10), y%: 42..52 (h=10)
//   Dif tra cx=755, cy=205 → x%: 68.5..78.5 (w=10), y%: 42..52 (h=10)
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
  { id: 'sup-capo',      nombre: 'Capó',               x: 3,  y: 5,  w: 31, h: 90, view: 'superior' },
  { id: 'sup-techo',     nombre: 'Techo',               x: 46, y: 5,  w: 40, h: 90, view: 'superior' },
  { id: 'sup-maletero',  nombre: 'Maletero',            x: 86, y: 5,  w: 11, h: 90, view: 'superior' },
  { id: 'sup-puerta-di', nombre: 'Puerta Del. Izq.',    x: 34, y: 5,  w: 22, h: 11, view: 'superior' },
  { id: 'sup-puerta-dd', nombre: 'Puerta Del. Der.',    x: 34, y: 84, w: 22, h: 11, view: 'superior' },
  { id: 'sup-puerta-ti', nombre: 'Puerta Tra. Izq.',    x: 56, y: 5,  w: 22, h: 11, view: 'superior' },
  { id: 'sup-puerta-td', nombre: 'Puerta Tra. Der.',    x: 56, y: 84, w: 22, h: 11, view: 'superior' },
  { id: 'sup-para-del',  nombre: 'Parachoques Del.',    x: 3,  y: 5,  w: 12, h: 90, view: 'superior' },
  { id: 'sup-para-tra',  nombre: 'Parachoques Tra.',    x: 85, y: 5,  w: 12, h: 90, view: 'superior' },

  // ── Frontal view (viewBox 440×420) ────────────────────────────────────────
  { id: 'fro-bumper',     nombre: 'Parachoques Del.',      x: 6,  y: 79, w: 88, h: 14, view: 'frontal' },
  { id: 'fro-capo',       nombre: 'Capó',                  x: 6,  y: 50, w: 88, h: 14, view: 'frontal' },
  { id: 'fro-luz-izq',    nombre: 'Faro Izquierdo',        x: 6,  y: 50, w: 16, h: 14, view: 'frontal' },
  { id: 'fro-luz-der',    nombre: 'Faro Derecho',          x: 82, y: 50, w: 16, h: 14, view: 'frontal' },
  { id: 'fro-parabrisas', nombre: 'Parabrisas',            x: 18, y: 6,  w: 64, h: 44, view: 'frontal' },
  { id: 'fro-guar-izq',   nombre: 'Guardabarro Del. Izq.', x: 6,  y: 64, w: 11, h: 22, view: 'frontal' },
  { id: 'fro-guar-der',   nombre: 'Guardabarro Del. Der.', x: 83, y: 64, w: 11, h: 22, view: 'frontal' },

  // ── Trasera view (viewBox 440×420) ────────────────────────────────────────
  { id: 'tra-bumper',   nombre: 'Parachoques Tra.',      x: 6,  y: 79, w: 88, h: 14, view: 'trasera' },
  { id: 'tra-maletero', nombre: 'Maletero',              x: 6,  y: 50, w: 88, h: 14, view: 'trasera' },
  { id: 'tra-luz-izq',  nombre: 'Luz Tra. Izquierda',   x: 6,  y: 50, w: 16, h: 14, view: 'trasera' },
  { id: 'tra-luz-der',  nombre: 'Luz Tra. Derecha',     x: 82, y: 50, w: 16, h: 14, view: 'trasera' },
  { id: 'tra-luna',     nombre: 'Luna Trasera',         x: 18, y: 6,  w: 64, h: 44, view: 'trasera' },
  { id: 'tra-guar-izq', nombre: 'Guardabarro Tra. Izq.', x: 6,  y: 64, w: 11, h: 22, view: 'trasera' },
  { id: 'tra-guar-der', nombre: 'Guardabarro Tra. Der.', x: 83, y: 64, w: 11, h: 22, view: 'trasera' },

  // ── Lateral Izquierdo (viewBox 1000×400) ──────────────────────────────────
  { id: 'liz-capo',     nombre: 'Capó Izq.',            x: 3,  y: 46, w: 31, h: 28, view: 'lateral-izq' },
  { id: 'liz-puerta-d', nombre: 'Puerta Del. Izq.',     x: 34, y: 46, w: 22, h: 28, view: 'lateral-izq' },
  { id: 'liz-puerta-t', nombre: 'Puerta Tra. Izq.',     x: 56, y: 46, w: 22, h: 28, view: 'lateral-izq' },
  { id: 'liz-maletero', nombre: 'Maletero Izq.',        x: 78, y: 46, w: 19, h: 28, view: 'lateral-izq' },
  { id: 'liz-techo',    nombre: 'Techo Izq.',           x: 34, y: 14, w: 52, h: 32, view: 'lateral-izq' },
  { id: 'liz-estribo',  nombre: 'Estribo Izquierdo',    x: 34, y: 70, w: 44, h: 8,  view: 'lateral-izq' },

  // ── Lateral Derecho (viewBox 1000×400) ────────────────────────────────────
  // Mirror of liz-*: x' = 100 − x − w
  // liz-capo:     x=3,  w=31 → x'=100−3−31=66
  { id: 'lde-capo',     nombre: 'Capó Der.',            x: 66, y: 46, w: 31, h: 28, view: 'lateral-der' },
  // liz-puerta-d: x=34, w=22 → x'=100−34−22=44
  { id: 'lde-puerta-d', nombre: 'Puerta Del. Der.',     x: 44, y: 46, w: 22, h: 28, view: 'lateral-der' },
  // liz-puerta-t: x=56, w=22 → x'=100−56−22=22
  { id: 'lde-puerta-t', nombre: 'Puerta Tra. Der.',     x: 22, y: 46, w: 22, h: 28, view: 'lateral-der' },
  // liz-maletero: x=78, w=19 → x'=100−78−19=3
  { id: 'lde-maletero', nombre: 'Maletero Der.',        x: 3,  y: 46, w: 19, h: 28, view: 'lateral-der' },
  // liz-techo:    x=34, w=52 → x'=100−34−52=14
  { id: 'lde-techo',    nombre: 'Techo Der.',           x: 14, y: 14, w: 52, h: 32, view: 'lateral-der' },
  // liz-estribo:  x=34, w=44 → x'=100−34−44=22
  { id: 'lde-estribo',  nombre: 'Estribo Derecho',      x: 22, y: 70, w: 44, h: 8,  view: 'lateral-der' },

  // ── Inferior view (viewBox 1000×420) ──────────────────────────────────────
  { id: 'inf-motor',        nombre: 'Motor / Cárter',        x: 6,  y: 28, w: 31, h: 19, view: 'inferior' },
  { id: 'inf-transmision',  nombre: 'Transmisión / Caja',    x: 37, y: 33, w: 17, h: 18, view: 'inferior' },
  { id: 'inf-tanque',       nombre: 'Tanque de combustible', x: 57, y: 51, w: 23, h: 25, view: 'inferior' },
  { id: 'inf-escape-izq',   nombre: 'Escape Izquierdo',      x: 10, y: 28, w: 80, h: 7,  view: 'inferior' },
  { id: 'inf-escape-der',   nombre: 'Escape Derecho',        x: 10, y: 62, w: 80, h: 7,  view: 'inferior' },
  { id: 'inf-dif-del',      nombre: 'Diferencial Delantero', x: 15, y: 42, w: 10, h: 10, view: 'inferior' },
  { id: 'inf-dif-tra',      nombre: 'Diferencial Trasero',   x: 69, y: 42, w: 10, h: 10, view: 'inferior' },
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