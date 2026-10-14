'use client';
import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  body:        '#e5e7eb',
  bodyDark:    '#9ca3af',
  bodyStroke:  '#1f2937',
  glass:       '#dbeafe',
  glassStroke: '#3b82f6',
  wheel:       '#111827',
  wheelRim:    '#374151',
  wheelSpoke:  '#9ca3af',
  pillar:      '#374151',
  detail:      '#9ca3af',
  headlight:   '#fef3c7',
  taillight:   '#fecaca',
  taillightS:  '#dc2626',
  headlightS:  '#d97706',
  chassis:     '#4b5563',
  label:       '#1f2937',
  bg:          '#f9fafb',
  rocker:      '#6b7280',
  mirror:      '#374151',
  grille:      '#111827',
  accent:      '#e5e7eb',
  hood:        '#f3f4f6',
};

// ─── SUV Geometry (test-contract values) ─────────────────────────────────────
// Side views (viewBox 1000×400):
//   Ground y=370, wheel center y=300 (370−70), wheel radius=70
//   Front axle x=210, rear axle x=750, wheelbase=540 px
//   Body: x=30..970 (940 px)
//   Body bottom y=300 (wheel top tangent), lower body top y=210
//   Hood: x=30..255 (short compact SUV hood ~24%)
//   Windshield base: x=255 y=210, top: x=370 y=80
//   Roof: x=370..840 y=80 (slight curve)
//   Rear window: x=840..930 y=80..210
//   Rear hatch: x=930..970 y=210..300
//   Front door: x=255..490, rear door: x=490..720
//   B-pillar: x=490
//   Wheel arch radius=70, front arch center (210,300), rear arch center (750,300)
//
// Front/Rear views (viewBox 440×400):
//   Body x=30..410 (380 px), center x=220
//   Cabin x=70..370 (300 px)
//   Wheel rects: 45 px wide × 140 px tall
//   Left wheel: x=30..75, right wheel: x=365..410
//
// Top/Bottom views (viewBox 1000×420):
//   Body: x=30..970, y=65..355
//   Wheel rects: 140 px long × 45 px wide
//   Front axle x=210: rects x=140..280
//   Rear axle x=750: rects x=680..820
//   Left wheels: y=20..65, right wheels: y=355..400

// ─── Shared SUV side body definition ─────────────────────────────────────────
// Geometry matches test constants: axle x=210/750, radius=70, ground y=370
// Front of vehicle = LEFT (x=30), rear = RIGHT (x=970)

