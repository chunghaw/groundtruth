/** Numeric values in a line, from digits and spoken English number words. */
const ONES: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, million: 1e6 };

/** Numeric values mentioned in a line, from digits ("3.9", "4/4") and spoken words ("eight hundred and thirty-two thousand"). */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const tokens = text.toLowerCase().replace(/(\d),(\d)/g, '$1$2').replace(/-/g, ' ').match(/\d+(?:\.\d+)?|[a-z]+|\//g) ?? [];
  let cur: number | null = null, total = 0, frac: string | null = null;
  const flush = () => {
    if (cur !== null || total) out.push(total + (cur ?? 0) + (frac ? Number(`0.${frac}`) : 0));
    cur = null; total = 0; frac = null;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\d/.test(t)) { flush(); out.push(Number(t)); continue; }
    if (t in ONES || t in TENS) {
      if (frac !== null) { frac += String(ONES[t] ?? ''); continue; }
      cur = (cur ?? 0) + (ONES[t] ?? TENS[t]);
      continue;
    }
    if (t in SCALES && (cur !== null || total)) {
      const s = SCALES[t];
      if (frac !== null) { cur = (cur ?? 0) + Number(`0.${frac || 0}`); frac = null; }
      if (s === 100) cur = (cur ?? 1) * 100; else { total += (cur ?? 1) * s; cur = null; }
      continue;
    }
    if (t === 'and' && (cur !== null || total) && (tokens[i + 1] in ONES || tokens[i + 1] in TENS)) continue;
    if (t === 'point' && cur !== null && tokens[i + 1] in ONES) { frac = ''; continue; }
    if (t === 'a' && tokens[i + 1] in SCALES) { cur = 1; continue; }
    flush();
  }
  flush();
  return out.filter((n) => !Number.isNaN(n));
}

