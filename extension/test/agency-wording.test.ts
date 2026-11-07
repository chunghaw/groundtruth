import { describe, expect, it } from 'vitest';
import { agentQuotingCard } from '../src/content/cards';
import { priceBlockEl, priceEstimate, quotingVerdict, salesAboveGuide } from '../src/content/verdict';

const belvoir = {
  agency_name: 'McGrath Surry Hills', cohort: 'Mild Underquoter', median_deviation_pct: 3.9, underquote_rate_pct: 70,
  total_sales: 10, likely_sale_price: 832_000,
  recent_sales: [{ address: '5/68 Bayswater Road, Rushcutters Bay NSW 2011', sold_date: '2026-03-01', guide_price: 600_000, sold_price: 620_000, diff_pct: 3.3 }],
};
const facts = (agentQuoting: unknown, avm: unknown = null) => ({ gnafId: 'G', facts: {
  agentQuoting: agentQuoting ? { available: true, data: agentQuoting } : { available: false, data: null },
  avm: avm ? { available: true, data: avm } : { available: false, data: null },
} }) as any;

describe('salesAboveGuide', () => {
  it('derives "7 of 10" from rate × total', () => expect(salesAboveGuide(belvoir)).toBe('7 of 10 of this agency’s recent sales sold above their guide'));
  it('accepts a 0-1 rate', () => expect(salesAboveGuide({ underquote_rate: 0.333, total_sales: 3 })).toBe('1 of 3 of this agency’s recent sales sold above their guide'));
  it('is null when the rate or count is missing', () => {
    expect(salesAboveGuide({ total_sales: 10 })).toBeNull();
    expect(salesAboveGuide({ underquote_rate_pct: 70 })).toBeNull();
    expect(salesAboveGuide({ underquote_rate_pct: 70, total_sales: 0 })).toBeNull();
    expect(salesAboveGuide(null)).toBeNull();
  });
});

describe('agency card wording', () => {
  it('reads in plain English', () => {
    const el = agentQuotingCard({ available: true, data: belvoir } as any);
    const t = el.textContent ?? '';
    expect(el.querySelector('.aq-head')?.textContent).toBe('7 of 10 of this agency’s recent sales sold above their guide');
    expect(t).toContain('Typically 3.9% over the advertised price · McGrath Surry Hills');
    expect(el.querySelector('.cohort-pill')?.textContent).toBe('Mild underquoter');
    expect(t).toContain('How far sales landed from the guide (median +3.9%)');
    expect(t).toContain('Guide $600k → Sold $620k');
    expect(t).toContain('(+3.3%)');
    expect(t).toContain('This agency’s other recent sales');
    expect(el.querySelector('.aq-sales .addr')?.textContent).toBe('5/68 Bayswater Rd, Rushcutters Bay');
    expect(el.querySelector('.aq-sales li')?.textContent).toContain('Guide $600k → Sold $620k (+3.3%) · Mar 2026');
    expect(t).toContain('Treat the advertised guide as a floor, not an estimate');
    expect(t).not.toContain('beat the guide');
  });
});

describe('quotingVerdict', () => {
  it('uses the plain sales-above-guide count as its sub-line', () => {
    const v = quotingVerdict(facts(belvoir))!;
    expect(v.headline.join('')).toBe('Agency usually sells 3.9% over guide');
    expect(v.sub).toBe('7 of 10 of this agency’s recent sales sold above their guide · McGrath Surry Hills');
  });
  it('falls back to the count headline without a median', () => {
    const v = quotingVerdict(facts({ underquote_rate_pct: 70, total_sales: 10 }))!;
    expect(v.headline.join('')).toBe('7 of 10 of this agency’s recent sales sold above their guide');
  });
});

describe('priceEstimate', () => {
  it('shows the working from this home’s asking price', () => {
    const e = priceEstimate(facts({ ...belvoir, asking_price: 800_000, likely_sale_price: 831_520 }))!;
    expect(e.working).toBe('This home’s guide $800k + this agency’s typical +3.9% (median of 10 sales)');
    expect(priceBlockEl(e).textContent).toContain('This home’s guide $800k + this agency’s typical +3.9% (median of 10 sales)');
  });
  it('prefers the agency likely sale price', () => {
    expect(priceEstimate(facts(belvoir, { predicted_price: 900_000 }))).toEqual({ price: 832_000, label: 'Based on this agency’s guide-vs-sold record', range: null });
  });
  it('then the AVM with its 80% range', () => {
    expect(priceEstimate(facts(null, { predicted_price: 900_000, predicted_price_low: 800_000, predicted_price_high: 1_000_000 })))
      .toEqual({ price: 900_000, label: 'Microburbs estimate', range: { low: 800_000, high: 1_000_000 } });
  });
  it('then the buyer-typed guide × (1 + median deviation)', () => {
    const { likely_sale_price: _, ...noLikely } = belvoir;
    expect(priceEstimate(facts(noLikely), '$800k')?.price).toBe(831_200);
  });
  it('is null when nothing is known', () => {
    expect(priceEstimate(facts(null))).toBeNull();
    const { likely_sale_price: _, ...noLikely } = belvoir;
    expect(priceEstimate(facts(noLikely))).toBeNull();
  });
});