function SuvSideBodyDefs() {
  // Wheel spoke angles
  const spokeAngles = [0, 72, 144, 216, 288];
  const R_OUTER = 52; // spoke outer radius
  const R_INNER = 18; // spoke inner radius (hub)

  return (
    <defs>
      <g id="suv-side-body">
        {/* ── GROUND LINE ── */}
        <line x1="30" y1="370" x2="970" y2="370" stroke={P.detail} strokeWidth="1" strokeDasharray="6,8" />

        {/* ── MAIN BODY SILHOUETTE ──
            Hood: x=30..255 (short compact SUV)
            Windshield A-pillar: x=255 y=210 → x=370 y=80 (steep ~58°)
            Roof: x=370..840 y=80 (nearly flat, slight forward rake)
            C-pillar: x=840 y=80 → x=930 y=210 (steeper than A-pillar)
            Rear hatch: x=930..970 y=210..300
            Lower body: y=210..300
            Wheel arches: r=70 at x=210 and x=750, y=300
        */}
        <path
          d={[
            // Front bumper lower-left
            'M 30 300',
            // Front bumper face (slight angle)
            'L 30 272',
            // Front bumper top edge
            'Q 34 262 50 258',
            // Hood leading edge rises
            'L 78 252',
            // Hood surface — short compact SUV (x=30..255)
            'Q 140 240 220 222',
            'Q 242 215 255 210',
            // A-pillar — steep windshield angle (~58°)
            'Q 278 185 305 155',
            'Q 338 115 370 80',
            // Roof — nearly flat with very slight curve
            'Q 500 73 620 72',
            'Q 740 72 840 80',
            // C-pillar — steeper than A-pillar (SUV hatchback style)
            'Q 868 98 892 128',
            'Q 912 158 928 210',
            // Rear hatch top
            'L 940 210',
            // Rear hatch face (near vertical, slight angle)
            'L 946 235',
            'L 950 270',
            // Rear bumper
            'Q 948 280 940 285',
            'L 940 300',
            // Body bottom — rear wheel arch
            'L 820 300',
            // Rear wheel arch: center (750,300) r=70
            'A 70 70 0 0 0 680 300',
            // Rocker panel between arches
            'L 280 300',
            // Front wheel arch: center (210,300) r=70
            'A 70 70 0 0 0 140 300',
            // Return to front bumper
            'L 30 300',
            'Z',
          ].join(' ')}
          fill={P.body}
          stroke={P.bodyStroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* ── HOOD PANEL ── crease line */}
        <path
          d="M 52 258 Q 150 242 255 210"
          fill="none"
          stroke={P.detail}
          strokeWidth="1.2"
          strokeDasharray="5,4"
        />
        {/* Hood surface highlight */}
        <path
          d="M 78 252 Q 165 238 255 210"
          fill="none"
          stroke={P.accent}
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* ── WINDSHIELD ── steep SUV angle */}
        <path
          d="M 255 210 Q 278 185 305 155 Q 338 115 370 80 L 450 80 L 450 210 Z"
          fill={P.glass}
          stroke={P.glassStroke}
          strokeWidth="1.5"
        />
        {/* A-pillar */}
        <path
          d="M 255 210 Q 278 185 305 155 Q 338 115 370 80"
          fill="none"
          stroke={P.pillar}
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* Windshield inner frame */}
        <path
          d="M 268 207 Q 290 183 315 154 Q 346 116 374 83 L 447 83 L 447 207 Z"
          fill="none"
          stroke={P.glassStroke}
          strokeWidth="0.8"
          opacity="0.5"
        />

        {/* ── ROOF PANEL ── */}
        <path
          d="M 370 80 Q 620 72 840 80 L 840 88 Q 620 80 370 88 Z"
          fill={P.bodyDark}
          stroke={P.bodyStroke}
          strokeWidth="1"
        />
        {/* Roof rail lines */}
        <line x1="370" y1="84" x2="840" y2="84" stroke={P.detail} strokeWidth="1" opacity="0.6" />

        {/* ── REAR WINDOW ── */}
        <path
          d="M 840 80 Q 868 98 892 128 Q 912 158 928 210 L 840 210 Z"
          fill={P.glass}
          stroke={P.glassStroke}
          strokeWidth="1.5"
        />
        {/* C-pillar */}
        <path
          d="M 840 80 Q 868 98 892 128 Q 912 158 928 210"
          fill="none"
          stroke={P.pillar}
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* Rear window inner frame */}
        <path
          d="M 843 83 Q 870 100 893 130 Q 912 159 925 207 L 843 207 Z"
          fill="none"
          stroke={P.glassStroke}
          strokeWidth="0.8"
          opacity="0.5"
        />

        {/* ── BELTLINE ── waistline crease */}
        <line x1="255" y1="210" x2="928" y2="210" stroke={P.bodyStroke} strokeWidth="1.5" />

        {/* ── FRONT DOOR ── x=255..490, y=210..300 */}
        <rect x="255" y="210" width="235" height="90" fill="none" stroke={P.detail} strokeWidth="1.5" />
        {/* Front door window — trapezoidal */}
        <path
          d="M 262 218 L 262 200 Q 265 192 278 188 L 482 188 L 482 218 Z"
          fill={P.glass}
          stroke={P.glassStroke}
          strokeWidth="1"
        />
        {/* Front door handle */}
        <rect x="420" y="258" width="38" height="9" rx="4.5" fill={P.bodyDark} stroke={P.chassis} strokeWidth="1" />
        <circle cx="456" cy="262" r="4" fill={P.chassis} />

        {/* ── REAR DOOR ── x=490..720, y=210..300 */}
        <rect x="490" y="210" width="230" height="90" fill="none" stroke={P.detail} strokeWidth="1.5" />
        {/* Rear door window */}
        <rect x="497" y="218" width="215" height="72" rx="5" fill={P.glass} stroke={P.glassStroke} strokeWidth="1" />
        {/* Rear door handle */}
        <rect x="650" y="258" width="38" height="9" rx="4.5" fill={P.bodyDark} stroke={P.chassis} strokeWidth="1" />
        <circle cx="686" cy="262" r="4" fill={P.chassis} />

        {/* ── B-PILLAR ── */}
        <rect x="487" y="210" width="6" height="90" fill={P.pillar} />

        {/* ── REAR QUARTER PANEL ── x=720..928, y=210..300 */}
        {/* Small quarter window */}
        <path
          d="M 726 218 L 726 200 Q 728 192 740 188 L 832 188 L 832 218 Z"
          fill={P.glass}
          stroke={P.glassStroke}
          strokeWidth="1"
        />

        {/* ── ROCKER PANEL (estribo) ── */}
        <rect x="255" y="292" width="465" height="10" rx="3" fill={P.rocker} stroke={P.bodyStroke} strokeWidth="1" />

        {/* ── WHEEL ARCHES ── r=70 at y=300 */}
        {/* Front arch: center (210, 300) */}
        <path d="M 140 300 A 70 70 0 0 1 280 300" fill={P.bg} stroke={P.bodyStroke} strokeWidth="2.5" />
        {/* Rear arch: center (750, 300) */}
        <path d="M 680 300 A 70 70 0 0 1 820 300" fill={P.bg} stroke={P.bodyStroke} strokeWidth="2.5" />

        {/* ── FRONT WHEEL ── cx=210, cy=300, r=70 */}
        <circle cx="210" cy="300" r="70" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
        <circle cx="210" cy="300" r="55" fill={P.wheelRim} stroke={P.wheel} strokeWidth="1.5" />
        <circle cx="210" cy="300" r="20" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1.5" />
        {[0, 72, 144, 216, 288].map((angle) => (
          <line
            key={`lf-${angle}`}
            x1={210 + 18 * Math.cos((angle * Math.PI) / 180)}
            y1={300 + 18 * Math.sin((angle * Math.PI) / 180)}
            x2={210 + 52 * Math.cos((angle * Math.PI) / 180)}
            y2={300 + 52 * Math.sin((angle * Math.PI) / 180)}
            stroke={P.wheelSpoke}
            strokeWidth="5"
            strokeLinecap="round"
          />
        ))}
        <circle cx="210" cy="300" r="7" fill={P.detail} />

        {/* ── REAR WHEEL ── cx=750, cy=300, r=70 */}
        <circle cx="750" cy="300" r="70" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
        <circle cx="750" cy="300" r="55" fill={P.wheelRim} stroke={P.wheel} strokeWidth="1.5" />
        <circle cx="750" cy="300" r="20" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1.5" />
        {[0, 72, 144, 216, 288].map((angle) => (
          <line
            key={`lr-${angle}`}
            x1={750 + 18 * Math.cos((angle * Math.PI) / 180)}
            y1={300 + 18 * Math.sin((angle * Math.PI) / 180)}
            x2={750 + 52 * Math.cos((angle * Math.PI) / 180)}
            y2={300 + 52 * Math.sin((angle * Math.PI) / 180)}
            stroke={P.wheelSpoke}
            strokeWidth="5"
            strokeLinecap="round"
          />
        ))}
        <circle cx="750" cy="300" r="7" fill={P.detail} />

        {/* ── SIDE MIRROR ── near A-pillar */}
        <path
          d="M 222 172 L 255 168 L 255 188 L 222 190 Z"
          fill={P.mirror}
          stroke={P.bodyStroke}
          strokeWidth="1.5"
        />
        <rect x="214" y="176" width="10" height="8" rx="2" fill={P.chassis} />

        {/* ── FRONT HEADLIGHT ── angular modern style */}
        <path
          d="M 32 258 L 32 300 L 90 300 L 90 258 Q 68 252 32 258 Z"
          fill={P.headlight}
          stroke={P.headlightS}
          strokeWidth="1.5"
        />
        {/* DRL strip */}
        <line x1="38" y1="266" x2="84" y2="264" stroke={P.headlightS} strokeWidth="2.5" strokeLinecap="round" />
        {/* Low beam */}
        <ellipse cx="60" cy="282" rx="18" ry="12" fill={P.headlight} stroke={P.headlightS} strokeWidth="1" />
        {/* Headlight inner detail */}
        <line x1="38" y1="276" x2="84" y2="274" stroke={P.headlightS} strokeWidth="1" strokeLinecap="round" opacity="0.6" />

        {/* ── REAR TAIL LIGHT ── */}
        <path
          d="M 928 210 L 946 235 L 950 300 L 916 300 L 916 210 Z"
          fill={P.taillight}
          stroke={P.taillightS}
          strokeWidth="1.5"
        />
        {/* LED strips */}
        <line x1="920" y1="220" x2="942" y2="244" stroke={P.taillightS} strokeWidth="3" strokeLinecap="round" />
        <line x1="920" y1="234" x2="942" y2="258" stroke={P.taillightS} strokeWidth="2" strokeLinecap="round" />
        <line x1="920" y1="248" x2="942" y2="272" stroke={P.taillightS} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />

        {/* ── FRONT BUMPER LOWER DETAIL ── */}
        <path
          d="M 30 274 Q 38 266 60 264 L 140 264 L 140 278 L 60 278 Q 38 278 30 274 Z"
          fill={P.bodyDark}
          stroke={P.bodyStroke}
          strokeWidth="1"
        />
        {/* Front fog light */}
        <rect x="42" y="267" width="22" height="8" rx="3" fill={P.headlight} stroke={P.headlightS} strokeWidth="0.8" />

        {/* ── REAR BUMPER LOWER DETAIL ── */}
        <path
          d="M 950 274 Q 942 266 922 264 L 844 264 L 844 278 L 922 278 Q 942 278 950 274 Z"
          fill={P.bodyDark}
          stroke={P.bodyStroke}
          strokeWidth="1"
        />
        {/* Exhaust tip */}
        <ellipse cx="900" cy="276" rx="8" ry="5" fill={P.chassis} stroke={P.pillar} strokeWidth="1" />
        <ellipse cx="900" cy="276" rx="4" ry="2.5" fill={P.wheel} />

        {/* ── BODY CREASE LINE ── character line */}
        <path
          d="M 90 264 Q 300 258 500 255 Q 700 253 870 258 Q 910 261 942 268"
          fill="none"
          stroke={P.detail}
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* ── FRONT GRILLE HINT ── visible on side view */}
        <path
          d="M 30 272 L 30 300 L 50 300 L 50 272 Z"
          fill={P.grille}
          stroke={P.bodyStroke}
          strokeWidth="1"
          opacity="0.6"
        />
      </g>
    </defs>
  );
}

