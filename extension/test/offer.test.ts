import { checkGuide, avmLine, quotingFromFact, avmFromFact } from '../src/content/offer';

// 313/6 Belvoir St: recorded guide $800k, AVM $785k (80% range $612k–$958k), agency +3.9% over 10 sales.
const avm = { predicted: 785_000, low: 612_000, high: 958_000, confidence: null };
const quoting = { medianDeviationPct: 3.9, underquoteRate: 0.6, nSales: 10 };

describe('checkGuide', () => {
  it('flags a typed guide that differs >5% from the recorded guide, with the AVM comparison second', () => {
    const r = checkGuide({ avm, quoting, asking: 800_000, guide: 900_000 });
    expect(r.headline).toEqual({ tone: 'warn', text: 'Differs from the guide on record ($800k)' });
    expect(r.detail).toBe('Microburbs’ listing record shows $800k for this home. Check which figure is current.');
    expect(r.second).toEqual({ tone: 'warn', text: 'Inside the range, but 15% above Microburbs’ estimate of $785k' });
    expect(r.evidence).toBe('Microburbs estimate $785k (likely range $612k–$958k)');
    expect(r.projection).toBe('With your $900k guide: about $935k if this agency runs true to form (+3.9% median over 10 sales).');
  });

  it('skips the record check within 5% and compares with the AVM', () => {
    const r = checkGuide({ avm, quoting, asking: 800_000, guide: 820_000 });
    expect(r.headline).toEqual({ tone: 'ok', text: 'In line with Microburbs’ estimate' });
    expect(r.second).toBeNull();
    expect(r.detail).toBeNull();
  });

  it('red above the range, amber below it, amber inside-but-off', () => {
    expect(checkGuide({ avm, quoting: null, asking: null, guide: 1_100_000 }).headline)
      .toEqual({ tone: 'bad', text: 'Well above Microburbs’ estimate' });
    expect(checkGuide({ avm, quoting: null, asking: null, guide: 550_000 }).headline)
      .toEqual({ tone: 'warn', text: 'Below Microburbs’ estimate — likely to sell higher' });
    expect(checkGuide({ avm, quoting: null, asking: null, guide: 680_000 }).headline)
      .toEqual({ tone: 'warn', text: 'Inside the range, but 13% below Microburbs’ estimate of $785k' });
    expect(checkGuide({ avm, quoting: null, asking: null, guide: 835_000 }).headline.tone).toBe('ok'); // +6.4%
  });

  it('without an AVM gives no verdict, only the agency projection', () => {
    const r = checkGuide({ avm: null, quoting, asking: null, guide: 1_000_000 });
    expect(r.headline.tone).toBe('none');
    expect(r.evidence).toBeNull();
    expect(r.projection).toBe('With your $1m guide: about $1.04m if this agency runs true to form (+3.9% median over 10 sales).');
  });

  it('ignores thin agency records and prompts when nothing is typed', () => {
    expect(checkGuide({ avm, quoting: { ...quoting, nSales: 2 }, asking: null, guide: 800_000 }).projection).toBeNull();
    const none = checkGuide({ avm, quoting, asking: 800_000, guide: null });
    expect(none.headline.tone).toBe('none');
    expect(none.second).toBeNull();
  });
});

describe('avmLine', () => {
  const rng = { low: 612_000, mid: 785_000, high: 958_000 };
  it('reads in plain English', () => {
    expect(avmLine(900_000, rng)).toBe('Your $900k is 15% above the estimate, inside the likely range');
    expect(avmLine(1_100_000, rng)).toBe('Your $1.1m is 40% above the estimate, above the likely range');
    expect(avmLine(550_000, rng)).toBe('Your $550k is 30% below the estimate, below the likely range');
    expect(avmLine(785_000, rng)).toBe('Your $785k is in line with the estimate, inside the likely range');
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
