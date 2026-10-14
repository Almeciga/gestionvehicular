/**
 * Unit tests for inspectionDiagram.ts
 * Pure function — no mocks needed, fully idempotent.
 */
import { getInspectionDiagramConfig } from '../src/lib/inspectionDiagram';
import { describe, it, expect } from '@jest/globals';

describe('getInspectionDiagramConfig', () => {
  // ─── Motorcycles ───────────────────────────────────────────────────────────
  it('returns moto for 1 seat, 2 axles', () => {
    const cfg = getInspectionDiagramConfig(1, 2);
    expect(cfg?.diagramVariant)?.toBe('moto');
    expect(cfg?.tireCount)?.toBe(2);
    expect(cfg?.vehicleType)?.toBe('Motocicleta');
    expect(cfg?.dualRearTires)?.toBe(false);
  });

  it('returns moto for 2 seats, 2 axles', () => {
    const cfg = getInspectionDiagramConfig(2, 2);
    expect(cfg?.diagramVariant)?.toBe('moto');
  });

  // ─── Automobiles ───────────────────────────────────────────────────────────
  it('returns auto for 5 seats, 2 axles', () => {
    const cfg = getInspectionDiagramConfig(5, 2);
    expect(cfg?.diagramVariant)?.toBe('auto');
    expect(cfg?.tireCount)?.toBe(4);
    expect(cfg?.dualRearTires)?.toBe(false);
  });

  it('returns auto for 4 seats, 2 axles', () => {
    const cfg = getInspectionDiagramConfig(4, 2);
    expect(cfg?.diagramVariant)?.toBe('auto');
  });

  // ─── SUV ───────────────────────────────────────────────────────────────────
  it('returns suv for 7 seats, 2 axles', () => {
    const cfg = getInspectionDiagramConfig(7, 2);
    expect(cfg?.diagramVariant)?.toBe('suv');
    expect(cfg?.tireCount)?.toBe(4);
    expect(cfg?.vehicleType)?.toBe('SUV / Camioneta');
  });

  it('returns suv for 8 seats, 2 axles', () => {
    const cfg = getInspectionDiagramConfig(8, 2);
    expect(cfg?.diagramVariant)?.toBe('suv');
  });

  // ─── Minivan ───────────────────────────────────────────────────────────────
  it('returns minivan for 12 seats, 2 axles', () => {
    const cfg = getInspectionDiagramConfig(12, 2);
    expect(cfg?.diagramVariant)?.toBe('minivan');
    expect(cfg?.vehicleType)?.toBe('Minivan / Microbús');
  });

  it('returns minivan for 15 seats, 2 axles', () => {
    const cfg = getInspectionDiagramConfig(15, 2);
    expect(cfg?.diagramVariant)?.toBe('minivan');
  });

  // ─── Bus ───────────────────────────────────────────────────────────────────
  it('returns bus for 40 seats, 2 axles', () => {
    const cfg = getInspectionDiagramConfig(40, 2);
    expect(cfg?.diagramVariant)?.toBe('bus');
    expect(cfg?.tireCount)?.toBe(6);
    expect(cfg?.dualRearTires)?.toBe(true);
    expect(cfg?.vehicleType)?.toBe('Bus / Buseta');
  });

  // ─── Trucks ────────────────────────────────────────────────────────────────
  it('returns camion_3e for 3 axles', () => {
    const cfg = getInspectionDiagramConfig(3, 3);
    expect(cfg?.diagramVariant)?.toBe('camion_3e');
    expect(cfg?.tireCount)?.toBe(8);
    expect(cfg?.dualRearTires)?.toBe(true);
  });

  it('returns camion_4e for 4 axles', () => {
    const cfg = getInspectionDiagramConfig(3, 4);
    expect(cfg?.diagramVariant)?.toBe('camion_4e');
    expect(cfg?.dualRearTires)?.toBe(true);
  });

  it('returns camion_4e for 5 axles', () => {
    const cfg = getInspectionDiagramConfig(3, 5);
    expect(cfg?.diagramVariant)?.toBe('camion_4e');
  });

  // ─── Edge cases ────────────────────────────────────────────────────────────
  it('handles minimum seats (1) gracefully', () => {
    const cfg = getInspectionDiagramConfig(1, 2);
    expect(cfg)?.toBeDefined();
    expect(cfg?.seatCount)?.toBe(1);
  });

  it('handles large seat count (100)', () => {
    const cfg = getInspectionDiagramConfig(100, 2);
    expect(cfg?.diagramVariant)?.toBe('bus');
  });

  it('is idempotent — same inputs always produce same output', () => {
    const a = getInspectionDiagramConfig(5, 2);
    const b = getInspectionDiagramConfig(5, 2);
    expect(a)?.toEqual(b);
  });

  it('axleCount in result matches input axles', () => {
    const cfg = getInspectionDiagramConfig(5, 3);
    expect(cfg?.axleCount)?.toBe(3);
  });

  it('seatCount in result matches input seats', () => {
    const cfg = getInspectionDiagramConfig(7, 2);
    expect(cfg?.seatCount)?.toBe(7);
  });
});