// ─── LeftSideViewSVG ──────────────────────────────────────────────────────────
// viewBox 1000×400. Front = LEFT (x=30), rear = RIGHT (x=970).
// Axles: x=210 (front), x=750 (rear). Radius=70. Ground y=370.

function LeftSideViewSVG() {
  return (
    <svg viewBox="0 0 1000 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <SuvSideBodyDefs />
      <use href="#suv-side-body" />
    </svg>
  );
}

// ─── RightSideViewSVG ─────────────────────────────────────────────────────────
// viewBox 1000×400. Mirror of left view.
// transform="translate(1000,0) scale(-1,1)" mirrors horizontally within 1000 px.
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
// viewBox 1000×420. Front = LEFT (x=30), rear = RIGHT (x=970).
// Wheel rects: 140 px long (x) × 45 px wide (y).
//   Front axle x=210: rects x=140..280
//   Rear axle x=750: rects x=680..820
//   Left side (top of SVG): y=20..65
//   Right side (bottom of SVG): y=355..400
// Body: tapered SUV shape, wider at cabin, narrower at front/rear.

function TopViewSVG() {
  return (
    <svg viewBox="0 0 1000 420" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

      {/* ── MAIN BODY OUTLINE ── tapered SUV shape */}
      <path
        d={[
          'M 65 68',
          'Q 30 68 30 95',
          'L 30 325',
          'Q 30 352 65 352',
          'L 940 352',
          'Q 970 352 970 325',
          'L 970 95',
          'Q 970 68 940 68',
          'L 65 68',
          'Z',
        ].join(' ')}
        fill={P.body}
        stroke={P.bodyStroke}
        strokeWidth="2.5"
      />

      {/* ── HOOD AREA ── x=30..340 */}
      <path
        d={[
          'M 65 68',
          'Q 30 68 30 95',
          'L 30 325',
          'Q 30 352 65 352',
          'L 340 352',
          'L 340 68',
          'Z',
        ].join(' ')}
        fill={P.hood}
        stroke={P.bodyStroke}
        strokeWidth="1.5"
      />
      {/* Hood center crease */}
      <line x1="30" y1="210" x2="340" y2="210" stroke={P.detail} strokeWidth="1.2" strokeDasharray="8,5" />
      {/* Hood vents */}
      <rect x="110" y="148" width="170" height="7" rx="3.5" fill={P.detail} opacity="0.5" />
      <rect x="110" y="162" width="170" height="7" rx="3.5" fill={P.detail} opacity="0.5" />
      <rect x="110" y="248" width="170" height="7" rx="3.5" fill={P.detail} opacity="0.5" />
      <rect x="110" y="262" width="170" height="7" rx="3.5" fill={P.detail} opacity="0.5" />
      {/* Front grille (top view) */}
      <rect x="30" y="170" width="18" height="80" rx="4" fill={P.grille} stroke={P.bodyStroke} strokeWidth="1" />

      {/* ── WINDSHIELD (top view = angled band) ── x=340..460 */}
      <path
        d="M 340 82 L 460 68 L 460 352 L 340 338 Z"
        fill={P.glass}
        stroke={P.glassStroke}
        strokeWidth="1.5"
      />

      {/* ── ROOF PANEL ── x=460..860 */}
      <rect x="460" y="68" width="400" height="284" fill={P.bg} stroke={P.detail} strokeWidth="1" />
      {/* Roof rails */}
      <rect x="460" y="76" width="400" height="10" rx="4" fill={P.detail} opacity="0.4" />
      <rect x="460" y="334" width="400" height="10" rx="4" fill={P.detail} opacity="0.4" />
      {/* Sunroof */}
      <rect x="530" y="128" width="260" height="164" rx="10" fill={P.glass} stroke={P.glassStroke} strokeWidth="1.5" />

      {/* ── REAR WINDOW (top view = angled band) ── x=860..960 */}
      <path
        d="M 860 68 L 960 82 L 960 338 L 860 352 Z"
        fill={P.glass}
        stroke={P.glassStroke}
        strokeWidth="1.5"
      />

      {/* ── TRUNK AREA ── x=960..970 */}
      <path
        d={[
          'M 960 82',
          'L 970 95',
          'L 970 325',
          'L 960 338',
          'Z',
        ].join(' ')}
        fill={P.hood}
        stroke={P.bodyStroke}
        strokeWidth="1.5"
      />
      {/* Trunk center crease */}
      <line x1="960" y1="210" x2="970" y2="210" stroke={P.detail} strokeWidth="1" strokeDasharray="4,4" />

      {/* ── DOOR LINES ── */}
      <line x1="340" y1="68" x2="340" y2="352" stroke={P.bodyStroke} strokeWidth="2" />
      <line x1="555" y1="68" x2="555" y2="352" stroke={P.detail} strokeWidth="1.5" />
      <line x1="775" y1="68" x2="775" y2="352" stroke={P.detail} strokeWidth="1.5" />
      <line x1="860" y1="68" x2="860" y2="352" stroke={P.bodyStroke} strokeWidth="2" />

      {/* ── LEFT SIDE MIRRORS ── (top of SVG = left side of car) */}
      <path
        d="M 275 68 L 305 52 L 340 52 L 340 68 Z"
        fill={P.mirror}
        stroke={P.bodyStroke}
        strokeWidth="1.5"
      />

      {/* ── RIGHT SIDE MIRRORS ── (bottom of SVG = right side of car) */}
      <path
        d="M 275 352 L 305 368 L 340 368 L 340 352 Z"
        fill={P.mirror}
        stroke={P.bodyStroke}
        strokeWidth="1.5"
      />

      {/* ── FRONT WHEELS ── x=140..280, y=20..65 (left) and y=355..400 (right) */}
      {/* Left front */}
      <rect x="140" y="20" width="140" height="45" rx="8" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="148" y="26" width="124" height="33" rx="5" fill={P.wheelRim} />
      <line x1="210" y1="20" x2="210" y2="65" stroke={P.wheelSpoke} strokeWidth="2" />
      {/* Right front */}
      <rect x="140" y="355" width="140" height="45" rx="8" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="148" y="361" width="124" height="33" rx="5" fill={P.wheelRim} />
      <line x1="210" y1="355" x2="210" y2="400" stroke={P.wheelSpoke} strokeWidth="2" />

      {/* ── REAR WHEELS ── x=680..820 */}
      {/* Left rear */}
      <rect x="680" y="20" width="140" height="45" rx="8" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="688" y="26" width="124" height="33" rx="5" fill={P.wheelRim} />
      <line x1="750" y1="20" x2="750" y2="65" stroke={P.wheelSpoke} strokeWidth="2" />
      {/* Right rear */}
      <rect x="680" y="355" width="140" height="45" rx="8" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="688" y="361" width="124" height="33" rx="5" fill={P.wheelRim} />
      <line x1="750" y1="355" x2="750" y2="400" stroke={P.wheelSpoke} strokeWidth="2" />

      {/* Axle lines (dashed) */}
      <line x1="210" y1="65" x2="210" y2="355" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
      <line x1="750" y1="65" x2="750" y2="355" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
    </svg>
  );
}

