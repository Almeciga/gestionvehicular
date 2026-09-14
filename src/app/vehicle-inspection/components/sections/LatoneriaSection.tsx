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

type VehicleView = 'superior' | 'lateral-izq' | 'lateral-der' | 'frontal' | 'trasera';

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
  { id: 'lateral-izq',  label: 'Lateral Izquierdo' },
  { id: 'lateral-der',  label: 'Lateral Derecho' },
  { id: 'frontal',      label: 'Frontal' },
  { id: 'trasera',      label: 'Trasera' },
];

// ─── SVG Vehicle Diagrams (Realistic) ────────────────────────────────────────

function TopViewSVG() {
  return (
    <svg viewBox="0 0 220 380" className="w-full h-full" style={{ maxHeight: 340 }}>
      <defs>
        <linearGradient id="bodyGradTop" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="50%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="glassGradTop" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#bae6fd" />
          <stop offset="100%" stopColor="#7dd3fc" />
        </linearGradient>
        <linearGradient id="roofGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id="hoodGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
      </defs>
      {/* Shadow */}
      <ellipse cx="110" cy="370" rx="80" ry="10" fill="#00000015" />
      {/* Main body silhouette */}
      <path d="M45 30 Q35 30 30 50 L25 80 Q22 180 30 340 Q35 350 50 350 L170 350 Q185 350 190 340 Q198 180 195 80 L190 50 Q185 30 175 30 Z" fill="url(#bodyGradTop)" stroke="#94a3b8" strokeWidth="1.8" />
      {/* Body contour line */}
      <path d="M40 35 Q30 35 28 55 L23 85 Q20 185 28 340 Q33 348 45 348 L175 348 Q187 348 192 340 Q200 185 197 85 L192 55 Q187 35 180 35" fill="none" stroke="#64748b" strokeWidth="0.8" opacity="0.4" />
      {/* Front windshield */}
      <path d="M62 78 Q60 65 80 55 L140 55 Q160 65 158 78 Q140 98 80 98 Z" fill="url(#glassGradTop)" stroke="#38bdf8" strokeWidth="1.2" />
      {/* Rear windshield */}
      <path d="M62 282 Q60 295 80 305 L140 305 Q160 295 158 282 Q140 262 80 262 Z" fill="url(#glassGradTop)" stroke="#38bdf8" strokeWidth="1.2" />
      {/* Roof panel with sunroof */}
      <path d="M58 105 L58 255 Q58 265 110 265 Q162 265 162 255 L162 105 Q162 95 110 95 Q58 95 58 105 Z" fill="url(#roofGrad)" stroke="#94a3b8" strokeWidth="1.2" />
      {/* Sunroof */}
      <path d="M85 115 L85 245 Q85 250 110 250 Q135 250 135 245 L135 115 Q135 110 110 110 Q85 110 85 115 Z" fill="#e0e7ff" stroke="#a5b4fc" strokeWidth="0.8" opacity="0.6" />
      {/* Hood center line */}
      <line x1="110" y1="38" x2="110" y2="82" stroke="#94a3b8" strokeWidth="0.6" opacity="0.5" />
      {/* Left mirror */}
      <path d="M32 128 Q28 125 26 120 L24 115 Q28 112 34 115 L36 125 Z" fill="#64748b" stroke="#475569" strokeWidth="0.8" />
      {/* Right mirror */}
      <path d="M188 128 Q192 125 194 120 L196 115 Q192 112 186 115 L184 125 Z" fill="#64748b" stroke="#475569" strokeWidth="0.8" />
      {/* Wheels */}
      <g>
        {/* Front left */}
        <rect x="16" y="60" width="22" height="48" rx="10" fill="#1e293b" stroke="#0f172a" strokeWidth="1.2" />
        <rect x="18" y="62" width="18" height="44" rx="8" fill="#334155" stroke="#1e293b" strokeWidth="0.5" />
        <ellipse cx="27" cy="84" rx="10" ry="12" fill="#475569" opacity="0.5" />
        {/* Front right */}
        <rect x="182" y="60" width="22" height="48" rx="10" fill="#1e293b" stroke="#0f172a" strokeWidth="1.2" />
        <rect x="184" y="62" width="18" height="44" rx="8" fill="#334155" stroke="#1e293b" strokeWidth="0.5" />
        <ellipse cx="193" cy="84" rx="10" ry="12" fill="#475569" opacity="0.5" />
        {/* Rear left */}
        <rect x="16" y="272" width="22" height="48" rx="10" fill="#1e293b" stroke="#0f172a" strokeWidth="1.2" />
        <rect x="18" y="274" width="18" height="44" rx="8" fill="#334155" stroke="#1e293b" strokeWidth="0.5" />
        <ellipse cx="27" cy="296" rx="10" ry="12" fill="#475569" opacity="0.5" />
        {/* Rear right */}
        <rect x="182" y="272" width="22" height="48" rx="10" fill="#1e293b" stroke="#0f172a" strokeWidth="1.2" />
        <rect x="184" y="274" width="18" height="44" rx="8" fill="#334155" stroke="#1e293b" strokeWidth="0.5" />
        <ellipse cx="193" cy="296" rx="10" ry="12" fill="#475569" opacity="0.5" />
      </g>
      {/* Antenna */}
      <line x1="110" y1="95" x2="110" y2="75" stroke="#64748b" strokeWidth="1" />
      <circle cx="110" cy="74" r="2" fill="#64748b" />
    </svg>
  );
}

