/** Address-only snapshots captured from live listings on 2026-11-07 (no other listing content). */
import { extractFromDocument } from '../src/extract';

const doc = (html: string) => new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
const nd = (cp: object) => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { componentProps: cp } } })}</script>`;
const P = (unit: string | null, number: string, street: string, suburb: string, postcode: string) => ({ unit, number, street, suburb, state: 'NSW', postcode });

const REA: Array<[string, string, object]> = [
  ['https://www.realestate.com.au/property-apartment-nsw-surry+hills-121040229', '18/251-263 Goulburn Street, Surry Hills, NSW 2010', P('18', '251-263', 'Goulburn Street', 'Surry Hills', '2010')],
  ['https://www.realestate.com.au/property-apartment-nsw-pyrmont-151728784', '20E/4 Distillery Drive, Pyrmont, NSW 2009', P('20E', '4', 'Distillery Drive', 'Pyrmont', '2009')],
  ['https://www.realestate.com.au/property-apartment-nsw-zetland-152562392', '20/8 Grandstand Parade, Zetland, NSW 2017', P('20', '8', 'Grandstand Parade', 'Zetland', '2017')],
  ['https://www.realestate.com.au/property-apartment-nsw-surry+hills-152864656', '902/417-419 Bourke Street, Surry Hills, NSW 2010', P('902', '417-419', 'Bourke Street', 'Surry Hills', '2010')],
];

describe('live REA snapshots (SPA: second h1 "Your details" present)', () => {
  it.each(REA)('%s', (url, h1, parts) => {
    const r = extractFromDocument(doc(`<h1>${h1}</h1><h1>Your details</h1>`), url, { freshLoad: false })!;
    expect(r.parts).toEqual(parts);
  });
  it('picks the address h1 even if a non-address h1 comes first', () => {
    const r = extractFromDocument(doc('<h1>Your details</h1><h1>20E/4 Distillery Drive, Pyrmont, NSW 2009</h1>'), REA[1][0], { freshLoad: false })!;
    expect(r.parts).toEqual(REA[1][2]);
  });
});

const DOMAIN: Array<[string, object, object]> = [
  ['https://www.domain.com.au/902-417-419-bourke-street-surry-hills-nsw-2010-2021307655',
    { unitNumber: '902', streetNumber: '417-419', street: 'Bourke Street', suburb: 'Surry Hills', postcode: '2010', stateAbbreviation: 'nsw', listingId: 2021307655 }, P('902', '417-419', 'Bourke Street', 'Surry Hills', '2010')],
  ['https://www.domain.com.au/34-507-515-elizabeth-street-surry-hills-nsw-2010-2021307652',
    { unitNumber: '34', streetNumber: '507-515', street: 'Elizabeth Street', suburb: 'Surry Hills', postcode: '2010', stateAbbreviation: 'nsw', listingId: 2021307652 }, P('34', '507-515', 'Elizabeth Street', 'Surry Hills', '2010')],
  ['https://www.domain.com.au/2307-15-gadigal-avenue-zetland-nsw-2017-2021309372',
    { unitNumber: '2307', streetNumber: '15', street: 'Gadigal Avenue', suburb: 'Zetland', postcode: '2017', stateAbbreviation: 'nsw', listingId: 2021309372 }, P('2307', '15', 'Gadigal Avenue', 'Zetland', '2017')],
  ['https://www.domain.com.au/209-1-distillery-drive-pyrmont-nsw-2009-2020557578',
    { unitNumber: '209', streetNumber: '1', street: 'Distillery Drive', suburb: 'Pyrmont', postcode: '2009', stateAbbreviation: 'nsw', listingId: 2020557578 }, P('209', '1', 'Distillery Drive', 'Pyrmont', '2009')],
];

describe('live Domain snapshots', () => {
  it.each(DOMAIN)('%s via __NEXT_DATA__ and via h1 agree', (url, cp, parts) => {
    const c = cp as Record<string, string>;
    const h1 = `${c.unitNumber}/${c.streetNumber} ${c.street}, ${c.suburb} NSW ${c.postcode}`;
    expect(extractFromDocument(doc(nd(cp) + `<h1>${h1}</h1>`), url, { freshLoad: true })!.parts).toEqual(parts);
    expect(extractFromDocument(doc(`<h1>${h1}</h1>`), url, { freshLoad: true })!.parts).toEqual(parts);
  });
});