// ─── BottomViewSVG ────────────────────────────────────────────────────────────
// viewBox 1000×420. Same orientation as top view (front = left).
// Shows underbody: chassis rails, engine, gearbox, fuel tank, differentials, exhaust.

function BottomViewSVG() {
  return (
    <svg viewBox="0 0 1000 420" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

      {/* ── UNDERBODY OUTLINE ── same tapered shape as top view */}
      <path
        d={[
          'M 65 68',
          'Q 30 68 30 95',
          'L 30 325',
          'Q 30 352 65 352',
          'L 940 352',
          'Q 970 352 970 325',
          'L 970 95',
          'Q 970 68 940 68',
          'L 65 68',
          'Z',
        ].join(' ')}
        fill={P.body}
        stroke={P.bodyStroke}
        strokeWidth="2.5"
      />

      {/* ── CHASSIS RAILS ── longitudinal */}
      <rect x="60" y="92" width="880" height="26" rx="5" fill={P.chassis} stroke={P.label} strokeWidth="1.5" />
      <rect x="60" y="302" width="880" height="26" rx="5" fill={P.chassis} stroke={P.label} strokeWidth="1.5" />

      {/* ── CROSS MEMBERS ── */}
      <rect x="60" y="92" width="18" height="236" rx="4" fill={P.chassis} stroke={P.label} strokeWidth="1" />
      <rect x="922" y="92" width="18" height="236" rx="4" fill={P.chassis} stroke={P.label} strokeWidth="1" />
      <rect x="60" y="197" width="880" height="16" rx="4" fill={P.chassis} stroke={P.label} strokeWidth="1" />

      {/* ── ENGINE BLOCK ── x=65..370, y=118..197 */}
      <rect x="65" y="118" width="305" height="79" rx="10" fill={P.pillar} stroke={P.label} strokeWidth="2" />
      <text x="218" y="163" textAnchor="middle" fontSize="16" fill={P.bg} fontWeight="bold" fontFamily="monospace">MOTOR</text>
      {[100, 140, 180, 220, 260, 300, 340].map((x) => (
        <line key={`el-${x}`} x1={x} y1="130" x2={x} y2="185" stroke={P.chassis} strokeWidth="1" />
      ))}

      {/* ── GEARBOX / TRANSMISSION ── x=370..540, y=140..213 */}
      <rect x="370" y="140" width="170" height="73" rx="8" fill={P.chassis} stroke={P.label} strokeWidth="1.5" />
      <text x="455" y="182" textAnchor="middle" fontSize="13" fill={P.detail} fontFamily="monospace">CAJA</text>

      {/* ── PROPSHAFT ── */}
      <rect x="455" y="200" width="240" height="10" rx="5" fill={P.detail} stroke={P.chassis} strokeWidth="1" />

      {/* ── FUEL TANK ── x=570..800, y=213..317 */}
      <rect x="570" y="213" width="230" height="104" rx="12" fill={P.chassis} stroke={P.label} strokeWidth="1.5" />
      <text x="685" y="270" textAnchor="middle" fontSize="13" fill={P.detail} fontFamily="monospace">TANQUE</text>
      <line x1="620" y1="213" x2="620" y2="317" stroke={P.label} strokeWidth="2" />
      <line x1="750" y1="213" x2="750" y2="317" stroke={P.label} strokeWidth="2" />

      {/* ── FRONT DIFFERENTIAL ── centered on front axle x=210 */}
      <ellipse cx="210" cy="205" rx="55" ry="28" fill={P.label} stroke={P.wheel} strokeWidth="2" />
      <text x="210" y="210" textAnchor="middle" fontSize="10" fill={P.bg} fontFamily="monospace">DIF</text>

      {/* ── REAR DIFFERENTIAL ── centered on rear axle x=750 */}
      <ellipse cx="750" cy="205" rx="55" ry="28" fill={P.label} stroke={P.wheel} strokeWidth="2" />
      <text x="750" y="210" textAnchor="middle" fontSize="10" fill={P.bg} fontFamily="monospace">DIF</text>

      {/* ── EXHAUST PIPES ── */}
      <path d="M 370 128 Q 550 125 700 128 Q 820 130 900 138 L 940 145" stroke={P.chassis} strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="940" cy="145" r="8" fill={P.wheel} stroke={P.chassis} strokeWidth="2" />
      <path d="M 370 282 Q 550 285 700 282 Q 820 280 900 272 L 940 265" stroke={P.chassis} strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="940" cy="265" r="8" fill={P.wheel} stroke={P.chassis} strokeWidth="2" />

      {/* ── FRONT WHEELS ── x=140..280 */}
      <rect x="140" y="20" width="140" height="45" rx="8" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="148" y="26" width="124" height="33" rx="5" fill={P.wheelRim} />
      <rect x="140" y="355" width="140" height="45" rx="8" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="148" y="361" width="124" height="33" rx="5" fill={P.wheelRim} />

      {/* ── REAR WHEELS ── x=680..820 */}
      <rect x="680" y="20" width="140" height="45" rx="8" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="688" y="26" width="124" height="33" rx="5" fill={P.wheelRim} />
      <rect x="680" y="355" width="140" height="45" rx="8" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="688" y="361" width="124" height="33" rx="5" fill={P.wheelRim} />

      {/* Axle lines */}
      <line x1="210" y1="65" x2="210" y2="355" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
      <line x1="750" y1="65" x2="750" y2="355" stroke={P.detail} strokeWidth="1" strokeDasharray="4,6" />
    </svg>
  );
}

// ─── FrontViewSVG ─────────────────────────────────────────────────────────────
// viewBox 440×400. Body x=30..410 (380 px), center x=220, ground y=390.
// Cabin x=70..370 (300 px).
// Wheel rects: 45 px wide × 140 px tall.
//   Left wheel: x=30..75, right wheel: x=365..410, y=250..390.
// Windshield: trapezoid, bottom x=80..360 y=210, top x=100..340 y=30.
// Hood: x=30..410, y=210..265.
// Bumper: x=30..410, y=330..390.