function FrontViewSVG() {
  return (
    <svg viewBox="0 0 280 200" className="w-full h-full" style={{ maxHeight: 200 }}>
      <defs>
        <linearGradient id="bodyGradFront" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="glassFront" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      {/* Shadow */}
      <ellipse cx="140" cy="192" rx="100" ry="8" fill="#00000015" />
      {/* Main body */}
      <path d="M28 155 Q28 75 55 55 L80 35 L200 35 L225 55 Q252 75 252 155 Q252 170 240 178 L40 178 Q28 170 28 155 Z" fill="url(#bodyGradFront)" stroke="#94a3b8" strokeWidth="2" />
      {/* Hood curve */}
      <path d="M55 55 Q55 40 80 35 L200 35 Q225 40 225 55 Q225 70 200 75 L80 75 Q55 70 55 55 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.2" />
      {/* Windshield */}
      <path d="M70 36 L80 85 L200 85 L210 36 Q190 32 140 32 Q90 32 70 36 Z" fill="url(#glassFront)" stroke="#38bdf8" strokeWidth="1.5" />
      {/* A-pillars */}
      <line x1="70" y1="36" x2="80" y2="85" stroke="#475569" strokeWidth="2.5" />
      <line x1="210" y1="36" x2="200" y2="85" stroke="#475569" strokeWidth="2.5" />
      {/* Front grille */}
      <path d="M95 140 L95 115 Q95 108 105 105 L175 105 Q185 108 185 115 L185 140 Z" fill="#1e293b" stroke="#0f172a" strokeWidth="1.5" />
      {/* Grille chrome surround */}
      <path d="M90 140 L90 112 Q90 104 100 102 L180 102 Q190 104 190 112 L190 140" fill="none" stroke="#cbd5e1" strokeWidth="2.5" />
      {/* Grille bars */}
      <line x1="100" y1="115" x2="180" y2="115" stroke="#475569" strokeWidth="1.2" />
      <line x1="100" y1="125" x2="180" y2="125" stroke="#475569" strokeWidth="1.2" />
      {/* Logo */}
      <circle cx="140" cy="120" r="10" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1.5" />
      <circle cx="140" cy="120" r="6" fill="#64748b" />
      {/* Headlights - LED style */}
      <path d="M38 125 Q38 108 52 102 L85 102 L85 135 L38 135 Z" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
      <path d="M45 115 Q45 108 55 105 L78 105 L78 125 L45 125 Z" fill="#f8fafc" opacity="0.7" />
      <path d="M242 125 Q242 108 228 102 L195 102 L195 135 L242 135 Z" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
      <path d="M235 115 Q235 108 225 105 L202 105 L202 125 L235 125 Z" fill="#f8fafc" opacity="0.7" />
      {/* Lower bumper intake */}
      <path d="M70 150 L70 160 Q70 168 85 172 L195 172 Q210 168 210 160 L210 150 Z" fill="#1e293b" stroke="#0f172a" strokeWidth="1.2" />
      {/* Fog lights */}
      <ellipse cx="65" cy="148" rx="12" ry="6" fill="#fef08a" stroke="#ca8a04" strokeWidth="1" />
      <ellipse cx="215" cy="148" rx="12" ry="6" fill="#fef08a" stroke="#ca8a04" strokeWidth="1" />
      {/* Bumper lower edge */}
      <path d="M30 155 Q30 170 45 178 L235 178 Q250 170 250 155" fill="none" stroke="#64748b" strokeWidth="2" />
      {/* Wheels */}
      <ellipse cx="68" cy="178" rx="30" ry="14" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <ellipse cx="68" cy="178" rx="20" ry="9" fill="#334155" stroke="#1e293b" strokeWidth="1" />
      <ellipse cx="68" cy="178" rx="8" ry="4" fill="#475569" />
      <ellipse cx="212" cy="178" rx="30" ry="14" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <ellipse cx="212" cy="178" rx="20" ry="9" fill="#334155" stroke="#1e293b" strokeWidth="1" />
      <ellipse cx="212" cy="178" rx="8" ry="4" fill="#475569" />
    </svg>
  );
}

