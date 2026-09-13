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
  x: number; // percentage within SVG
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
  { id: 'superior',    label: 'Vista Superior' },
  { id: 'lateral-izq', label: 'Lateral Izquierdo' },
  { id: 'lateral-der', label: 'Lateral Derecho' },
  { id: 'frontal',     label: 'Frontal' },
  { id: 'trasera',     label: 'Trasera' },
];

// ─── SVG Vehicle Diagrams ─────────────────────────────────────────────────────

function TopViewSVG() {
  return (
    <svg viewBox="0 0 220 380" className="w-full h-full" style={{ maxHeight: 340 }}>
      {/* Body */}
      <rect x="40" y="30" width="140" height="320" rx="30" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2"/>
      {/* Windshield front */}
      <ellipse cx="110" cy="80" rx="52" ry="22" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="1.5"/>
      {/* Windshield rear */}
      <ellipse cx="110" cy="300" rx="52" ry="22" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="1.5"/>
      {/* Roof panel */}
      <rect x="55" y="110" width="110" height="160" rx="8" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5"/>
      {/* Hood */}
      <rect x="50" y="40" width="120" height="55" rx="12" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Trunk */}
      <rect x="50" y="285" width="120" height="55" rx="12" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Left doors */}
      <rect x="30" y="120" width="28" height="65" rx="4" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
      <rect x="30" y="195" width="28" height="65" rx="4" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Right doors */}
      <rect x="162" y="120" width="28" height="65" rx="4" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
      <rect x="162" y="195" width="28" height="65" rx="4" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Wheels */}
      <rect x="14" y="60" width="26" height="50" rx="8" fill="#374151" stroke="#1f2937" strokeWidth="1"/>
      <rect x="180" y="60" width="26" height="50" rx="8" fill="#374151" stroke="#1f2937" strokeWidth="1"/>
      <rect x="14" y="270" width="26" height="50" rx="8" fill="#374151" stroke="#1f2937" strokeWidth="1"/>
      <rect x="180" y="270" width="26" height="50" rx="8" fill="#374151" stroke="#1f2937" strokeWidth="1"/>
      {/* Center line */}
      <line x1="110" y1="40" x2="110" y2="340" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="6,4"/>
      {/* Mirror left */}
      <ellipse cx="28" cy="130" rx="8" ry="5" fill="#94a3b8" stroke="#64748b" strokeWidth="1"/>
      {/* Mirror right */}
      <ellipse cx="192" cy="130" rx="8" ry="5" fill="#94a3b8" stroke="#64748b" strokeWidth="1"/>
    </svg>
  );
}

function FrontViewSVG() {
  return (
    <svg viewBox="0 0 280 200" className="w-full h-full" style={{ maxHeight: 200 }}>
      {/* Body */}
      <path d="M30 160 Q30 80 50 60 L80 40 L200 40 L230 60 Q250 80 250 160 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2"/>
      {/* Windshield */}
      <path d="M75 42 L85 90 L195 90 L205 42 Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="1.5"/>
      {/* Hood */}
      <path d="M50 160 L55 120 L225 120 L230 160 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Bumper */}
      <path d="M35 160 Q35 175 50 180 L230 180 Q245 175 245 160 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Headlights */}
      <path d="M42 130 Q42 115 55 112 L90 112 L90 135 L42 135 Z" fill="#fef9c3" stroke="#eab308" strokeWidth="1.5"/>
      <path d="M238 130 Q238 115 225 112 L190 112 L190 135 L238 135 Z" fill="#fef9c3" stroke="#eab308" strokeWidth="1.5"/>
      {/* Grille */}
      <rect x="95" y="140" width="90" height="30" rx="4" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5"/>
      <line x1="110" y1="140" x2="110" y2="170" stroke="#94a3b8" strokeWidth="1"/>
      <line x1="125" y1="140" x2="125" y2="170" stroke="#94a3b8" strokeWidth="1"/>
      <line x1="140" y1="140" x2="140" y2="170" stroke="#94a3b8" strokeWidth="1"/>
      <line x1="155" y1="140" x2="155" y2="170" stroke="#94a3b8" strokeWidth="1"/>
      <line x1="170" y1="140" x2="170" y2="170" stroke="#94a3b8" strokeWidth="1"/>
      {/* Wheels */}
      <ellipse cx="68" cy="180" rx="32" ry="16" fill="#374151" stroke="#1f2937" strokeWidth="1.5"/>
      <ellipse cx="68" cy="180" rx="20" ry="10" fill="#6b7280" stroke="#374151" strokeWidth="1"/>
      <ellipse cx="212" cy="180" rx="32" ry="16" fill="#374151" stroke="#1f2937" strokeWidth="1.5"/>
      <ellipse cx="212" cy="180" rx="20" ry="10" fill="#6b7280" stroke="#374151" strokeWidth="1"/>
      {/* Logo */}
      <circle cx="140" cy="155" r="8" fill="#94a3b8" stroke="#64748b" strokeWidth="1"/>
    </svg>
  );
}