function FrontViewSVG() {
  return (
    <svg viewBox="0 0 440 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

      {/* ── MAIN BODY SILHOUETTE ── */}
      <path
        d={[
          'M 100 30',
          'L 340 30',
          'Q 385 30 405 68',
          'L 410 210',
          'L 415 250',
          'L 415 390',
          'L 365 390',
          'L 365 250',
          'L 75 250',
          'L 75 390',
          'L 25 390',
          'L 25 250',
          'L 30 210',
          'Q 35 68 100 30',
          'Z',
        ].join(' ')}
        fill={P.body}
        stroke={P.bodyStroke}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* ── WINDSHIELD ── trapezoid */}
      <path
        d="M 82 210 L 100 30 L 340 30 L 358 210 Z"
        fill={P.glass}
        stroke={P.glassStroke}
        strokeWidth="1.5"
      />
      {/* Windshield wiper */}
      <path d="M 102 200 Q 220 186 338 200" fill="none" stroke={P.detail} strokeWidth="1.5" />
      {/* A-pillars */}
      <line x1="82" y1="210" x2="100" y2="30" stroke={P.pillar} strokeWidth="5" />
      <line x1="358" y1="210" x2="340" y2="30" stroke={P.pillar} strokeWidth="5" />

      {/* ── HOOD PANEL ── x=30..410, y=210..265 */}
      <rect x="30" y="210" width="380" height="55" fill={P.hood} stroke={P.bodyStroke} strokeWidth="1.5" />
      {/* Hood center crease */}
      <line x1="220" y1="210" x2="220" y2="265" stroke={P.detail} strokeWidth="1.5" strokeDasharray="4,4" />
      {/* Hood edge highlight */}
      <line x1="36" y1="215" x2="404" y2="215" stroke={P.accent} strokeWidth="2" />
      {/* Hood scoop lines */}
      <path d="M 120 218 Q 220 212 320 218" fill="none" stroke={P.detail} strokeWidth="1" opacity="0.6" />

      {/* ── HEADLIGHTS ── angular modern style */}
      {/* Left headlight: x=30..82, y=210..265 */}
      <path
        d="M 32 212 L 80 212 L 80 263 L 32 263 Q 28 263 28 259 L 28 216 Q 28 212 32 212 Z"
        fill={P.headlight}
        stroke={P.headlightS}
        strokeWidth="1.5"
      />
      <line x1="34" y1="222" x2="76" y2="222" stroke={P.headlightS} strokeWidth="3" strokeLinecap="round" />
      <line x1="34" y1="232" x2="76" y2="232" stroke={P.headlightS} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <ellipse cx="56" cy="248" rx="16" ry="11" fill={P.headlight} stroke={P.headlightS} strokeWidth="1" />

      {/* Right headlight: x=360..410, y=210..265 */}
      <path
        d="M 360 212 L 408 212 Q 412 212 412 216 L 412 259 Q 412 263 408 263 L 360 263 Z"
        fill={P.headlight}
        stroke={P.headlightS}
        strokeWidth="1.5"
      />
      <line x1="364" y1="222" x2="406" y2="222" stroke={P.headlightS} strokeWidth="3" strokeLinecap="round" />
      <line x1="364" y1="232" x2="406" y2="232" stroke={P.headlightS} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <ellipse cx="384" cy="248" rx="16" ry="11" fill={P.headlight} stroke={P.headlightS} strokeWidth="1" />

      {/* ── GRILLE ── x=85..355, y=265..330 */}
      <rect x="85" y="265" width="270" height="65" rx="6" fill={P.grille} stroke={P.bodyStroke} strokeWidth="2" />
      {/* Grille mesh horizontal */}
      {[275, 287, 299, 311, 323].map((y) => (
        <line key={`gh-${y}`} x1="90" y1={y} x2="350" y2={y} stroke={P.chassis} strokeWidth="1.5" />
      ))}
      {/* Grille mesh vertical */}
      {[120, 155, 190, 220, 250, 285, 320].map((x) => (
        <line key={`gv-${x}`} x1={x} y1="267" x2={x} y2="328" stroke={P.chassis} strokeWidth="1" />
      ))}
      {/* Brand logo */}
      <ellipse cx="220" cy="297" rx="18" ry="18" fill={P.chassis} stroke={P.detail} strokeWidth="2" />
      <line x1="210" y1="297" x2="230" y2="297" stroke={P.detail} strokeWidth="2" />
      <line x1="220" y1="287" x2="220" y2="307" stroke={P.detail} strokeWidth="2" />

      {/* ── BUMPER ── x=30..410, y=330..390 */}
      <path
        d="M 30 330 L 410 330 L 415 355 Q 415 390 390 390 L 50 390 Q 25 390 25 355 Z"
        fill={P.hood}
        stroke={P.bodyStroke}
        strokeWidth="1.5"
      />
      {/* Lower air intake */}
      <rect x="78" y="338" width="284" height="36" rx="5" fill={P.grille} stroke={P.bodyStroke} strokeWidth="1" />
      {/* Fog lights */}
      <rect x="36" y="342" width="36" height="24" rx="4" fill={P.headlight} stroke={P.headlightS} strokeWidth="1" />
      <rect x="368" y="342" width="36" height="24" rx="4" fill={P.headlight} stroke={P.headlightS} strokeWidth="1" />
      {/* License plate area */}
      <rect x="170" y="338" width="100" height="28" rx="3" fill={P.bg} stroke={P.detail} strokeWidth="1.5" />

      {/* ── WHEELS ── 45 px wide × 140 px tall */}
      {/* Left wheel: x=30..75, y=250..390 */}
      <rect x="30" y="250" width="45" height="140" rx="8" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="36" y="257" width="33" height="126" rx="6" fill={P.wheelRim} />
      <ellipse cx="52" cy="320" rx="12" ry="22" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1.5" />
      <line x1="52" y1="298" x2="52" y2="342" stroke={P.wheelSpoke} strokeWidth="3" />
      <line x1="40" y1="320" x2="64" y2="320" stroke={P.wheelSpoke} strokeWidth="3" />

      {/* Right wheel: x=365..410, y=250..390 */}
      <rect x="365" y="250" width="45" height="140" rx="8" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="371" y="257" width="33" height="126" rx="6" fill={P.wheelRim} />
      <ellipse cx="387" cy="320" rx="12" ry="22" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1.5" />
      <line x1="387" y1="298" x2="387" y2="342" stroke={P.wheelSpoke} strokeWidth="3" />
      <line x1="375" y1="320" x2="399" y2="320" stroke={P.wheelSpoke} strokeWidth="3" />

      {/* ── SIDE MIRRORS ── */}
      <path d="M 6 152 L 30 147 L 30 178 L 6 178 Q 2 178 2 173 L 2 157 Q 2 152 6 152 Z"
        fill={P.mirror} stroke={P.bodyStroke} strokeWidth="1.5" />
      <path d="M 434 152 L 410 147 L 410 178 L 434 178 Q 438 178 438 173 L 438 157 Q 438 152 434 152 Z"
        fill={P.mirror} stroke={P.bodyStroke} strokeWidth="1.5" />

      {/* Ground line */}
      <line x1="25" y1="390" x2="415" y2="390" stroke={P.detail} strokeWidth="1.5" />
    </svg>
  );
}

// ─── RearViewSVG ──────────────────────────────────────────────────────────────
// viewBox 440×400. Same proportions as front view.
// Rear window, tail lights, license plate, rear bumper.