function RearViewSVG() {
  return (
    <svg viewBox="0 0 280 200" className="w-full h-full" style={{ maxHeight: 200 }}>
      <defs>
        <linearGradient id="bodyGradRear" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="glassRear" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      {/* Shadow */}
      <ellipse cx="140" cy="192" rx="100" ry="8" fill="#00000015" />
      {/* Main body */}
      <path d="M28 155 Q28 75 55 55 L80 35 L200 35 L225 55 Q252 75 252 155 Q252 170 240 178 L40 178 Q28 170 28 155 Z" fill="url(#bodyGradRear)" stroke="#94a3b8" strokeWidth="2" />
      {/* Rear window */}
      <path d="M75 36 L82 82 L198 82 L205 36 Q190 32 140 32 Q90 32 75 36 Z" fill="url(#glassRear)" stroke="#38bdf8" strokeWidth="1.5" />
      {/* C-pillars */}
      <line x1="75" y1="36" x2="82" y2="82" stroke="#475569" strokeWidth="2.5" />
      <line x1="205" y1="36" x2="198" y2="82" stroke="#475569" strokeWidth="2.5" />
      {/* Trunk lid */}
      <path d="M60 85 L60 155 Q60 162 85 168 L195 168 Q220 162 220 155 L220 85 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.2" />
      <line x1="140" y1="85" x2="140" y2="155" stroke="#cbd5e1" strokeWidth="0.8" />
      {/* Tail lights - LED style */}
      <path d="M38 125 Q38 108 52 102 L85 102 L85 135 L38 135 Z" fill="#fca5a5" stroke="#dc2626" strokeWidth="1.5" />
      <path d="M45 115 Q45 108 55 105 L78 105 L78 125 L45 125 Z" fill="#fecaca" opacity="0.8" />
      <path d="M242 125 Q242 108 228 102 L195 102 L195 135 L242 135 Z" fill="#fca5a5" stroke="#dc2626" strokeWidth="1.5" />
      <path d="M235 115 Q235 108 225 105 L202 105 L202 125 L235 125 Z" fill="#fecaca" opacity="0.8" />
      {/* License plate */}
      <rect x="105" y="162" width="70" height="15" rx="3" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" />
      <rect x="110" y="164" width="60" height="11" rx="2" fill="#e2e8f0" />
      {/* Exhaust pipes */}
      <ellipse cx="92" cy="180" rx="8" ry="5" fill="#64748b" stroke="#475569" strokeWidth="1.5" />
      <ellipse cx="92" cy="180" rx="5" ry="3" fill="#1e293b" />
      <ellipse cx="188" cy="180" rx="8" ry="5" fill="#64748b" stroke="#475569" strokeWidth="1.5" />
      <ellipse cx="188" cy="180" rx="5" ry="3" fill="#1e293b" />
      {/* Bumper lower edge */}
      <path d="M30 155 Q30 172 45 180 L235 180 Q250 172 250 155" fill="none" stroke="#64748b" strokeWidth="2" />
      {/* Wheels */}
      <ellipse cx="68" cy="180" rx="30" ry="14" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <ellipse cx="68" cy="180" rx="20" ry="9" fill="#334155" stroke="#1e293b" strokeWidth="1" />
      <ellipse cx="68" cy="180" rx="8" ry="4" fill="#475569" />
      <ellipse cx="212" cy="180" rx="30" ry="14" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <ellipse cx="212" cy="180" rx="20" ry="9" fill="#334155" stroke="#1e293b" strokeWidth="1" />
      <ellipse cx="212" cy="180" rx="8" ry="4" fill="#475569" />
    </svg>
  );
}

