import { parseAddressLine } from './extract/parseAddress';
import type { Extraction } from './extract/types';

export function manualExtraction(text: string): Extraction {
  const raw = text.replace(/\s+/g, ' ').trim();
  return { source: 'manual', listingId: null, raw, parts: parseAddressLine(raw), from: 'manual' };
}
