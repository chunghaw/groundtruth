import { parseAddressLine } from '../src/extract/parseAddress';

describe('parseAddressLine', () => {
  const cases: Array<[string, Record<string, string | null>]> = [
    ['902/417-419 Bourke Street, Surry Hills, NSW 2010',
      { unit: '902', number: '417-419', street: 'Bourke Street', suburb: 'Surry Hills', state: 'NSW', postcode: '2010' }],
    ['33/41 Pitt Street, Redfern NSW 2016',
      { unit: '33', number: '41', street: 'Pitt Street', suburb: 'Redfern', state: 'NSW', postcode: '2016' }],
    ['G03/280 Jones St, Ultimo, NSW 2007',
      { unit: 'G03', number: '280', street: 'Jones St', suburb: 'Ultimo', state: 'NSW', postcode: '2007' }],
    ['C902/24-26 Point Street, Pyrmont NSW 2009',
      { unit: 'C902', number: '24-26', street: 'Point Street', suburb: 'Pyrmont', state: 'NSW', postcode: '2009' }],
    ['20E/4 Delmar Parade, Dee Why, NSW 2099',
      { unit: '20E', number: '4', street: 'Delmar Parade', suburb: 'Dee Why', state: 'NSW', postcode: '2099' }],
    ['Level 16, 1603/209 Castlereagh Street, Sydney NSW 2000',
      { unit: '1603', number: '209', street: 'Castlereagh Street', suburb: 'Sydney', state: 'NSW', postcode: '2000' }],
    ['Unit 12, 45 Crown St, Woolloomooloo, NSW 2011',
      { unit: '12', number: '45', street: 'Crown St', suburb: 'Woolloomooloo', state: 'NSW', postcode: '2011' }],
    ['1A Great Buckingham Street, Redfern, NSW 2016',
      { unit: null, number: '1A', street: 'Great Buckingham Street', suburb: 'Redfern', state: 'NSW', postcode: '2016' }],
    ['Apartment 5, 10 Harris Street, Pyrmont NSW 2009',
      { unit: '5', number: '10', street: 'Harris Street', suburb: 'Pyrmont', state: 'NSW', postcode: '2009' }],
    ['5 / 10 Harris Street, Pyrmont NSW 2009',
      { unit: '5', number: '10', street: 'Harris Street', suburb: 'Pyrmont', state: 'NSW', postcode: '2009' }],
    ['Unit 3 12 Ada Place, Ultimo NSW 2007',
      { unit: '3', number: '12', street: 'Ada Place', suburb: 'Ultimo', state: 'NSW', postcode: '2007' }],
    ['3 Defries Avenue, Zetland, NSW 2017',
      { unit: null, number: '3', street: 'Defries Avenue', suburb: 'Zetland', state: 'NSW', postcode: '2017' }],
    ['801/2 Defries Avenue, Zetland NSW 2017',
      { unit: '801', number: '2', street: 'Defries Avenue', suburb: 'Zetland', state: 'NSW', postcode: '2017' }],
    ['  1203/38 Albert Avenue,   Chatswood,  NSW  2067  ',
      { unit: '1203', number: '38', street: 'Albert Avenue', suburb: 'Chatswood', state: 'NSW', postcode: '2067' }],
    ['14 The Avenue, Rose Bay NSW 2029',
      { unit: null, number: '14', street: 'The Avenue', suburb: 'Rose Bay', state: 'NSW', postcode: '2029' }],
    ['Shop 2/88 Cleveland Street, Chippendale NSW 2008',
      { unit: '2', number: '88', street: 'Cleveland Street', suburb: 'Chippendale', state: 'NSW', postcode: '2008' }],
    ['Penthouse 2, 15 Bayswater Rd, Potts Point VIC 3000',
      { unit: '2', number: '15', street: 'Bayswater Rd', suburb: 'Potts Point', state: 'VIC', postcode: '3000' }],
    ['Lot 4/12 Smith Street, Redfern NSW 2016',
      { unit: '4', number: '12', street: 'Smith Street', suburb: 'Redfern', state: 'NSW', postcode: '2016' }],
  ];

  it.each(cases)('parses %s', (input, expected) => {
    expect(parseAddressLine(input)).toEqual(expected);
  });

  it('returns null for non-addresses', () => {
    expect(parseAddressLine('')).toBeNull();
    expect(parseAddressLine('Address available on request')).toBeNull();
    expect(parseAddressLine('Surry Hills, NSW 2010')).toBeNull();
  });

  it('handles a missing postcode/state gracefully', () => {
    expect(parseAddressLine('12 Crown Street, Surry Hills')).toEqual({
      unit: null, number: '12', street: 'Crown Street', suburb: 'Surry Hills', state: null, postcode: null,
    });
  });
});