function LeftSideViewSVG() {
  return (
    <svg viewBox="0 0 380 220" className="w-full h-full" style={{ maxHeight: 220 }}>
      <defs>
        <linearGradient id="bodySide" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="glassSide" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      {/* Shadow */}
      <ellipse cx="190" cy="210" rx="160" ry="8" fill="#00000012" />
      {/* Main body silhouette */}
      <path d="M25 165 L25 100 Q30 55 80 42 L160 30 L260 35 Q325 40 350 80 L358 165 Q358 175 345 182 L30 182 Q25 175 25 165 Z" fill="url(#bodySide)" stroke="#94a3b8" strokeWidth="1.8" />
      {/* Body character line */}
      <path d="M28 150 L160 145 L260 145 L355 150" fill="none" stroke="#94a3b8" strokeWidth="0.8" opacity="0.6" />
      {/* Lower body line */}
      <path d="M28 175 L345 175" fill="none" stroke="#64748b" strokeWidth="0.6" opacity="0.4" />
      {/* Windshield */}
      <path d="M80 43 L67 95 L155 95 L162 32 Z" fill="url(#glassSide)" stroke="#38bdf8" strokeWidth="1.2" />
      {/* Rear window */}
      <path d="M175 32 L175 95 L265 95 L275 39 Z" fill="url(#glassSide)" stroke="#38bdf8" strokeWidth="1.2" />
      {/* Roof */}
      <path d="M80 43 L160 30 L260 35 L275 39 L265 95 L175 95 L155 95 L67 95 L80 43 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.2" />
      {/* Hood */}
      <path d="M25 100 L25 165 L80 165 L80 100 Q80 70 60 55 Q45 45 25 100 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
      {/* Front door */}
      <path d="M82 98 L82 162 L175 162 L175 98 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.2" />
      {/* Front door window */}
      <path d="M90 100 L88 140 L170 140 L170 100 Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="0.8" opacity="0.6" />
      {/* Rear door */}
      <path d="M178 98 L178 162 L265 162 L265 98 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.2" />
      {/* Rear door window */}
      <path d="M183 100 L182 140 L260 140 L260 100 Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="0.8" opacity="0.6" />
      {/* B-pillar */}
      <line x1="175" y1="40" x2="175" y2="165" stroke="#64748b" strokeWidth="2.5" />
      {/* Trunk */}
      <path d="M265 100 L265 165 L358 165 L358 100 Q358 70 340 55 Q325 45 300 40 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
      {/* Door handles */}
      <rect x="105" y="125" width="22" height="5" rx="2.5" fill="#94a3b8" stroke="#64748b" strokeWidth="0.8" />
      <rect x="200" y="125" width="22" height="5" rx="2.5" fill="#94a3b8" stroke="#64748b" strokeWidth="0.8" />
      {/* Chrome window trim */}
      <path d="M80 43 L67 95 L155 95 L175 40" fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
      <path d="M175 40 L175 95 L265 95 L275 39" fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
      {/* Headlight */}
      <path d="M22 118 Q22 100 38 95 L78 95 L78 125 L22 125 Z" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
      <path d="M28 112 Q28 102 38 98 L70 98 L70 118 L28 118 Z" fill="#f8fafc" opacity="0.6" />
      {/* Tail light */}
      <path d="M360 118 Q360 100 348 95 L310 95 L310 125 L360 125 Z" fill="#fca5a5" stroke="#dc2626" strokeWidth="1.5" />
      {/* Bumper front */}
      <path d="M18 152 Q18 172 32 178 L80 178 L80 162 L28 162 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.2" />
      {/* Bumper rear */}
      <path d="M360 162 L360 178 L372 178 Q380 172 380 152 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.2" />
      {/* Side mirror */}
      <path d="M52 88 L62 88 L66 100 L48 100 Z" fill="#475569" stroke="#1e293b" strokeWidth="0.8" />
      <path d="M54 90 L60 90 L63 98 L51 98 Z" fill="#64748b" />
      {/* Front wheel */}
      <circle cx="95" cy="180" r="34" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <circle cx="95" cy="180" r="22" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <circle cx="95" cy="180" r="8" fill="#64748b" />
      <line x1="95" y1="158" x2="95" y2="202" stroke="#475569" strokeWidth="1" opacity="0.5" />
      <line x1="73" y1="180" x2="117" y2="180" stroke="#475569" strokeWidth="1" opacity="0.5" />
      {/* Rear wheel */}
      <circle cx="295" cy="180" r="34" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <circle cx="295" cy="180" r="22" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <circle cx="295" cy="180" r="8" fill="#64748b" />
      <line x1="295" y1="158" x2="295" y2="202" stroke="#475569" strokeWidth="1" opacity="0.5" />
      <line x1="273" y1="180" x2="317" y2="180" stroke="#475569" strokeWidth="1" opacity="0.5" />
      {/* Side skirt */}
      <path d="M82 165 L265 165" stroke="#64748b" strokeWidth="1.5" opacity="0.3" />
    </svg>
  );
}