function RearViewSVG() {
  return (
    <svg viewBox="0 0 280 200" className="w-full h-full" style={{ maxHeight: 200 }}>
      {/* Body */}
      <path d="M30 160 Q30 80 50 60 L80 40 L200 40 L230 60 Q250 80 250 160 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2"/>
      {/* Rear window */}
      <path d="M80 42 L88 88 L192 88 L200 42 Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="1.5"/>
      {/* Trunk lid */}
      <path d="M55 120 L55 160 L225 160 L225 120 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Bumper */}
      <path d="M35 160 Q35 178 50 182 L230 182 Q245 178 245 160 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Tail lights */}
      <path d="M42 130 Q42 115 55 112 L90 112 L90 135 L42 135 Z" fill="#fecaca" stroke="#ef4444" strokeWidth="1.5"/>
      <path d="M238 130 Q238 115 225 112 L190 112 L190 135 L238 135 Z" fill="#fecaca" stroke="#ef4444" strokeWidth="1.5"/>
      {/* License plate */}
      <rect x="105" y="162" width="70" height="18" rx="3" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Exhaust */}
      <ellipse cx="90" cy="182" rx="8" ry="4" fill="#6b7280" stroke="#374151" strokeWidth="1"/>
      <ellipse cx="190" cy="182" rx="8" ry="4" fill="#6b7280" stroke="#374151" strokeWidth="1"/>
      {/* Wheels */}
      <ellipse cx="68" cy="182" rx="32" ry="16" fill="#374151" stroke="#1f2937" strokeWidth="1.5"/>
      <ellipse cx="68" cy="182" rx="20" ry="10" fill="#6b7280" stroke="#374151" strokeWidth="1"/>
      <ellipse cx="212" cy="182" rx="32" ry="16" fill="#374151" stroke="#1f2937" strokeWidth="1.5"/>
      <ellipse cx="212" cy="182" rx="20" ry="10" fill="#6b7280" stroke="#374151" strokeWidth="1"/>
    </svg>
  );
}

function LeftSideViewSVG() {
  return (
    <svg viewBox="0 0 380 220" className="w-full h-full" style={{ maxHeight: 220 }}>
      {/* Body */}
      <path d="M30 170 L30 100 Q35 60 80 45 L160 35 L260 38 Q320 42 345 80 L355 170 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2"/>
      {/* Windshield */}
      <path d="M82 46 L70 100 L155 100 L160 38 Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="1.5"/>
      {/* Rear window */}
      <path d="M175 38 L175 100 L265 100 L268 42 Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="1.5"/>
      {/* Roof */}
      <path d="M80 45 L160 35 L260 38 L268 42 L265 100 L155 100 L70 100 L82 46 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Hood */}
      <path d="M30 100 L30 170 L80 170 L80 100 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Front door */}
      <path d="M80 100 L80 165 L175 165 L175 100 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Rear door */}
      <path d="M178 100 L178 165 L265 165 L265 100 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Trunk */}
      <path d="M265 100 L265 165 L355 165 L355 100 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Bumper front */}
      <path d="M20 155 Q20 175 35 178 L80 178 L80 165 L30 165 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Bumper rear */}
      <path d="M355 165 L355 178 L365 178 Q375 175 375 155 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Door handles */}
      <rect x="120" y="128" width="20" height="6" rx="3" fill="#94a3b8" stroke="#64748b" strokeWidth="1"/>
      <rect x="215" y="128" width="20" height="6" rx="3" fill="#94a3b8" stroke="#64748b" strokeWidth="1"/>
      {/* Headlight */}
      <path d="M22 120 Q22 105 35 102 L75 102 L75 125 L22 125 Z" fill="#fef9c3" stroke="#eab308" strokeWidth="1.5"/>
      {/* Tail light */}
      <path d="M358 120 Q358 105 348 102 L310 102 L310 125 L358 125 Z" fill="#fecaca" stroke="#ef4444" strokeWidth="1.5"/>
      {/* Wheels */}
      <circle cx="95" cy="178" r="36" fill="#374151" stroke="#1f2937" strokeWidth="2"/>
      <circle cx="95" cy="178" r="22" fill="#6b7280" stroke="#374151" strokeWidth="1.5"/>
      <circle cx="95" cy="178" r="8" fill="#9ca3af"/>
      <circle cx="295" cy="178" r="36" fill="#374151" stroke="#1f2937" strokeWidth="2"/>
      <circle cx="295" cy="178" r="22" fill="#6b7280" stroke="#374151" strokeWidth="1.5"/>
      <circle cx="295" cy="178" r="8" fill="#9ca3af"/>
      {/* Mirror */}
      <path d="M55 90 L65 90 L68 100 L52 100 Z" fill="#94a3b8" stroke="#64748b" strokeWidth="1"/>
    </svg>
  );
}

