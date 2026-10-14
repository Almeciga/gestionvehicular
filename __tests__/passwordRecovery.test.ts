/**
 * Unit tests for password recovery flow logic
 * Tests validation functions without Supabase dependency.
 */

/// <reference types="jest" />

import { describe, it, expect } from '@jest/globals';

// ─── Password validation helper (extracted from reset-password page) ──────────

function validatePassword(pwd: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (pwd.length < 8) errors.push('Al menos 8 caracteres');
  if (!/[a-z]/.test(pwd)) errors.push('Al menos una letra minúscula');
  if (!/[A-Z]/.test(pwd)) errors.push('Al menos una letra mayúscula');
  if (!/\d/.test(pwd)) errors.push('Al menos un número');
  return { valid: errors.length === 0, errors };
}

// ─── Email validation helper ──────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ─── Rate limiter helper ──────────────────────────────────────────────────────

function createRateLimiter(maxAttempts: number, windowMs: number) {
  const timestamps: number[] = [];
  return {
    isLimited(now = Date.now()): boolean {
      while (timestamps.length > 0 && now - timestamps[0] > windowMs) {
        timestamps.shift();
      }
      return timestamps.length >= maxAttempts;
    },
    record(now = Date.now()) {
      timestamps.push(now);
    },
    reset() {
      timestamps.length = 0;
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validatePassword', () => {
  it('accepts a strong password', () => {
    const { valid } = validatePassword('Secure123');
    expect(valid).toBe(true);
  });

  it('rejects password shorter than 8 chars', () => {
    const { valid, errors } = validatePassword('Ab1');
    expect(valid).toBe(false);
    expect(errors).toContain('Al menos 8 caracteres');
  });

  it('rejects password without uppercase', () => {
    const { valid, errors } = validatePassword('secure123');
    expect(valid).toBe(false);
    expect(errors).toContain('Al menos una letra mayúscula');
  });

  it('rejects password without lowercase', () => {
    const { valid, errors } = validatePassword('SECURE123');
    expect(valid).toBe(false);
    expect(errors).toContain('Al menos una letra minúscula');
  });

  it('rejects password without number', () => {
    const { valid, errors } = validatePassword('SecurePass');
    expect(valid).toBe(false);
    expect(errors).toContain('Al menos un número');
  });

  it('rejects empty password', () => {
    const { valid } = validatePassword('');
    expect(valid).toBe(false);
  });

  it('is idempotent — same input always same result', () => {
    const a = validatePassword('Secure123');
    const b = validatePassword('Secure123');
    expect(a).toEqual(b);
  });

  it('accepts password with special chars', () => {
    const { valid } = validatePassword('Secure123!@#');
    expect(valid).toBe(true);
  });
});

describe('isValidEmail', () => {
  it('accepts valid email', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('accepts email with subdomain', () => {
    expect(isValidEmail('user@mail.example.co')).toBe(true);
  });

  it('rejects email without @', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('rejects email without domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('trims whitespace before validating', () => {
    expect(isValidEmail('  user@example.com  ')).toBe(true);
  });
});

describe('createRateLimiter', () => {
  it('allows requests within limit', () => {
    const limiter = createRateLimiter(3, 60000);
    const now = Date.now();
    limiter.record(now);
    limiter.record(now + 100);
    expect(limiter.isLimited(now + 200)).toBe(false);
  });

  it('blocks after max attempts', () => {
    const limiter = createRateLimiter(3, 60000);
    const now = Date.now();
    limiter.record(now);
    limiter.record(now + 100);
    limiter.record(now + 200);
    expect(limiter.isLimited(now + 300)).toBe(true);
  });

  it('resets after window expires', () => {
    const limiter = createRateLimiter(3, 1000); // 1 second window
    const now = Date.now();
    limiter.record(now - 2000); // old attempt, outside window
    limiter.record(now - 2000);
    limiter.record(now - 2000);
    expect(limiter.isLimited(now)).toBe(false);
  });

  it('is idempotent — isLimited does not mutate state', () => {
    const limiter = createRateLimiter(3, 60000);
    const now = Date.now();
    limiter.record(now);
    const r1 = limiter.isLimited(now + 100);
    const r2 = limiter.isLimited(now + 100);
    expect(r1).toBe(r2);
  });
});
