/**
 * Unit tests for LicenseNotice component
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from '@jest/globals';
import LicenseNotice from '../src/components/LicenseNotice';

describe('LicenseNotice', () => {
  it('renders the license notice text', () => {
    render(<LicenseNotice />);
    expect(screen.getByText(/tienes pendiente un pago/i)).toBeInTheDocument();
  });

  it('has pointer-events-none so it does not block clicks', () => {
    const { container } = render(<LicenseNotice />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('pointer-events-none');
  });

  it('is fixed positioned in bottom-right corner', () => {
    const { container } = render(<LicenseNotice />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('fixed');
    expect(el.className).toContain('bottom-2');
    expect(el.className).toContain('right-2');
  });

  it('has high z-index to appear above other content', () => {
    const { container } = render(<LicenseNotice />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('z-[9999]');
  });

  it('has low opacity for discreteness', () => {
    const { container } = render(<LicenseNotice />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.opacity).toBe('0.45');
  });

  it('renders consistently (idempotent)', () => {
    const { container: c1 } = render(<LicenseNotice />);
    const { container: c2 } = render(<LicenseNotice />);
    expect(c1.innerHTML).toBe(c2.innerHTML);
  });
});