function RightSideViewSVG() {
  return (
    <svg viewBox="0 0 380 220" className="w-full h-full" style={{ maxHeight: 220 }}>
      <defs>
        <linearGradient id="bodySideR" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="glassSideR" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      {/* Shadow */}
      <ellipse cx="190" cy="210" rx="160" ry="8" fill="#00000012" />
      {/* Main body silhouette - mirrored */}
      <path d="M355 165 L355 100 Q350 55 300 42 L220 30 L120 35 Q55 40 30 80 L22 165 Q22 175 35 182 L350 182 Q355 175 355 165 Z" fill="url(#bodySideR)" stroke="#94a3b8" strokeWidth="1.8" />
      {/* Body character line */}
      <path d="M352 150 L220 145 L120 145 L25 150" fill="none" stroke="#94a3b8" strokeWidth="0.8" opacity="0.6" />
      {/* Lower body line */}
      <path d="M352 175 L35 175" fill="none" stroke="#64748b" strokeWidth="0.6" opacity="0.4" />
      {/* Windshield */}
      <path d="M300 43 L313 95 L225 95 L218 32 Z" fill="url(#glassSideR)" stroke="#38bdf8" strokeWidth="1.2" />
      {/* Rear window */}
      <path d="M205 32 L205 95 L115 95 L105 39 Z" fill="url(#glassSideR)" stroke="#38bdf8" strokeWidth="1.2" />
      {/* Roof */}
      <path d="M300 43 L220 30 L120 35 L105 39 L115 95 L205 95 L225 95 L313 95 L300 43 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.2" />
      {/* Hood */}
      <path d="M355 100 L355 165 L300 165 L300 100 Q300 70 320 55 Q335 45 355 100 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
      {/* Front door */}
      <path d="M298 98 L298 162 L205 162 L205 98 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.2" />
      {/* Front door window */}
      <path d="M290 100 L292 140 L210 140 L210 100 Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="0.8" opacity="0.6" />
      {/* Rear door */}
      <path d="M202 98 L202 162 L115 162 L115 98 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.2" />
      {/* Rear door window */}
      <path d="M197 100 L198 140 L120 140 L120 100 Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="0.8" opacity="0.6" />
      {/* B-pillar */}
      <line x1="205" y1="40" x2="205" y2="165" stroke="#64748b" strokeWidth="2.5" />
      {/* Trunk */}
      <path d="M115 100 L115 165 L22 165 L22 100 Q22 70 40 55 Q55 45 80 40 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
      {/* Door handles */}
      <rect x="253" y="125" width="22" height="5" rx="2.5" fill="#94a3b8" stroke="#64748b" strokeWidth="0.8" />
      <rect x="158" y="125" width="22" height="5" rx="2.5" fill="#94a3b8" stroke="#64748b" strokeWidth="0.8" />
      {/* Chrome window trim */}
      <path d="M300 43 L313 95 L225 95 L205 40" fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
      <path d="M205 40 L205 95 L115 95 L105 39" fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
      {/* Headlight */}
      <path d="M358 118 Q358 100 342 95 L302 95 L302 125 L358 125 Z" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
      <path d="M352 112 Q352 102 342 98 L310 98 L310 118 L352 118 Z" fill="#f8fafc" opacity="0.6" />
      {/* Tail light */}
      <path d="M20 118 Q20 100 32 95 L70 95 L70 125 L20 125 Z" fill="#fca5a5" stroke="#dc2626" strokeWidth="1.5" />
      {/* Bumper front */}
      <path d="M362 152 Q362 172 348 178 L300 178 L300 162 L352 162 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.2" />
      {/* Bumper rear */}
      <path d="M20 162 L20 178 L8 178 Q0 172 0 152 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.2" />
      {/* Side mirror */}
      <path d="M328 88 L318 88 L314 100 L332 100 Z" fill="#475569" stroke="#1e293b" strokeWidth="0.8" />
      <path d="M326 90 L320 90 L317 98 L329 98 Z" fill="#64748b" />
      {/* Front wheel */}
      <circle cx="285" cy="180" r="34" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <circle cx="285" cy="180" r="22" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <circle cx="285" cy="180" r="8" fill="#64748b" />
      <line x1="285" y1="158" x2="285" y2="202" stroke="#475569" strokeWidth="1" opacity="0.5" />
      <line x1="263" y1="180" x2="307" y2="180" stroke="#475569" strokeWidth="1" opacity="0.5" />
      {/* Rear wheel */}
      <circle cx="85" cy="180" r="34" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <circle cx="85" cy="180" r="22" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
      <circle cx="85" cy="180" r="8" fill="#64748b" />
      <line x1="85" y1="158" x2="85" y2="202" stroke="#475569" strokeWidth="1" opacity="0.5" />
      <line x1="63" y1="180" x2="107" y2="180" stroke="#475569" strokeWidth="1" opacity="0.5" />
      {/* Side skirt */}
      <path d="M298 165 L115 165" stroke="#64748b" strokeWidth="1.5" opacity="0.3" />
    </svg>
  );
}