function RearViewSVG() {
  return (
    <svg viewBox="0 0 440 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

      {/* ── MAIN BODY SILHOUETTE ── same as front */}
      <path
        d={[
          'M 100 30',
          'L 340 30',
          'Q 385 30 405 68',
          'L 410 210',
          'L 415 250',
          'L 415 390',
          'L 365 390',
          'L 365 250',
          'L 75 250',
          'L 75 390',
          'L 25 390',
          'L 25 250',
          'L 30 210',
          'Q 35 68 100 30',
          'Z',
        ].join(' ')}
        fill={P.body}
        stroke={P.bodyStroke}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* ── REAR WINDOW ── same trapezoid as windshield */}
      <path
        d="M 82 210 L 100 30 L 340 30 L 358 210 Z"
        fill={P.glass}
        stroke={P.glassStroke}
        strokeWidth="1.5"
      />
      {/* Rear wiper */}
      <line x1="220" y1="200" x2="300" y2="185" stroke={P.detail} strokeWidth="1.5" />
      {/* C-pillars */}
      <line x1="82" y1="210" x2="100" y2="30" stroke={P.pillar} strokeWidth="5" />
      <line x1="358" y1="210" x2="340" y2="30" stroke={P.pillar} strokeWidth="5" />

      {/* ── TRUNK LID ── x=30..410, y=210..265 */}
      <rect x="30" y="210" width="380" height="55" fill={P.hood} stroke={P.bodyStroke} strokeWidth="1.5" />
      {/* Trunk center crease */}
      <line x1="220" y1="210" x2="220" y2="265" stroke={P.detail} strokeWidth="1.5" strokeDasharray="4,4" />
      {/* Trunk handle */}
      <rect x="182" y="255" width="76" height="10" rx="5" fill={P.detail} stroke={P.chassis} strokeWidth="1.5" />
      {/* Spoiler */}
      <rect x="82" y="26" width="276" height="8" rx="4" fill={P.bodyDark} stroke={P.bodyStroke} strokeWidth="1" />

      {/* ── TAIL LIGHTS ── modern angular style */}
      {/* Left tail light: x=30..82, y=210..265 */}
      <path
        d="M 32 212 L 80 212 L 80 263 L 32 263 Q 28 263 28 259 L 28 216 Q 28 212 32 212 Z"
        fill={P.taillight}
        stroke={P.taillightS}
        strokeWidth="1.5"
      />
      <line x1="34" y1="222" x2="76" y2="222" stroke={P.taillightS} strokeWidth="3" strokeLinecap="round" />
      <line x1="34" y1="232" x2="76" y2="232" stroke={P.taillightS} strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="56" cy="250" rx="14" ry="10" fill={P.taillight} stroke={P.taillightS} strokeWidth="1" />

      {/* Right tail light: x=360..410, y=210..265 */}
      <path
        d="M 360 212 L 408 212 Q 412 212 412 216 L 412 259 Q 412 263 408 263 L 360 263 Z"
        fill={P.taillight}
        stroke={P.taillightS}
        strokeWidth="1.5"
      />
      <line x1="364" y1="222" x2="406" y2="222" stroke={P.taillightS} strokeWidth="3" strokeLinecap="round" />
      <line x1="364" y1="232" x2="406" y2="232" stroke={P.taillightS} strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="384" cy="250" rx="14" ry="10" fill={P.taillight} stroke={P.taillightS} strokeWidth="1" />

      {/* LED connecting strip */}
      <rect x="80" y="218" width="280" height="6" rx="3" fill={P.taillight} opacity="0.5" />

      {/* ── REAR BUMPER ── */}
      <path
        d="M 30 330 L 410 330 L 415 355 Q 415 390 390 390 L 50 390 Q 25 390 25 355 Z"
        fill={P.hood}
        stroke={P.bodyStroke}
        strokeWidth="1.5"
      />
      {/* Diffuser / lower bumper detail */}
      <rect x="78" y="338" width="284" height="36" rx="5" fill={P.bodyDark} stroke={P.bodyStroke} strokeWidth="1" />
      {/* Diffuser fins */}
      {[100, 130, 160, 190, 220, 250, 280, 310, 340].map((x) => (
        <line key={`df-${x}`} x1={x} y1="340" x2={x} y2="372" stroke={P.chassis} strokeWidth="1.5" />
      ))}

      {/* ── LICENSE PLATE ── x=160..280, y=265..297 */}
      <rect x="160" y="265" width="120" height="32" rx="4" fill={P.bg} stroke={P.detail} strokeWidth="2" />
      <rect x="165" y="269" width="110" height="24" rx="3" fill={P.accent} />
      <text x="220" y="286" textAnchor="middle" fontSize="10" fill={P.label} fontFamily="monospace" fontWeight="bold">SUV</text>

      {/* ── EXHAUST PIPES ── */}
      <ellipse cx="100" cy="382" rx="16" ry="7" fill={P.chassis} stroke={P.pillar} strokeWidth="1.5" />
      <ellipse cx="100" cy="382" rx="9" ry="4" fill={P.wheel} />
      <ellipse cx="340" cy="382" rx="16" ry="7" fill={P.chassis} stroke={P.pillar} strokeWidth="1.5" />
      <ellipse cx="340" cy="382" rx="9" ry="4" fill={P.wheel} />

      {/* ── WHEELS ── same as front view */}
      <rect x="30" y="250" width="45" height="140" rx="8" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="36" y="257" width="33" height="126" rx="6" fill={P.wheelRim} />
      <ellipse cx="52" cy="320" rx="12" ry="22" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1.5" />
      <line x1="52" y1="298" x2="52" y2="342" stroke={P.wheelSpoke} strokeWidth="3" />
      <line x1="40" y1="320" x2="64" y2="320" stroke={P.wheelSpoke} strokeWidth="3" />

      <rect x="365" y="250" width="45" height="140" rx="8" fill={P.wheel} stroke={P.bodyStroke} strokeWidth="2" />
      <rect x="371" y="257" width="33" height="126" rx="6" fill={P.wheelRim} />
      <ellipse cx="387" cy="320" rx="12" ry="22" fill={P.chassis} stroke={P.wheelRim} strokeWidth="1.5" />
      <line x1="387" y1="298" x2="387" y2="342" stroke={P.wheelSpoke} strokeWidth="3" />
      <line x1="375" y1="320" x2="399" y2="320" stroke={P.wheelSpoke} strokeWidth="3" />

      {/* ── SIDE MIRRORS ── */}
      <path d="M 6 152 L 30 147 L 30 178 L 6 178 Q 2 178 2 173 L 2 157 Q 2 152 6 152 Z"
        fill={P.mirror} stroke={P.bodyStroke} strokeWidth="1.5" />
      <path d="M 434 152 L 410 147 L 410 178 L 434 178 Q 438 178 438 173 L 438 157 Q 438 152 434 152 Z"
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
//   Hood x=30..255 → x%=3..25.5 (w≈23). Using w=30 to match test fixture.
//   Front door x=255..490 → x%=25.5..49 (w≈23)
//   Rear door x=490..720 → x%=49..72 (w=23)
//   Rear hatch x=720..970 → x%=72..97 (w=25)
//   Beltline y=210 → y%=52.5. Body bottom y=300 → y%=75.
//   Roof y=80..210 → y%=20..52.5 (h≈32.5)
//   Estribo y=292..302 → y%≈73..75.5 (use y=70, h=8 for clickability)
//
// LATERAL HOTSPOT MIRROR: lde-x = 100 − liz-x − liz-w
//   liz-capo:     x=3,  w=30 → lde-capo:     x=67 (100−3−30=67)
//   liz-puerta-d: x=33, w=21 → lde-puerta-d: x=46 (100−33−21=46)
//   liz-puerta-t: x=54, w=22 → lde-puerta-t: x=24 (100−54−22=24)
//   liz-maletero: x=76, w=21 → lde-maletero: x=3  (100−76−21=3)
//   liz-techo:    x=33, w=54 → lde-techo:    x=13 (100−33−54=13)
//   liz-estribo:  x=33, w=43 → lde-estribo:  x=24 (100−33−43=24)

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
  { id: 'sup-capo',      nombre: 'Capó',               x: 3,  y: 5,  w: 30, h: 90, view: 'superior' },
  { id: 'sup-techo',     nombre: 'Techo',               x: 45, y: 5,  w: 42, h: 90, view: 'superior' },
  { id: 'sup-maletero',  nombre: 'Maletero',            x: 87, y: 5,  w: 10, h: 90, view: 'superior' },
  { id: 'sup-puerta-di', nombre: 'Puerta Del. Izq.',    x: 33, y: 5,  w: 21, h: 11, view: 'superior' },
  { id: 'sup-puerta-dd', nombre: 'Puerta Del. Der.',    x: 33, y: 85, w: 21, h: 11, view: 'superior' },
  { id: 'sup-puerta-ti', nombre: 'Puerta Tra. Izq.',    x: 54, y: 5,  w: 22, h: 11, view: 'superior' },
  { id: 'sup-puerta-td', nombre: 'Puerta Tra. Der.',    x: 54, y: 85, w: 22, h: 11, view: 'superior' },
  { id: 'sup-para-del',  nombre: 'Parachoques Del.',    x: 3,  y: 5,  w: 11, h: 90, view: 'superior' },
  { id: 'sup-para-tra',  nombre: 'Parachoques Tra.',    x: 86, y: 5,  w: 11, h: 90, view: 'superior' },

  // ── Frontal view (viewBox 440×400) ────────────────────────────────────────
  { id: 'fro-bumper',     nombre: 'Parachoques Del.',      x: 7,  y: 80, w: 84, h: 13, view: 'frontal' },
  { id: 'fro-capo',       nombre: 'Capó',                  x: 7,  y: 55, w: 84, h: 15, view: 'frontal' },
  { id: 'fro-luz-izq',    nombre: 'Faro Izquierdo',        x: 7,  y: 55, w: 14, h: 15, view: 'frontal' },
  { id: 'fro-luz-der',    nombre: 'Faro Derecho',          x: 80, y: 55, w: 14, h: 15, view: 'frontal' },
  { id: 'fro-parabrisas', nombre: 'Parabrisas',            x: 20, y: 8,  w: 60, h: 48, view: 'frontal' },
  { id: 'fro-guar-izq',   nombre: 'Guardabarro Del. Izq.', x: 7,  y: 70, w: 14, h: 23, view: 'frontal' },
  { id: 'fro-guar-der',   nombre: 'Guardabarro Del. Der.', x: 80, y: 70, w: 14, h: 23, view: 'frontal' },

  // ── Trasera view (viewBox 440×400) ────────────────────────────────────────
  { id: 'tra-bumper',   nombre: 'Parachoques Tra.',      x: 7,  y: 80, w: 84, h: 13, view: 'trasera' },
  { id: 'tra-maletero', nombre: 'Maletero',              x: 7,  y: 55, w: 84, h: 15, view: 'trasera' },
  { id: 'tra-luz-izq',  nombre: 'Luz Tra. Izquierda',   x: 7,  y: 55, w: 14, h: 15, view: 'trasera' },
  { id: 'tra-luz-der',  nombre: 'Luz Tra. Derecha',     x: 80, y: 55, w: 14, h: 15, view: 'trasera' },
  { id: 'tra-luna',     nombre: 'Luna Trasera',         x: 20, y: 8,  w: 60, h: 48, view: 'trasera' },
  { id: 'tra-guar-izq', nombre: 'Guardabarro Tra. Izq.', x: 7,  y: 70, w: 14, h: 23, view: 'trasera' },
  { id: 'tra-guar-der', nombre: 'Guardabarro Tra. Der.', x: 80, y: 70, w: 14, h: 23, view: 'trasera' },

  // ── Lateral Izquierdo (viewBox 1000×400) ──────────────────────────────────
  // x=3 w=30 matches test fixture for liz-capo
  { id: 'liz-capo',     nombre: 'Capó Izq.',            x: 3,  y: 46, w: 30, h: 26, view: 'lateral-izq' },
  { id: 'liz-puerta-d', nombre: 'Puerta Del. Izq.',     x: 33, y: 46, w: 21, h: 26, view: 'lateral-izq' },
  { id: 'liz-puerta-t', nombre: 'Puerta Tra. Izq.',     x: 54, y: 46, w: 22, h: 26, view: 'lateral-izq' },
  { id: 'liz-maletero', nombre: 'Maletero Izq.',        x: 76, y: 46, w: 21, h: 26, view: 'lateral-izq' },
  { id: 'liz-techo',    nombre: 'Techo Izq.',           x: 33, y: 8,  w: 54, h: 39, view: 'lateral-izq' },
  { id: 'liz-estribo',  nombre: 'Estribo Izquierdo',    x: 33, y: 71, w: 43, h: 8,  view: 'lateral-izq' },

  // ── Lateral Derecho (viewBox 1000×400) ────────────────────────────────────
  // Mirror formula: lde-x = 100 − liz-x − liz-w
  { id: 'lde-capo',     nombre: 'Capó Der.',            x: 67, y: 46, w: 30, h: 26, view: 'lateral-der' },
  { id: 'lde-puerta-d', nombre: 'Puerta Del. Der.',     x: 46, y: 46, w: 21, h: 26, view: 'lateral-der' },
  { id: 'lde-puerta-t', nombre: 'Puerta Tra. Der.',     x: 24, y: 46, w: 22, h: 26, view: 'lateral-der' },
  { id: 'lde-maletero', nombre: 'Maletero Der.',        x: 3,  y: 46, w: 21, h: 26, view: 'lateral-der' },
  { id: 'lde-techo',    nombre: 'Techo Der.',           x: 13, y: 8,  w: 54, h: 39, view: 'lateral-der' },
  { id: 'lde-estribo',  nombre: 'Estribo Derecho',      x: 24, y: 71, w: 43, h: 8,  view: 'lateral-der' },

  // ── Inferior view (viewBox 1000×420) ──────────────────────────────────────
  { id: 'inf-motor',        nombre: 'Motor / Cárter',        x: 6,  y: 25, w: 30, h: 21, view: 'inferior' },
  { id: 'inf-transmision',  nombre: 'Transmisión / Caja',    x: 36, y: 31, w: 16, h: 15, view: 'inferior' },
  { id: 'inf-tanque',       nombre: 'Tanque de combustible', x: 56, y: 51, w: 22, h: 23, view: 'inferior' },
  { id: 'inf-escape-izq',   nombre: 'Escape Izquierdo',      x: 10, y: 25, w: 80, h: 7,  view: 'inferior' },
  { id: 'inf-escape-der',   nombre: 'Escape Derecho',        x: 10, y: 62, w: 80, h: 7,  view: 'inferior' },
  { id: 'inf-dif-del',      nombre: 'Diferencial Delantero', x: 16, y: 42, w: 10, h: 10, view: 'inferior' },
  { id: 'inf-dif-tra',      nombre: 'Diferencial Trasero',   x: 70, y: 42, w: 10, h: 10, view: 'inferior' },
  { id: 'inf-piso',         nombre: 'Piso / Carrocería',     x: 3,  y: 5,  w: 94, h: 90, view: 'inferior' },
];

