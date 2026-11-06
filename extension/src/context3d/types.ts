/** Mirror of the proxy's GET /api/context3d/:gnafId response (see docs/CONTRACT.md). */
export type Pos = [number, number];
export type HeightSource = 'hob' | 'fsr-estimate' | 'none';

export interface LotProps {
  readonly gnafId: string | null;
  readonly isSubject: boolean;
  readonly maxHeightM: number | null;
  readonly source: HeightSource;
  readonly fsr: number | null;
  readonly storeys: number | null;
}

export interface GeoFeature<P> { readonly type: 'Feature'; readonly geometry: { readonly type: string; readonly coordinates: unknown }; readonly properties: P }
export interface GeoCollection<P> { readonly type: 'FeatureCollection'; readonly features: readonly GeoFeature<P>[] }

export interface Highlight {
  readonly gnafId: string | null;
  readonly maxHeightM: number;
  readonly storeys: number;
  readonly source: HeightSource;
  readonly distanceM: number;
  readonly direction: string;
}

export interface Context3D {
  readonly gnafId: string;
  readonly available: boolean;
  readonly reason?: string;
  readonly center: Pos | null;
  readonly radiusM: number;
  readonly lots: GeoCollection<LotProps>;
  readonly noise: GeoCollection<{ readonly color: string; readonly opacity: number }> | null;
  readonly busyRoads: GeoCollection<{ readonly roadClass: string }> | null;
  readonly subject: { readonly maxHeightM: number | null; readonly storeys: number | null; readonly source: HeightSource } | null;
  readonly tallestNeighbour: Highlight | null;
  readonly heightSource: 'hob' | 'fsr-estimate' | 'mixed' | 'none';
  readonly notes: readonly string[];
}

export type Overlay = 'noise' | 'roads';

export interface MapController {
  setOverlay(layer: Overlay, on: boolean): void;
  destroy(): void;
}

/** How a host (extension content script or web demo) supplies data and a map surface to the panel. */
export interface Context3DHost {
  load(gnafId: string): Promise<Context3D>;
  mount(stage: HTMLElement, data: Context3D): Promise<MapController>;
}

export function isContext3D(x: unknown): x is Context3D {
  const o = x as Context3D | null;
  return !!o && typeof o === 'object' && typeof o.gnafId === 'string' && !!o.lots && Array.isArray(o.lots.features);
}