// ─── Zone definitions per view ────────────────────────────────────────────────

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
  // Superior view (viewBox 220x380)
  { id: 'sup-capo',      nombre: 'Capó',                    x: 18, y: 8,  w: 64, h: 18, view: 'superior' },
  { id: 'sup-techo',     nombre: 'Techo',                   x: 25, y: 29, w: 50, h: 22, view: 'superior' },
  { id: 'sup-maletero',  nombre: 'Maletero',                x: 18, y: 75, w: 64, h: 15, view: 'superior' },
  { id: 'sup-puerta-di', nombre: 'Puerta Del. Izq.',        x: 0,  y: 32, w: 18, h: 17, view: 'superior' },
  { id: 'sup-puerta-dd', nombre: 'Puerta Del. Der.',        x: 82, y: 32, w: 18, h: 17, view: 'superior' },
  { id: 'sup-puerta-ti', nombre: 'Puerta Tra. Izq.',        x: 0,  y: 51, w: 18, h: 17, view: 'superior' },
  { id: 'sup-puerta-td', nombre: 'Puerta Tra. Der.',        x: 82, y: 51, w: 18, h: 17, view: 'superior' },
  { id: 'sup-para-del',  nombre: 'Parachoques Del.',        x: 18, y: 1,  w: 64, h: 8,  view: 'superior' },
  { id: 'sup-para-tra',  nombre: 'Parachoques Tra.',        x: 18, y: 91, w: 64, h: 8,  view: 'superior' },
  // Frontal view (viewBox 280x200)
  { id: 'fro-bumper',    nombre: 'Parachoques Del.',        x: 12, y: 80, w: 76, h: 18, view: 'frontal' },
  { id: 'fro-capo',      nombre: 'Capó',                    x: 15, y: 55, w: 70, h: 26, view: 'frontal' },
  { id: 'fro-luz-izq',   nombre: 'Faro Izquierdo',          x: 2,  y: 55, w: 22, h: 18, view: 'frontal' },
  { id: 'fro-luz-der',   nombre: 'Faro Derecho',            x: 76, y: 55, w: 22, h: 18, view: 'frontal' },
  { id: 'fro-parabrisas',nombre: 'Parabrisas',              x: 22, y: 18, w: 56, h: 30, view: 'frontal' },
  { id: 'fro-guar-izq',  nombre: 'Guardabarro Del. Izq.',   x: 2,  y: 35, w: 20, h: 22, view: 'frontal' },
  { id: 'fro-guar-der',  nombre: 'Guardabarro Del. Der.',   x: 78, y: 35, w: 20, h: 22, view: 'frontal' },
  // Trasera view (viewBox 280x200)
  { id: 'tra-bumper',    nombre: 'Parachoques Tra.',        x: 12, y: 80, w: 76, h: 18, view: 'trasera' },
  { id: 'tra-maletero',  nombre: 'Maletero',                x: 15, y: 55, w: 70, h: 26, view: 'trasera' },
  { id: 'tra-luz-izq',   nombre: 'Luz Tra. Izquierda',      x: 2,  y: 55, w: 22, h: 18, view: 'trasera' },
  { id: 'tra-luz-der',   nombre: 'Luz Tra. Derecha',        x: 76, y: 55, w: 22, h: 18, view: 'trasera' },
  { id: 'tra-luna',      nombre: 'Luna Trasera',            x: 22, y: 18, w: 56, h: 30, view: 'trasera' },
  { id: 'tra-guar-izq',  nombre: 'Guardabarro Tra. Izq.',   x: 2,  y: 35, w: 20, h: 22, view: 'trasera' },
  { id: 'tra-guar-der',  nombre: 'Guardabarro Tra. Der.',   x: 78, y: 35, w: 20, h: 22, view: 'trasera' },
  // Lateral Izquierdo (viewBox 380x220)
  { id: 'liz-capo',      nombre: 'Capó Izq.',               x: 0,  y: 45, w: 22, h: 32, view: 'lateral-izq' },
  { id: 'liz-puerta-d',  nombre: 'Puerta Del. Izq.',        x: 22, y: 45, w: 24, h: 32, view: 'lateral-izq' },
  { id: 'liz-puerta-t',  nombre: 'Puerta Tra. Izq.',        x: 47, y: 45, w: 23, h: 32, view: 'lateral-izq' },
  { id: 'liz-maletero',  nombre: 'Maletero Izq.',           x: 70, y: 45, w: 24, h: 32, view: 'lateral-izq' },
  { id: 'liz-techo',     nombre: 'Techo Izq.',              x: 22, y: 10, w: 60, h: 35, view: 'lateral-izq' },
  { id: 'liz-estribo',   nombre: 'Estribo Izquierdo',       x: 22, y: 77, w: 50, h: 8,  view: 'lateral-izq' },
  // Lateral Derecho (viewBox 380x220)
  { id: 'lde-capo',      nombre: 'Capó Der.',               x: 78, y: 45, w: 22, h: 32, view: 'lateral-der' },
  { id: 'lde-puerta-d',  nombre: 'Puerta Del. Der.',        x: 54, y: 45, w: 24, h: 32, view: 'lateral-der' },
  { id: 'lde-puerta-t',  nombre: 'Puerta Tra. Der.',        x: 30, y: 45, w: 23, h: 32, view: 'lateral-der' },
  { id: 'lde-maletero',  nombre: 'Maletero Der.',           x: 6,  y: 45, w: 24, h: 32, view: 'lateral-der' },
  { id: 'lde-techo',     nombre: 'Techo Der.',              x: 18, y: 10, w: 60, h: 35, view: 'lateral-der' },
  { id: 'lde-estribo',   nombre: 'Estribo Derecho',         x: 28, y: 77, w: 50, h: 8,  view: 'lateral-der' },
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
    if (selectedTool === null) {
      eraseDamage(zone.id);
      return;
    }
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
            <div className="relative w-full max-w-lg">
              {/* SVG diagram */}
              <div className="pointer-events-none">
                {activeView === 'superior'    && <TopViewSVG />}
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
                  {/* Notes */}
                  <textarea
                    value={selectedDamage.notas}
                    onChange={(e) => updateNote(selectedDamage.id, e.target.value)}
                    placeholder="Notas sobre este daño..."
                    rows={2}
                    className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  {/* Photo gallery */}
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
                    {/* Add photo button */}
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