function RightSideViewSVG() {
  return (
    <svg viewBox="0 0 380 220" className="w-full h-full" style={{ maxHeight: 220 }}>
      {/* Body (mirrored) */}
      <path d="M350 170 L350 100 Q345 60 300 45 L220 35 L120 38 Q60 42 35 80 L25 170 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2"/>
      {/* Windshield */}
      <path d="M298 46 L310 100 L225 100 L220 38 Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="1.5"/>
      {/* Rear window */}
      <path d="M205 38 L205 100 L115 100 L112 42 Z" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="1.5"/>
      {/* Roof */}
      <path d="M300 45 L220 35 L120 38 L112 42 L115 100 L225 100 L310 100 L298 46 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Hood */}
      <path d="M350 100 L350 170 L300 170 L300 100 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Front door */}
      <path d="M300 100 L300 165 L205 165 L205 100 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Rear door */}
      <path d="M202 100 L202 165 L115 165 L115 100 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Trunk */}
      <path d="M115 100 L115 165 L25 165 L25 100 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Bumper front */}
      <path d="M360 155 Q360 175 345 178 L300 178 L300 165 L350 165 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Bumper rear */}
      <path d="M25 165 L25 178 L15 178 Q5 175 5 155 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5"/>
      {/* Door handles */}
      <rect x="240" y="128" width="20" height="6" rx="3" fill="#94a3b8" stroke="#64748b" strokeWidth="1"/>
      <rect x="145" y="128" width="20" height="6" rx="3" fill="#94a3b8" stroke="#64748b" strokeWidth="1"/>
      {/* Headlight */}
      <path d="M358 120 Q358 105 345 102 L305 102 L305 125 L358 125 Z" fill="#fef9c3" stroke="#eab308" strokeWidth="1.5"/>
      {/* Tail light */}
      <path d="M22 120 Q22 105 32 102 L70 102 L70 125 L22 125 Z" fill="#fecaca" stroke="#ef4444" strokeWidth="1.5"/>
      {/* Wheels */}
      <circle cx="285" cy="178" r="36" fill="#374151" stroke="#1f2937" strokeWidth="2"/>
      <circle cx="285" cy="178" r="22" fill="#6b7280" stroke="#374151" strokeWidth="1.5"/>
      <circle cx="285" cy="178" r="8" fill="#9ca3af"/>
      <circle cx="85" cy="178" r="36" fill="#374151" stroke="#1f2937" strokeWidth="2"/>
      <circle cx="85" cy="178" r="22" fill="#6b7280" stroke="#374151" strokeWidth="1.5"/>
      <circle cx="85" cy="178" r="8" fill="#9ca3af"/>
      {/* Mirror */}
      <path d="M325 90 L315 90 L312 100 L328 100 Z" fill="#94a3b8" stroke="#64748b" strokeWidth="1"/>
    </svg>
  );
}

// ─── Zone definitions per view ────────────────────────────────────────────────

interface ZoneHotspot {
  id: string;
  nombre: string;
  // SVG viewBox percentages
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

  // Sync to external onChange as ZonaVehiculoPDF[]
  const syncExternal = useCallback((newDamages: DamageEntry[]) => {
    if (!onChange) return;
    // Convert damage entries to ZonaVehiculoPDF format
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
    // If eraser tool, remove damages for this zone in current view
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
      // borrar mode — handled by separate button
      eraseDamage(zone.id);
      return;
    }
    // Check if zone already has a damage in this view
    const existing = damages.find((d) => d.zonaId === zone.id && d.view === activeView);
    if (existing) {
      // Update type
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

  // View icons
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