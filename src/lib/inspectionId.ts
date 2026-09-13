'use client';

// ─── Enterprise Inspection ID Generator ───────────────────────────────────
// Format: BT-YYYY-XXXXXX (e.g. BT-2026-000145)

const COUNTER_KEY = 'gv_inspection_counter';

function readCounter(): number {
  if (typeof window === 'undefined') return 1;
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    return raw ? parseInt(raw, 10) : 1;
  } catch { return 1; }
}

function writeCounter(n: number): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(COUNTER_KEY, String(n)); } catch { /* ignore */ }
}

export function generateEnterpriseId(): string {
  const year = new Date().getFullYear();
  const counter = readCounter();
  writeCounter(counter + 1);
  const padded = String(counter).padStart(6, '0');
  return `BT-${year}-${padded}`;
}

export function isEnterpriseId(id: string): boolean {
  return /^BT-\d{4}-\d{6}$/.test(id);
}

/** Initialize counter from existing inspections to avoid duplicates */
export function initCounterFromExisting(existingIds: string[]): void {
  const btIds = existingIds.filter(isEnterpriseId);
  if (btIds.length === 0) return;
  const maxNum = Math.max(...btIds.map((id) => {
    const parts = id.split('-');
    return parseInt(parts[2] || '0', 10);
  }));
  const current = readCounter();
  if (maxNum >= current) {
    writeCounter(maxNum + 1);
  }
}
