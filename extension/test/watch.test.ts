import { CurrentListing, watchListing } from '../src/content/watch';

describe('watchListing', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = '<h1>1 A St, Redfern NSW 2016</h1>'; });
  afterEach(() => vi.useRealTimers());

  it('fires (debounced) on pushState URL changes', () => {
    const onChange = vi.fn();
    const stop = watchListing({ onChange, debounceMs: 100, pollMs: 10_000 });
    history.pushState({}, '', '/a-1234567');
    history.pushState({}, '', '/b-7654321');
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('fires on h1 text change via poll', () => {
    const onChange = vi.fn();
    const stop = watchListing({ onChange, debounceMs: 50, pollMs: 200 });
    document.querySelector('h1')!.textContent = '2 B St, Pyrmont NSW 2009';
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalled();
    stop();
  });

  it('restores history methods on stop', () => {
    const orig = history.pushState;
    const stop = watchListing({ onChange: () => {} });
    expect(history.pushState).not.toBe(orig);
    stop();
    expect(history.pushState).toBe(orig);
  });
});

describe('CurrentListing', () => {
  it('drops stale tokens', () => {
    const c = new CurrentListing();
    const t1 = c.begin('rea:1');
    const t2 = c.begin('rea:2');
    expect(c.isCurrent(t1, 'rea:1')).toBe(false);
    expect(c.isCurrent(t2, 'rea:2')).toBe(true);
  });
});