// ─── Zone lookup map (stable reference, never recomputed) ────────────────────
const ZONE_BY_ID = new Map<string, ZoneHotspot>(ZONE_HOTSPOTS.map((z) => [z.id, z]));

// ─── Adapters: ZonaVehiculoPDF ↔ DamageEntry ─────────────────────────────────
// These adapters maintain full compatibility with existing saved inspection records.
// The mapping is intentionally conservative: unknown tipos default to 'rayon'.

function pdfTipoToDanoTipo(tipo: ZonaVehiculoPDF['tipo']): DanoTipo {
  switch (tipo) {
    case 'bueno':       return 'sin-dano';
    case 'rayado':      return 'rayon';
    case 'golpe-leve':  return 'golpe';
    case 'golpe-fuerte':return 'abolladura';
    default:            return tipo ? 'rayon' : null;
  }
}

function danoTipoToPdfTipo(tipo: DanoTipo): ZonaVehiculoPDF['tipo'] {
  switch (tipo) {
    case 'sin-dano':   return 'bueno';
    case 'rayon':      return 'rayado';
    case 'golpe':      return 'golpe-leve';
    case 'abolladura': return 'golpe-fuerte';
    case 'pintura':    return 'rayado';
    default:           return null;
  }
}

/**
 * Normalize ZonaVehiculoPDF[] into DamageEntry[].
 * One ZonaVehiculoPDF → one DamageEntry (one damage record per zone per load).
 * Zones with tipo=null or tipo='bueno' and no notes/photos are skipped.
 * Historical IDs are preserved exactly.
 */
