/**
 * Guide check: compares a guide price the BUYER typed with Microburbs' recorded guide and AVM,
 * and projects it with the agency's guide-vs-sold record. Pure, no DOM.
 */
import type { Fact } from '../api-types';
import { money, pickNumber } from './format';

export interface AvmInput { readonly predicted: number; readonly low: number; readonly high: number; readonly confidence: number | null }
export interface QuotingInput {
  /** Median sold-vs-guide deviation in percent (6.5 = sold 6.5% above guide). */
  readonly medianDeviationPct: number;
  /** Share of sales that beat the guide, 0-1. */
  readonly underquoteRate: number | null;
  readonly nSales: number | null;
}
export interface GuideCheckInput {
  readonly avm: AvmInput | null;
  readonly quoting: QuotingInput | null;
  /** Microburbs' recorded guide for this listing (agent-quoting asking_price). */
  readonly asking: number | null;
  /** The guide the BUYER typed. */
  readonly guide: number | null;
}
export type Tone = 'ok' | 'warn' | 'bad' | 'none';
export interface Line { readonly tone: Tone; readonly text: string }
export interface GuideCheck {
  /** The first verdict that applies. */
  readonly headline: Line;
  /** Sub-line under the headline (record mismatch explanation). */
  readonly detail: string | null;
  /** The AVM comparison, when the headline is something else. */
  readonly second: Line | null;
  /** "Microburbs estimate $785k (likely range $612k–$958k)". */
  readonly evidence: string | null;
  /** "If this agency runs true to form (...), expect about $935k." */
  readonly projection: string | null;
}

/** Typed guide more than this far (fraction) from the recorded guide is flagged. */
export const RECORD_TOLERANCE = 0.05;
/** Within this fraction of the AVM point estimate counts as "in line". */
export const IN_LINE_TOLERANCE = 0.07;
/** Fewer tracked sales than this and we ignore the agency record. */
export const MIN_AGENCY_SALES = 3;

const valid = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;

function usableQuoting(q: QuotingInput | null): QuotingInput | null {
  if (!q || !Number.isFinite(q.medianDeviationPct)) return null;
  if (q.nSales !== null && q.nSales < MIN_AGENCY_SALES) return null;
  return q;
}

/** The tone of the AVM comparison; shared by the guide-check card and the value card. */
export function avmTone(guide: number, avm: Pick<AvmInput, 'predicted' | 'low' | 'high'>): Tone {
  return avmVerdict(guide, avm).tone;
}

function avmVerdict(guide: number, avm: Pick<AvmInput, 'predicted' | 'low' | 'high'>): Line {
  if (guide > avm.high) return { tone: 'bad', text: 'Well above Microburbs’ estimate' };
  if (guide < avm.low) return { tone: 'warn', text: 'Below Microburbs’ estimate — likely to sell higher' };
  const gap = (guide - avm.predicted) / avm.predicted;
  if (Math.abs(gap) <= IN_LINE_TOLERANCE) return { tone: 'ok', text: 'In line with Microburbs’ estimate' };
  return { tone: 'warn', text: `Inside the range, but ${Math.round(Math.abs(gap) * 100)}% ${gap > 0 ? 'above' : 'below'} Microburbs’ estimate of ${money(avm.predicted)}` };
}

function projection(guide: number, q: QuotingInput | null): string | null {
  if (!q) return null;
  const dev = q.medianDeviationPct;
  const sign = dev > 0 ? '+' : dev < 0 ? '−' : '';
  const over = q.nSales !== null ? ` over ${Math.round(q.nSales)} sales` : '';
  return `With your ${money(guide)} guide: about ${money(Math.round(guide * (1 + dev / 100)))} if this agency runs true to form (${sign}${Math.abs(dev)}% median${over}).`;
}

export function checkGuide(input: GuideCheckInput): GuideCheck {
  const { avm, asking, guide } = input;
  const evidence = avm ? `Microburbs estimate ${money(avm.predicted)} (likely range ${money(avm.low)}–${money(avm.high)})` : null;
  if (!valid(guide)) {
    return { headline: { tone: 'none', text: 'Type the guide to check it' }, detail: null, second: null, evidence, projection: null };
  }
  const proj = projection(guide, usableQuoting(input.quoting));
  const avmLineV = avm ? avmVerdict(guide, avm) : null;
  if (valid(asking) && Math.abs(guide - asking) / asking > RECORD_TOLERANCE) {
    return {
      headline: { tone: 'warn', text: `Differs from the guide on record (${money(asking)})` },
      detail: `Microburbs’ listing record shows ${money(asking)} for this home. Check which figure is current.`,
      second: avmLineV, evidence, projection: proj,
    };
  }
  if (avmLineV) return { headline: avmLineV, detail: null, second: null, evidence, projection: proj };
  return { headline: { tone: 'none', text: 'No Microburbs estimate to compare with' }, detail: null, second: null, evidence: null, projection: proj };
}

/** Value-card line: "Your $900k is 15% above the estimate, inside the likely range". */
export function avmLine(guide: number, rng: { readonly low: number; readonly mid: number; readonly high: number }): string {
  const gap = (guide - rng.mid) / rng.mid;
  const where = guide > rng.high ? 'above' : guide < rng.low ? 'below' : 'inside';
  const vs = Math.abs(gap) <= IN_LINE_TOLERANCE ? 'in line with the estimate' : `${Math.round(Math.abs(gap) * 100)}% ${gap > 0 ? 'above' : 'below'} the estimate`;
  return `Your ${money(guide)} is ${vs}, ${where} the likely range`;
}

export function quotingFromFact(fact: Fact | undefined): QuotingInput | null {
  if (!fact?.available || !fact.data) return null;
  const dev = pickNumber(fact.data, ['median_deviation_pct', 'avg_gap_pct']);
  if (dev === null) return null;
  const rate = pickNumber(fact.data, ['underquote_rate_pct', 'underquote_rate', 'underquoting_rate', 'pct_underquoted']);
  return {
    medianDeviationPct: dev,
    underquoteRate: rate === null ? null : rate > 1 ? rate / 100 : rate,
    nSales: pickNumber(fact.data, ['total_sales', 'n_sales', 'sample_size']),
  };
}

export function avmFromFact(fact: Fact | undefined): AvmInput | null {
  if (!fact?.available || !fact.data) return null;
  const predicted = pickNumber(fact.data, ['predicted_price', 'value', 'estimate', 'mid']);
  const low = pickNumber(fact.data, ['predicted_price_low', 'low', 'lower']);
  const high = pickNumber(fact.data, ['predicted_price_high', 'high', 'upper']);
  if (predicted === null || low === null || high === null || high <= low) return null;
  return { predicted, low, high, confidence: pickNumber(fact.data, ['confidence', 'confidence_score', 'accuracy']) };
}
