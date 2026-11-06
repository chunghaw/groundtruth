import { compareGuide, money, parseGuidePrice, pct, pickNumber } from '../src/content/format';

describe('parseGuidePrice (buyer-typed only)', () => {
  it.each([
    ['$1.2m', 1_200_000], ['1,250,000', 1_250_000], ['950k', 950_000], ['$950K', 950_000],
    ['1.05 million', 1_050_000], ['$800,000 - $880,000', 840_000], ['2m', 2_000_000],
  ])('%s -> %d', (s, n) => expect(parseGuidePrice(s)).toBe(n));
  it('rejects junk', () => {
    expect(parseGuidePrice('')).toBeNull();
    expect(parseGuidePrice('contact agent')).toBeNull();
    expect(parseGuidePrice('12')).toBeNull();
  });
});

describe('compareGuide', () => {
  const avm = { low: 900_000, mid: 1_000_000, high: 1_100_000 };
  it('flags below range', () => expect(compareGuide(800_000, avm).position).toBe('below'));
  it('inside range', () => expect(compareGuide(1_000_000, avm).position).toBe('inside'));
  it('above range', () => expect(compareGuide(1_200_000, avm).position).toBe('above'));
  it('reports gap to mid', () => expect(compareGuide(800_000, avm).gapPct).toBeCloseTo(-20));
});

describe('money / pct / pickNumber', () => {
  it('formats', () => {
    expect(money(1_234_567)).toBe('$1.23m');
    expect(money(845_000)).toBe('$845k');
    expect(money(4200)).toBe('$4,200');
    expect(money(null)).toBe('—');
    expect(pct(0.42)).toBe('42%');
    expect(pct(42)).toBe('42%');
  });
  it('pickNumber finds first numeric key', () => {
    expect(pickNumber({ a: 'x', predicted_price: '1000' }, ['avm', 'predicted_price'])).toBe(1000);
    expect(pickNumber(null, ['a'])).toBeNull();
  });
});