function normalizePdfZonas(zonas: ZonaVehiculoPDF[]): DamageEntry[] {
  const entries: DamageEntry[] = [];
  for (const zona of zonas) {
    if (!zona.id) continue;
    const tipo = pdfTipoToDanoTipo(zona.tipo);
    // Skip zones with no damage and no notes/photos
    if (tipo === null && !zona.notas && (!zona.fotos || zona.fotos.length === 0)) continue;
    const hotspot = ZONE_BY_ID.get(zona.id);
    // Determine view from hotspot catalogue; fall back to 'superior' for unknown IDs
    const view: VehicleView = hotspot?.view ?? 'superior';
    entries.push({
      id: `dmg-ext-${zona.id}`,
      zonaId: zona.id,
      zonaNombre: zona.nombre || hotspot?.nombre || zona.id,
      tipo,
      notas: zona.notas || '',
      fotos: zona.fotos || [],
      timestamp: new Date().toISOString(),
      view,
      x: hotspot ? hotspot.x + hotspot.w / 2 : 50,
      y: hotspot ? hotspot.y + hotspot.h / 2 : 50,
    });
  }
  return entries;
}

/**
 * Serialize DamageEntry[] → ZonaVehiculoPDF[].
 * Multiple damage entries for the same zone are merged: last tipo wins,
 * notes are concatenated with '; ', photos are combined.
 * This preserves backward compatibility with ZonaVehiculoPDF[].
 */
function serializeDamagesToPdf(damages: DamageEntry[]): ZonaVehiculoPDF[] {
  const zonaMap = new Map<string, ZonaVehiculoPDF>();
  for (const d of damages) {
    const existing = zonaMap.get(d.zonaId);
    if (!existing) {
      zonaMap.set(d.zonaId, {
        id: d.zonaId,
        nombre: d.zonaNombre,
        tipo: danoTipoToPdfTipo(d.tipo),
        notas: d.notas,
        fotos: [...d.fotos],
      });
    } else {
      // Merge: last tipo wins, notes concatenated, photos combined
      zonaMap.set(d.zonaId, {
        ...existing,
        tipo: danoTipoToPdfTipo(d.tipo) ?? existing.tipo,
        notas: [existing.notas, d.notas].filter(Boolean).join('; '),
        fotos: [...existing.fotos, ...d.fotos],
      });
    }
  }
  return Array.from(zonaMap.values());
}

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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LatoneriaSection({ zonas: externalZonas, onChange, inspectorId }: LatoneriaSectionProps) {
  const [activeView, setActiveView] = useState<VehicleView>('superior');
  const [selectedTool, setSelectedTool] = useState<DanoTipo>('rayon');
  const [damages, setDamages] = useState<DamageEntry[]>(() => {
    // Initialize from externalZonas on first mount
    if (externalZonas && externalZonas.length > 0) {
      return normalizePdfZonas(externalZonas);
    }
    return [];
  });
  const [selectedDamageId, setSelectedDamageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track whether the current damages were set by the user (local) or loaded externally.
  // This prevents overwriting user edits when the parent re-renders with the same data.
  const isLocalEdit = useRef(false);
  // Track the last serialized value we sent to onChange to avoid redundant calls.
  const lastSyncedRef = useRef<string>('');

  // ── Sync external → internal ──────────────────────────────────────────────
  // When externalZonas changes (e.g., inspection reload), re-initialize damages
  // ONLY if the change comes from outside (not from our own onChange call).
  useEffect(() => {
    if (isLocalEdit.current) {
      // This update was triggered by our own onChange — skip to avoid overwrite
      isLocalEdit.current = false;
      return;
    }
    if (!externalZonas) return;
    const normalized = normalizePdfZonas(externalZonas);
    // Only update if the external data actually differs from current state
    const externalKey = externalZonas.map((z) => `${z.id}:${z.tipo}:${z.notas}`).join('|');
    if (externalKey === lastSyncedRef.current) return;
    setDamages(normalized);
    setSelectedDamageId(null);
  }, [externalZonas]);

  // ── Sync internal → external ──────────────────────────────────────────────
  const syncExternal = useCallback((newDamages: DamageEntry[]) => {
    if (!onChange) return;
    const serialized = serializeDamagesToPdf(newDamages);
    const key = serialized.map((z) => `${z.id}:${z.tipo}:${z.notas}`).join('|');
    if (key === lastSyncedRef.current) return; // no-op: data unchanged
    lastSyncedRef.current = key;
    isLocalEdit.current = true; // mark as local to prevent re-init on next externalZonas update
    onChange(serialized);
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

  const getZoneDamage = (zoneId: string): DamageEntry | undefined =>
    damages.find((d) => d.zonaId === zoneId && d.view === activeView);

  // Count all damages per zone across all views (for summary indicator)
  const getZoneDamageCount = (zoneId: string): number =>
    damages.filter((d) => d.zonaId === zoneId).length;

  const currentViewZones = ZONE_HOTSPOTS.filter((z) => z.view === activeView);

  const viewIcons: Record<VehicleView, string> = {
    'superior':    '🚗',
    'inferior':    '🔧',
    'lateral-izq': '🚘',
    'lateral-der': '🚙',
    'frontal':     '🚖',
    'trasera':     '🚕',
  };

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
            {VIEWS.map((view) => {
              // Count damages in this view
              const viewDmgCount = damages.filter((d) => d.view === view.id).length;
              return (
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
                  <span className="text-xs flex-1">{view.label}</span>
                  {viewDmgCount > 0 && (
                    <span className="ml-auto text-xs font-bold bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                      {viewDmgCount}
                    </span>
                  )}
                </button>
              );
            })}
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
                  const totalCount = getZoneDamageCount(zone.id);
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      title={zone.nombre}
                      aria-label={`${zone.nombre}${dmg ? ` — ${cfg?.label}` : ''}`}
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
                      {/* Multi-view damage count badge */}
                      {totalCount > 1 && (
                        <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-gray-800 text-white text-xs flex items-center justify-center font-bold leading-none">
                          {totalCount}
                        </div>
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
            <div className="p-3 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-800">Daños registrados</h4>
              {damages.length > 0 && (
                <span className="text-xs font-bold bg-red-100 text-red-600 rounded-full px-2 py-0.5">
                  {damages.length}
                </span>
              )}
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
                            <img src={dmg.fotos[0]} alt={`Foto del daño en ${dmg.zonaNombre}`} className="w-10 h-10 rounded-lg object-cover border border-gray-200" />
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deleteDamage(dmg.id); }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            aria-label={`Eliminar daño en ${dmg.zonaNombre}`}
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
                          alt={`Foto ${idx + 1} del daño en ${selectedDamage.zonaNombre}`}
                          className="w-20 h-20 object-cover rounded-xl border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(selectedDamage.id, idx)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                          aria-label={`Eliminar foto ${idx + 1}`}
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