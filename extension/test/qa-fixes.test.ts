import { describe, expect, it } from 'vitest';
import { powerLineNear, riskMeaning, saleHistoryCard, risksCard } from '../src/content/cards';
import { pct, pctValue } from '../src/content/format';
import { sortByLevel, unitLabel, unitNumber } from '../src/content/panel';

describe('buyer QA fixes', () => {
  it('Last sales lists only sold rows; listings are muted below', () => {
    const el = saleHistoryCard({ available: true, data: [
      { date: '2026-09-01', price: 800000, type: 'For Sale' },
      { date: '2019-05-01', price: 700000, type: 'Sold' },
    ] });
    expect(el.querySelectorAll('ol.tl li').length).toBe(1);
    expect(el.querySelector('ol.tl')?.textContent).not.toContain('800');
    expect(el.querySelector('.listed')?.textContent).toBe('Listed $800k · Sep 2026');
  });

  it('on-property risks get a meaning; an HV line under 50 m is amber', () => {
    expect(riskMeaning('heritage Heritage')).toBe('May limit renovations');
    expect(powerLineNear('hv_power_lines', { distance_m: 30 }, '')).toBe(true);
    expect(powerLineNear('hv_power_lines', { distance_m: 80 }, '')).toBe(false);
    const el = risksCard({ available: true, data: { heritage: [{ name: 'Heritage', on_property: true }], hv: [{ name: 'HV power line', on_property: false, distance_m: 40 }] } });
    expect(el.querySelector('.risk-why')?.textContent).toBe('May limit renovations');
    expect(el.querySelectorAll('.risk .warn').length).toBe(1);
  });

  it('unit labels and level sorting', () => {
    expect(unitNumber('803/1 Alfred St')).toBe('803');
    expect(unitNumber('Unit 12, 1 Alfred St')).toBe('12');
    expect(unitNumber('1 Alfred Street')).toBeNull();
    expect(unitLabel({ gnafId: 'x', label: '803/1 Alfred St', bedrooms: 2 })).toBe('Unit 803 · 2 bed');
    const c = (l: string) => ({ gnafId: l, label: `${l}/1 Alfred St`, bedrooms: null });
    expect(sortByLevel([c('101'), c('80'), c('805')], '8').map((x) => x.gnafId)).toEqual(['805', '101', '80']);
  });

  it('percent formatting keeps one decimal', () => {
    expect(pct(0.425)).toBe('42.5%');
    expect(pct(40)).toBe('40%');
    expect(pctValue(0.8)).toBe('0.8%');
  });
});
