import { extractFromDocument, listingIdFromUrl, detectSite } from '../src/extract';

function doc(html: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
}
const REA_URL = 'https://www.realestate.com.au/property-apartment-nsw-surry+hills-146512345';
const DOMAIN_URL = 'https://www.domain.com.au/33-41-pitt-street-redfern-nsw-2016-2021262807';

describe('detectSite / listingIdFromUrl', () => {
  it('detects REA listing pages', () => {
    expect(detectSite(REA_URL)).toBe('rea');
    expect(listingIdFromUrl(REA_URL)).toBe('146512345');
    expect(listingIdFromUrl('https://www.realestate.com.au/buy/in-surry+hills,+nsw+2010/list-1')).toBeNull();
  });
  it('detects Domain listing pages', () => {
    expect(detectSite(DOMAIN_URL)).toBe('domain');
    expect(listingIdFromUrl(DOMAIN_URL)).toBe('2021262807');
    expect(listingIdFromUrl('https://www.domain.com.au/sale/surry-hills-nsw-2010/')).toBeNull();
    expect(listingIdFromUrl('https://www.domain.com.au/33-41-pitt-street-redfern-nsw-2016-2021262807?topspotlisting=1#x')).toBe('2021262807');
  });
  it('rejects other sites', () => {
    expect(detectSite('https://example.com/property-apartment-nsw-x-123')).toBeNull();
  });
});

describe('REA extraction', () => {
  it('reads the h1', () => {
    const d = doc('<h1 class="property-info-address">902/417-419 Bourke Street, Surry Hills, NSW 2010</h1>');
    const r = extractFromDocument(d, REA_URL, { freshLoad: false })!;
    expect(r.source).toBe('rea');
    expect(r.from).toBe('h1');
    expect(r.listingId).toBe('146512345');
    expect(r.parts).toMatchObject({ unit: '902', number: '417-419', street: 'Bourke Street', suburb: 'Surry Hills', postcode: '2010' });
  });

  it('uses JSON-LD only on fresh load and only when it agrees with the h1', () => {
    const ld = { '@type': 'Residence', address: { streetAddress: '902/417-419 Bourke Street', addressLocality: 'Surry Hills', addressRegion: 'NSW', postalCode: '2010' } };
    const html = `<script type="application/ld+json">${JSON.stringify(ld)}</script><h1>902/417-419 Bourke Street, Surry Hills, NSW 2010</h1>`;
    expect(extractFromDocument(doc(html), REA_URL, { freshLoad: true })!.from).toBe('h1+json-ld');
    expect(extractFromDocument(doc(html), REA_URL, { freshLoad: false })!.from).toBe('h1');
  });

  it('ignores disagreeing JSON-LD (stale) and never uses ArgonautExchange', () => {
    const ld = { '@type': 'Residence', address: { streetAddress: '5/1 Other Street', addressLocality: 'Pyrmont', addressRegion: 'NSW', postalCode: '2009' } };
    const html = `<script type="application/ld+json">${JSON.stringify(ld)}</script><h1>902/417-419 Bourke Street, Surry Hills, NSW 2010</h1>`;
    (window as any).ArgonautExchange = { address: '1 Agency Rd' };
    const r = extractFromDocument(doc(html), REA_URL, { freshLoad: true })!;
    expect(r.from).toBe('h1');
    expect(r.parts!.street).toBe('Bourke Street');
  });

  it('returns null when not a listing page', () => {
    expect(extractFromDocument(doc('<h1>Buy in Surry Hills</h1>'), 'https://www.realestate.com.au/buy/', { freshLoad: true })).toBeNull();
  });

  it('returns raw with null parts when h1 is unparseable', () => {
    const r = extractFromDocument(doc('<h1>Address available on request, Surry Hills</h1>'), REA_URL, { freshLoad: false })!;
    expect(r.parts).toBeNull();
    expect(r.raw).toContain('Address available');
  });
});

describe('Domain extraction', () => {
  const nextData = (cp: Record<string, unknown>) =>
    `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { componentProps: cp } } })}</script>`;

  it('uses __NEXT_DATA__ componentProps when listingId matches the URL', () => {
    const html = nextData({ unitNumber: '33', streetNumber: '41', street: 'Pitt Street', suburb: 'REDFERN', postcode: '2016', stateAbbreviation: 'nsw', listingId: 2021262807 })
      + '<h1>33/41 Pitt Street, Redfern NSW 2016</h1><div data-testid="address-wrapper">9/9 Wrong Rd, Nowhere NSW 1111</div>';
    const r = extractFromDocument(doc(html), DOMAIN_URL, { freshLoad: true })!;
    expect(r.from).toBe('__NEXT_DATA__');
    expect(r.parts).toEqual({ unit: '33', number: '41', street: 'Pitt Street', suburb: 'Redfern', state: 'NSW', postcode: '2016' });
  });

  it('falls back to the h1 when __NEXT_DATA__ is stale (listingId mismatch)', () => {
    const html = nextData({ unitNumber: '1', streetNumber: '2', street: 'Stale Street', suburb: 'Pyrmont', postcode: '2009', stateAbbreviation: 'NSW', listingId: 111 })
      + '<h1>33/41 Pitt Street, Redfern NSW 2016</h1>';
    const r = extractFromDocument(doc(html), DOMAIN_URL, { freshLoad: true })!;
    expect(r.from).toBe('h1');
    expect(r.parts).toMatchObject({ unit: '33', number: '41', street: 'Pitt Street', suburb: 'Redfern', state: 'NSW', postcode: '2016' });
  });

  it('never parses the slug (no h1, no next data => null parts)', () => {
    const r = extractFromDocument(doc(''), DOMAIN_URL, { freshLoad: true });
    expect(r).toBeNull();
  });

  it('handles houses with no unit in __NEXT_DATA__', () => {
    const html = nextData({ unitNumber: '', streetNumber: '1A', street: 'Great Buckingham Street', suburb: 'Redfern', postcode: '2016', stateAbbreviation: 'NSW', listingId: '2021262807' });
    const r = extractFromDocument(doc(html), DOMAIN_URL, { freshLoad: true })!;
    expect(r.parts).toEqual({ unit: null, number: '1A', street: 'Great Buckingham Street', suburb: 'Redfern', state: 'NSW', postcode: '2016' });
    expect(r.raw).toBe('1A Great Buckingham Street, Redfern NSW 2016');
  });

  it('returns only address fields (no price/agent etc)', () => {
    const html = nextData({ unitNumber: '33', streetNumber: '41', street: 'Pitt Street', suburb: 'Redfern', postcode: '2016', stateAbbreviation: 'NSW', listingId: 2021262807, price: '$1m', agentName: 'X' });
    const r = extractFromDocument(doc(html), DOMAIN_URL, { freshLoad: true })!;
    expect(Object.keys(r).sort()).toEqual(['from', 'listingId', 'parts', 'raw', 'source']);
    expect(Object.keys(r.parts!).sort()).toEqual(['number', 'postcode', 'state', 'street', 'suburb', 'unit']);
  });
});
