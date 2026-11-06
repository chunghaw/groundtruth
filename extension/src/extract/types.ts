export type Site = 'rea' | 'domain';
export type Source = Site | 'manual';

/** Address fields only. Nothing else from the listing is ever represented. */
export interface AddressParts {
  readonly unit: string | null;
  readonly number: string;
  readonly street: string;
  readonly suburb: string;
  readonly state: string | null;
  readonly postcode: string | null;
}

export type ExtractedFrom = 'h1' | 'h1+json-ld' | '__NEXT_DATA__' | 'manual';

export interface Extraction {
  readonly source: Source;
  readonly listingId: string | null;
  readonly raw: string;
  readonly parts: AddressParts | null;
  readonly from: ExtractedFrom;
}
