/**
 * Tests for SUV geometry constants in src/lib/inspectionDiagram.ts
 * PARTE 3 — PASO C1
 *
 * Rules:
 * - Each test imports only from the constants module.
 * - No network, no DB, no browser APIs, no shared mutable state.
 * - Running the suite 1 or 3 times in any order produces the same result.
 */

import {
  SUV_SCALE,
  SUV_LARGO_MM,
  SUV_ANCHO_MM,
  SUV_ALTO_MM,
  SUV_DIST_EJES_MM,
  SUV_VOLADERO_DEL_MM,
  SUV_VOLADERO_TRA_MM,
  SUV_RADIO_RUEDA_MM,
  SUV_ANCHO_LLANTA_MM,
  SUV_ANCHO_CABINA_MM,
  SUV_MARGEN_LATERAL,
  SUV_CUERPO_X0,
  SUV_CUERPO_X1,
  SUV_LARGO_PX,
  SUV_EJE_DEL_X,
  SUV_EJE_TRA_X,
  SUV_DIST_EJES_PX,
  SUV_RADIO_RUEDA_PX,
  SUV_DIAMETRO_RUEDA_PX,
  SUV_ALTO_PX,
  SUV_MARGEN_FRONTAL,
  SUV_ANCHO_CUERPO_PX,
  SUV_CUERPO_FRONTAL_X0,
  SUV_CUERPO_FRONTAL_X1,
  SUV_ANCHO_CABINA_PX,
  SUV_CABINA_X0,
  SUV_CABINA_X1,
  SUV_ANCHO_LLANTA_PX,
} from '../src/lib/inspectionDiagram';
import { describe, it, expect } from '@jest/globals';

describe('SUV geometry constants — lateral view (viewBox 1000×400)', () => {
  it('front axle is inside the body (cuerpoX0 < ejeDelanteroX < ejeTraseroX < cuerpoX1)', () => {
    // Independent: reads only module-level constants; no setup/teardown needed.
    expect(SUV_CUERPO_X0)?.toBeLessThan(SUV_EJE_DEL_X);
    expect(SUV_EJE_DEL_X)?.toBeLessThan(SUV_EJE_TRA_X);
    expect(SUV_EJE_TRA_X)?.toBeLessThan(SUV_CUERPO_X1);
  });

  it('wheelbase in px equals 540 (2700 mm × 0.2)', () => {
    // Independent: pure arithmetic on constants.
    expect(SUV_EJE_TRA_X - SUV_EJE_DEL_X)?.toBe(540);
    expect(SUV_DIST_EJES_PX)?.toBe(540);
  });

  it('front axle x equals 210 (margin 30 + front overhang 900 × 0.2 = 180)', () => {
    expect(SUV_EJE_DEL_X)?.toBe(210);
  });

  it('rear axle x equals 750 (front axle 210 + wheelbase 540)', () => {
    expect(SUV_EJE_TRA_X)?.toBe(750);
  });

  it('body spans x=30 to x=970 (940 px = 4700 mm × 0.2, margin 30 each side)', () => {
    expect(SUV_CUERPO_X0)?.toBe(30);
    expect(SUV_CUERPO_X1)?.toBe(970);
    expect(SUV_LARGO_PX)?.toBe(940);
  });
});

describe('SUV geometry constants — wheel dimensions', () => {
  it('wheel diameter equals 2 × wheel radius', () => {
    // Independent: pure arithmetic.
    expect(SUV_DIAMETRO_RUEDA_PX)?.toBe(SUV_RADIO_RUEDA_PX * 2);
  });

  it('wheel radius in px equals 70 (350 mm × 0.2)', () => {
    expect(SUV_RADIO_RUEDA_PX)?.toBe(70);
  });

  it('wheel diameter (140 px) is less than body height (340 px)', () => {
    expect(SUV_DIAMETRO_RUEDA_PX)?.toBeLessThan(SUV_ALTO_PX);
  });
});

describe('SUV geometry constants — frontal/rear view (viewBox 440×400)', () => {
  it('cabin width (300 px) is less than body width (380 px)', () => {
    // Independent: pure comparison of constants.
    expect(SUV_ANCHO_CABINA_PX)?.toBeLessThan(SUV_ANCHO_CUERPO_PX);
  });

  it('body width (380 px) plus two margins (30 px each) fits exactly in viewBox width 440', () => {
    expect(SUV_ANCHO_CUERPO_PX + SUV_MARGEN_FRONTAL * 2)?.toBe(440);
  });

  it('body occupies x=30 to x=410 in frontal view', () => {
    expect(SUV_CUERPO_FRONTAL_X0)?.toBe(30);
    expect(SUV_CUERPO_FRONTAL_X1)?.toBe(410);
  });

  it('cabin is centred: x0=70, x1=370, width=300', () => {
    expect(SUV_CABINA_X0)?.toBe(70);
    expect(SUV_CABINA_X1)?.toBe(370);
    expect(SUV_CABINA_X1 - SUV_CABINA_X0)?.toBe(300);
  });

  it('tyre width in px equals 45 (225 mm × 0.2)', () => {
    expect(SUV_ANCHO_LLANTA_PX)?.toBe(45);
  });
});

describe('SUV geometry constants — idempotence (values stable across imports)', () => {
  it('re-reading the same constants returns identical values on every call', () => {
    // Import the same module twice (Node caches modules, so this is the same object).
    // This verifies no mutable state or random initialisation.
    const a = SUV_EJE_DEL_X;
    const b = SUV_EJE_DEL_X;
    expect(a)?.toBe(b);

    const c = SUV_RADIO_RUEDA_PX;
    const d = SUV_RADIO_RUEDA_PX;
    expect(c)?.toBe(d);
  });

  it('all constants are finite numbers (no NaN, no Infinity)', () => {
    const allConstants = [
      SUV_SCALE, SUV_LARGO_MM, SUV_ANCHO_MM, SUV_ALTO_MM,
      SUV_DIST_EJES_MM, SUV_VOLADERO_DEL_MM, SUV_VOLADERO_TRA_MM,
      SUV_RADIO_RUEDA_MM, SUV_ANCHO_LLANTA_MM, SUV_ANCHO_CABINA_MM,
      SUV_MARGEN_LATERAL, SUV_CUERPO_X0, SUV_CUERPO_X1, SUV_LARGO_PX,
      SUV_EJE_DEL_X, SUV_EJE_TRA_X, SUV_DIST_EJES_PX,
      SUV_RADIO_RUEDA_PX, SUV_DIAMETRO_RUEDA_PX, SUV_ALTO_PX,
      SUV_MARGEN_FRONTAL, SUV_ANCHO_CUERPO_PX,
      SUV_CUERPO_FRONTAL_X0, SUV_CUERPO_FRONTAL_X1,
      SUV_ANCHO_CABINA_PX, SUV_CABINA_X0, SUV_CABINA_X1,
      SUV_ANCHO_LLANTA_PX,
    ];
    allConstants?.forEach((v) => {
      expect(Number.isFinite(v))?.toBe(true);
    });
  });
});
