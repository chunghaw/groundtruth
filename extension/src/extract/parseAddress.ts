import type { AddressParts } from './types';

const STATES = 'NSW|VIC|QLD|SA|WA|TAS|NT|ACT';
const TAIL_RE = new RegExp(`[,\\s]+(${STATES})\\.?(?:[,\\s]+(\\d{4}))?\\s*$`, 'i');
const POSTCODE_ONLY_RE = /[,\s]+(\d{4})\s*$/;
const LEVEL_RE = /^(?:level|lvl|floor)\s+\w+\s*,?\s*/i;
const UNIT_TOKEN = '[A-Z]{0,2}\\d+[A-Z]{0,2}';
const DESIGNATOR_RE = new RegExp(
  `^(?:unit|apartment|apt|shop|suite|penthouse|lot|villa|flat|townhouse|studio|u)\\.?\\s*(${UNIT_TOKEN})\\s*[,/]?\\s*`, 'i');
const SLASH_RE = new RegExp(`^(${UNIT_TOKEN})\\s*/\\s*(.+)$`, 'i');
const NUMBER_STREET_RE = /^(\d+[A-Z]?(?:\s*-\s*\d+[A-Z]?)?)\s+(.*[A-Za-z].*)$/i;

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

interface Tail { readonly rest: string; readonly state: string | null; readonly postcode: string | null }

function splitTail(line: string): Tail {
  const m = TAIL_RE.exec(line);
  if (m) return { rest: line.slice(0, m.index), state: m[1].toUpperCase(), postcode: m[2] ?? null };
  const p = POSTCODE_ONLY_RE.exec(line);
  if (p) return { rest: line.slice(0, p.index), state: null, postcode: p[1] };
  return { rest: line, state: null, postcode: null };
}

interface StreetLine { readonly unit: string | null; readonly number: string; readonly street: string }

/** Parse "Level 16, 1603/209 Castlereagh Street" style street lines. */
export function parseStreetLine(input: string): StreetLine | null {
  let s = clean(input).replace(LEVEL_RE, '');
  let unit: string | null = null;
  const d = DESIGNATOR_RE.exec(s);
  if (d) {
    unit = d[1].toUpperCase();
    s = s.slice(d[0].length);
  }
  const slash = SLASH_RE.exec(s);
  if (slash) {
    if (unit === null) unit = slash[1].toUpperCase();
    s = slash[2];
  }
  const ns = NUMBER_STREET_RE.exec(clean(s));
  if (!ns) return null;
  return { unit, number: ns[1].replace(/\s+/g, '').toUpperCase(), street: clean(ns[2]) };
}

/**
 * Parse a displayed listing address (REA "Suburb, NSW 2010" or Domain "Suburb NSW 2016").
 * Pure; extracts in memory only. Returns null when there is no street-level address.
 */
export function parseAddressLine(input: string): AddressParts | null {
  const line = clean(input ?? '').replace(/,\s*$/, '');
  if (!line) return null;
  const { rest, state, postcode } = splitTail(line);
  const segments = rest.split(',').map(clean).filter(Boolean);
  if (segments.length < 2) return null;
  const suburb = segments[segments.length - 1];
  const streetLine = parseStreetLine(segments.slice(0, -1).join(', '));
  if (!streetLine || !/[A-Za-z]/.test(suburb)) return null;
  return { unit: streetLine.unit, number: streetLine.number, street: streetLine.street, suburb, state, postcode };
}

export function formatAddress(p: AddressParts, style: 'rea' | 'domain' = 'domain'): string {
  const first = `${p.unit ? `${p.unit}/` : ''}${p.number} ${p.street}`;
  const tail = [p.state, p.postcode].filter(Boolean).join(' ');
  if (!tail) return `${first}, ${p.suburb}`;
  return style === 'rea' ? `${first}, ${p.suburb}, ${tail}` : `${first}, ${p.suburb} ${tail}`;
}
