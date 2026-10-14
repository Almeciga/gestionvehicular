/**
 * Unit tests for LicenseNotice component
 *
 * Nota sobre el <br /> en el JSX (línea 17 del componente):
 *   Recuerda: tienes<br />pendiente un pago.
 * No hay espacio literal antes ni después del <br />.
 * El textContent del <p> es "Recuerda: tienespendiente un pago." (sin espacio).
 * Por eso las aserciones de texto usan textContent normalizado, no getByText con regex
 * que dependa de un espacio que no existe en el DOM.
 *
 * Valor fijo (hardcoded): el texto y la posición (bottom-[72px]) están hardcoded.
 * Un cambio legítimo de diseño romperá la prueba de posición.
 * Alternativa más robusta (no aplicada aquí, requiere tocar el componente):
 *   añadir data-testid="license-notice" al div y verificar por ese atributo,
 *   desacoplando la prueba de las clases CSS concretas.
 *
 * Limpieza: @testing-library/react ejecuta cleanup automáticamente después de
 * cada test cuando se usa con Jest (afterEach cleanup está activado por defecto
 * desde @testing-library/react v9+). No se necesita cleanup manual.
 *
 * Requiere entorno externo (navegador/Playwright):
 *   - Verificar que el aviso se vea completo en pantalla real sin quedar tapado
 *     por la barra de navegación inferior (bottom-[72px] es un valor CSS; jsdom
 *     no calcula layout ni posición visual).
 *   - Verificar que max-w-[calc(100vw-1rem)] impide el desbordamiento horizontal
 *     en viewports reales (360 px, 768 px, 1280 px).
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from '@jest/globals';
import LicenseNotice from '../src/components/LicenseNotice';

describe('LicenseNotice', () => {
  /**
   * Prueba 1 — renders the license notice text
   * Verifica el texto completo leyendo textContent del <p> y normalizando espacios,
   * en lugar de depender de getByText con regex que falla cuando el <br /> no aporta espacio.
   * Estado: Corregida, no ejecutada (sin terminal)
   */
  it('renders the license notice text', () => {
    const { container } = render(<LicenseNotice />);
    const p = container.querySelector('p') as HTMLElement;
    // textContent une los nodos de texto sin separador: "Recuerda: tienespendiente un pago."
    // Normalizamos espacios múltiples pero no añadimos el que no existe.
    const text = (p.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(text).toContain('Recuerda: tienes');
    expect(text).toContain('pendiente un pago.');
  });

  /**
   * Prueba 2 — has pointer-events-none so it does not block clicks
   * Sin cambios respecto al original; pasa con el código actual.
   * Estado: Sin cambios, no ejecutada (sin terminal)
   */
  it('has pointer-events-none so it does not block clicks', () => {
    const { container } = render(<LicenseNotice />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('pointer-events-none');
  });

  /**
   * Prueba 3 — is positioned above bottom nav and constrained in width
   * ANTES (línea 24 original): expect(el.className).toContain('bottom-2')
   *   → FALLABA porque el componente usa bottom-[72px], no bottom-2.
   * DESPUÉS: verifica el comportamiento real que importa:
   *   - fixed: el aviso está fuera del flujo normal del documento.
   *   - bottom-[72px]: queda por encima de la barra de navegación inferior (72 px),
   *     no pegado al borde inferior. Valor hardcoded; un cambio de diseño romperá esta prueba.
   *   - max-w-[calc(100vw-1rem)]: impide que el aviso se desborde horizontalmente.
   *   - right-2: alineado al borde derecho con margen de 0.5 rem.
   * Estado: Corregida, no ejecutada (sin terminal)
   */
  it('is positioned above bottom nav and constrained in width', () => {
    const { container } = render(<LicenseNotice />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('fixed');
    expect(el.className).toContain('bottom-[72px]');
    expect(el.className).toContain('right-2');
    expect(el.className).toContain('max-w-[calc(100vw-1rem)]');
  });

  /**
   * Prueba 4 — has high z-index to appear above other content
   * Sin cambios respecto al original; pasa con el código actual.
   * Estado: Sin cambios, no ejecutada (sin terminal)
   */
  it('has high z-index to appear above other content', () => {
    const { container } = render(<LicenseNotice />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('z-[9999]');
  });

  /**
   * Prueba 5 — has low opacity for discreteness
   * Sin cambios respecto al original; pasa con el código actual.
   * Estado: Sin cambios, no ejecutada (sin terminal)
   */
  it('has low opacity for discreteness', () => {
    const { container } = render(<LicenseNotice />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.opacity).toBe('0.45');
  });

  /**
   * Prueba 6 — renders consistently (idempotent)
   * Sin cambios respecto al original; pasa con el código actual.
   * Estado: Sin cambios, no ejecutada (sin terminal)
   */
  it('renders consistently (idempotent)', () => {
    const { container: c1 } = render(<LicenseNotice />);
    const { container: c2 } = render(<LicenseNotice />);
    expect(c1.innerHTML).toBe(c2.innerHTML);
  });
});
