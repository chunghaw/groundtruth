import { offerCeiling, quotingFromFact, avmFromFact } from '../src/content/offer';

const avm = { predicted: 1_000_000, low: 900_000, high: 1_100_000, confidence: 0.8 };
const quoting = { medianDeviationPct: 6.5, underquoteRate: 0.4, nSales: 12 };

describe('offerCeiling', () => {
  it('scales the typed guide by the agency median deviation and calls it low', () => {
    const r = offerCeiling({ avm, quoting, guide: 950_000 });
    expect(r.verdict).toBe('low');
    expect(r.budget).toBe(1_011_750);
    expect(r.upliftPct).toBe(7);
    expect(r.label).toBe('Guide likely low — expect ~+7%');
    expect(r.maths).toContain('× (1 + 6.5%');
    expect(r.maths).toContain('80% range');
  });

  it('calls a guide believable when the agency quotes honestly and it sits in range', () => {
    const r = offerCeiling({ avm, quoting: { medianDeviationPct: 1.2, underquoteRate: 0.1, nSales: 20 }, guide: 1_000_000 });
    expect(r.verdict).toBe('believable');
    expect(r.label).toBe('Guide looks believable');
    expect(r.budget).toBe(1_012_000);
  });

  it('flags a guide above the AVM range', () => {
    const r = offerCeiling({ avm, quoting: { medianDeviationPct: 0, underquoteRate: 0, nSales: 9 }, guide: 1_200_000 });
    expect(r.verdict).toBe('above');
    expect(r.label).toBe('Guide above our range');
  });

  it('says low when the guide is under the AVM range even if the agency is honest', () => {
    const r = offerCeiling({ avm, quoting: { medianDeviationPct: 0, underquoteRate: 0, nSales: 9 }, guide: 800_000 });
    expect(r.verdict).toBe('low');
    expect(r.upliftPct).toBe(25); // (1m - 800k) / 800k
  });

  it('falls back to an AVM-only verdict without agency data (or too few sales)', () => {
    for (const q of [null, { medianDeviationPct: 20, underquoteRate: 1, nSales: 2 }]) {
      const r = offerCeiling({ avm, quoting: q, guide: 950_000 });
      expect(r.verdict).toBe('believable');
      expect(r.budget).toBe(1_000_000);
      expect(r.maths).toMatch(/No agency track record/);
    }
  });

  it('uses agency data alone when there is no AVM', () => {
    const r = offerCeiling({ avm: null, quoting, guide: 1_000_000 });
    expect(r.verdict).toBe('low');
    expect(r.budget).toBe(1_065_000);
    expect(r.maths).not.toContain('80% range');
    const over = offerCeiling({ avm: null, quoting: { medianDeviationPct: -8, underquoteRate: 0, nSales: 10 }, guide: 1_000_000 });
    expect(over.verdict).toBe('above');
  });

  it('returns a prompt when no guide is typed, and unknown when there is nothing to go on', () => {
    const r = offerCeiling({ avm, quoting, guide: null });
    expect(r.verdict).toBe('none');
    expect(r.budget).toBe(1_000_000);
    expect(offerCeiling({ avm: null, quoting: null, guide: 1_000_000 }).verdict).toBe('unknown');
    expect(offerCeiling({ avm: null, quoting: null, guide: null }).budget).toBeNull();
  });
});

describe('fact adapters', () => {
  it('reads quoting and AVM facts, tolerating missing/unavailable ones', () => {
    expect(quotingFromFact({ available: true, data: { median_deviation_pct: 6.5, underquote_rate_pct: 40, total_sales: 12 } }))
      .toEqual({ medianDeviationPct: 6.5, underquoteRate: 0.4, nSales: 12 });
    expect(quotingFromFact({ available: false, data: null })).toBeNull();
    expect(quotingFromFact(undefined)).toBeNull();
    expect(avmFromFact({ available: true, data: { predicted_price: 1e6, predicted_price_low: 9e5, predicted_price_high: 1.1e6 } }))
      .toEqual({ predicted: 1e6, low: 9e5, high: 1.1e6, confidence: null });
    expect(avmFromFact({ available: true, data: { predicted_price: 1e6 } })).toBeNull();
  });
});
