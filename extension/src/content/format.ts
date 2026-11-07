export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}m`;
  if (Math.abs(n) >= 100_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n).toLocaleString('en-AU')}`;
}

/** Accepts a 0-1 fraction or a 0-100 percentage. */
export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const v = Math.abs(n) <= 1 ? n * 100 : n;
  return pctValue(v);
}

/** A value already in percent: 4.25 → "4.3%", 4.0 → "4%" (no 0–1 rescaling, unlike pct). */
export function pctValue(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toFixed(1).replace(/\.0$/, '')}%`;
}

export function pickNumber(obj: unknown, keys: readonly string[]): number | null {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/[$,%\s]/g, '')) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function pickString(obj: unknown, keys: readonly string[]): string | null {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function one(s: string): number | null {
  const m = /(\d+(?:[.,]\d+)*)\s*(m(?:il(?:lion)?)?|k)?\b/i.exec(s);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  const unit = (m[2] ?? '').toLowerCase();
  if (unit.startsWith('m')) n *= 1_000_000;
  else if (unit === 'k') n *= 1_000;
  return Number.isFinite(n) && n >= 10_000 ? n : null;
}

/** Parse a guide price the BUYER typed. Ranges return their midpoint. */
export function parseGuidePrice(input: string): number | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  const parts = s.split(/\s*(?:-|–|to)\s*(?=\$?\d)/i).map(one).filter((n): n is number => n !== null);
  if (parts.length === 0) return null;
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

export interface AvmRange { readonly low: number; readonly mid: number; readonly high: number }
export interface GuideComparison { readonly position: 'below' | 'inside' | 'above'; readonly gapPct: number }

export function compareGuide(guide: number, avm: AvmRange): GuideComparison {
  const position = guide < avm.low ? 'below' : guide > avm.high ? 'above' : 'inside';
  return { position, gapPct: ((guide - avm.mid) / avm.mid) * 100 };
}
