import { parseAddressLine } from './parseAddress';

/** The first <h1> that parses as an address; otherwise the first non-empty <h1>. */
export function addressHeading(doc: Document): string {
  const texts = Array.from(doc.querySelectorAll('h1')).map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  return texts.find((t) => parseAddressLine(t) !== null) ?? texts[0] ?? '';
}
