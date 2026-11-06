/**
 * Offer ceiling: turns a guide price the BUYER typed into a realistic budget, using the agency's
 * guide-vs-sold track record, cross-checked against the Microburbs AVM range. Pure, no DOM.
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
export interface OfferInput { readonly avm: AvmInput | null; readonly quoting: QuotingInput | null; readonly guide: number | null }

export type OfferVerdict = 'believable' | 'low' | 'above' | 'none' | 'unknown';
export interface OfferResult {
  readonly verdict: OfferVerdict;
  readonly label: string;
  /** Expected sale price / realistic budget, or null when there is nothing to go on. */
  readonly budget: number | null;
  /** Whole-percent uplift the buyer should expect over the guide ('low' verdicts). */
  readonly upliftPct: number;
  /** One-line explanation of the maths. */
  readonly maths: string;
}

/** Agency deviation at or above this (percent) means "guide likely low". */
export const LOW_GUIDE_PCT = 5;
/** Fewer tracked sales than this and we ignore the agency record. */
export const MIN_AGENCY_SALES = 3;

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`;

function usableQuoting(q: QuotingInput | null): QuotingInput | null {
  if (!q || !Number.isFinite(q.medianDeviationPct)) return null;
  if (q.nSales !== null && q.nSales < MIN_AGENCY_SALES) return null;
  return q;
}

function rangeNote(avm: AvmInput | null): string {
  return avm ? ` Microburbs 80% range ${money(avm.low)}–${money(avm.high)}.` : '';
}

export function offerCeiling(input: OfferInput): OfferResult {
  const { avm, guide } = input;
  const quoting = usableQuoting(input.quoting);
  if (guide === null || !Number.isFinite(guide) || guide <= 0) {
    return {
      verdict: 'none', label: 'Type the guide to check it', budget: avm?.predicted ?? null, upliftPct: 0,
      maths: avm ? `Until you type a guide, the Microburbs estimate is ${money(avm.predicted)}.${rangeNote(avm)}` : 'Type the guide you were quoted to see a realistic budget.',
    };
  }
  if (!avm && !quoting) {
    return { verdict: 'unknown', label: 'Not enough data to check this guide', budget: null, upliftPct: 0, maths: 'No Microburbs value or agency track record for this home.' };
  }

  const dev = quoting?.medianDeviationPct ?? 0;
  const agentExpected = quoting ? Math.round(guide * (1 + dev / 100)) : null;
  const budget = agentExpected ?? Math.max(guide, avm!.predicted);
  const avmGapPct = avm && guide < avm.low ? ((avm.predicted - guide) / guide) * 100 : 0;

  const maths = quoting
    ? `${money(guide)} guide × (1 + ${dev}% median agency gap over ${quoting.nSales ?? '?'} sales) ≈ ${money(agentExpected)}.${rangeNote(avm)}`
    : `No agency track record — compared your ${money(guide)} guide with the Microburbs estimate ${money(avm!.predicted)}.${rangeNote(avm)}`;

  const tooHigh = avm ? guide > avm.high : dev <= -LOW_GUIDE_PCT;
  if (tooHigh) {
    return { verdict: 'above', label: avm ? 'Guide above our range' : 'Guide above what this agency usually gets', budget, upliftPct: 0, maths };
  }
  const uplift = Math.max(quoting && dev >= LOW_GUIDE_PCT ? dev : 0, avmGapPct);
  if (uplift > 0) {
    const x = Math.round(uplift);
    return { verdict: 'low', label: `Guide likely low — expect ~${signed(x)}`, budget, upliftPct: x, maths };
  }
  return { verdict: 'believable', label: 'Guide looks believable', budget, upliftPct: 0, maths };
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
