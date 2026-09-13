'use client';

import { createClient } from '@/lib/supabase/client';

export type LogLevel = 'error' | 'warn' | 'info';

export interface ErrorLogEntry {
  id: string;
  level: LogLevel;
  message: string;
  stack?: string | null;
  context?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface LogOptions {
  context?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  userEmail?: string;
}

let _isLogging = false; // prevent recursive logging

// ─── Debounce buffer to avoid 429 Too Many Requests ──────────────────────────
interface BufferedLog {
  level: LogLevel;
  message: string;
  error?: unknown;
  options: LogOptions;
}

const _logBuffer: BufferedLog[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 5000; // flush at most once every 5 seconds

function scheduleFlush() {
  if (_flushTimer !== null) return; // already scheduled
  _flushTimer = setTimeout(async () => {
    _flushTimer = null;
    if (_logBuffer.length === 0) return;
    // Take all buffered entries and flush as a batch
    const batch = _logBuffer.splice(0, _logBuffer.length);
    await flushBatch(batch);
  }, DEBOUNCE_MS);
}

async function flushBatch(batch: BufferedLog[]) {
  if (_isLogging) return;
  _isLogging = true;
  try {
    const supabase = createClient();

    // Get user once for the whole batch
    let userId: string | undefined;
    let userEmail: string | undefined;
    try {
      const { data } = await supabase.auth.getUser();
      userId = data?.user?.id;
      userEmail = data?.user?.email ?? undefined;
    } catch {
      // ignore
    }

    const rows = batch.map((entry) => {
      let stack: string | undefined;
      let message = entry.message;
      if (entry.error instanceof Error) {
        stack = entry.error.stack;
        if (!message || message === entry.error.message) {
          message = entry.error.message;
        }
      } else if (typeof entry.error === 'string') {
        stack = entry.error;
      }
      return {
        level: entry.level,
        message: String(message).slice(0, 2000),
        stack: stack ? String(stack).slice(0, 5000) : null,
        context: entry.options.context ?? null,
        user_id: entry.options.userId ?? userId ?? null,
        user_email: entry.options.userEmail ?? userEmail ?? null,
        metadata: entry.options.metadata ?? {},
      };
    });

    // Single batch insert instead of N individual inserts
    await supabase.from('error_logs').insert(rows);
  } catch {
    // Silently fail — never throw from the logger
  } finally {
    _isLogging = false;
  }
}

function log(level: LogLevel, message: string, error?: unknown, options: LogOptions = {}) {
  _logBuffer.push({ level, message, error, options });
  scheduleFlush();
}

export const errorLogger = {
  error: (message: string, error?: unknown, options?: LogOptions) =>
    log('error', message, error, options ?? {}),
  warn: (message: string, error?: unknown, options?: LogOptions) =>
    log('warn', message, error, options ?? {}),
  info: (message: string, error?: unknown, options?: LogOptions) =>
    log('info', message, error, options ?? {}),
};

/**
 * Install global window error handlers.
 * Call once from a top-level client component (e.g. AppLayout).
 */
export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined') return;

  const handleError = (event: ErrorEvent) => {
    errorLogger.error(
      event.message || 'Uncaught error',
      event.error,
      { context: 'window.onerror', metadata: { filename: event.filename, lineno: event.lineno } }
    );
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    let message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
        ? reason
        : 'Unhandled promise rejection';
    errorLogger.error(message, reason, { context: 'unhandledrejection' });
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
}
