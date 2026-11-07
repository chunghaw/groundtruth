import type { AddressParts, Source } from './extract/types';

export type MatchState = 'EXACT' | 'BUILDING' | 'CHOOSE' | 'NO_MATCH' | 'OUT_OF_AREA';

export interface ResolveRequest {
  readonly source: Source;
  readonly raw: string;
  readonly parts: AddressParts | null;
  readonly bedrooms: number | null;
}

export interface Candidate { readonly gnafId: string; readonly label: string; readonly bedrooms: number | null }

export interface ResolveResponse {
  readonly state: MatchState;
  readonly confidence: number;
  readonly gnafId: string | null;
  readonly receipt: {
    readonly read: string;
    readonly normalised: string;
    readonly checks: Readonly<Record<string, boolean>>;
    readonly geocodeCandidates?: number;
  };
  readonly candidates: readonly Candidate[];
  readonly message?: string;
  /** The matched home's position (when the proxy knows it); centres the 3D model. */
  readonly location?: { readonly lat: number; readonly lng: number } | null;
}

export interface Fact<T = any> { readonly available: boolean; readonly data: T | null; readonly reason?: string }

export type FactKey = 'agentQuoting' | 'avm' | 'saleHistory' | 'streetProfile' | 'risks' | 'strataLevy' | 'basics';

export interface FactsResponse { readonly gnafId: string; readonly facts: Partial<Record<FactKey, Fact>> }

/** Messages content/popup -> background */
export type BgRequest =
  | { readonly type: 'gt:lookup'; readonly key: string; readonly req: ResolveRequest; readonly from: string }
  | { readonly type: 'gt:facts'; readonly key: string; readonly gnafId: string };

/** Background -> sender */
export type LookupResult =
  | { readonly ok: true; readonly key: string; readonly resolve: ResolveResponse; readonly facts: FactsResponse | null; readonly factsError?: string }
  | { readonly ok: false; readonly key: string; readonly error: string; readonly kind: 'unreachable' | 'http' | 'bad-response' };
