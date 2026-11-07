"use client";

import { useEffect, useRef, useState } from "react";

// MapLibre + OpenFreeMap: free, no key. Loaded from a pinned CDN build only on the demo page.
const MAPLIBRE_VERSION = "5.24.0";
const MAPLIBRE_JS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const MAPLIBRE_CSS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

interface MapLike {
  remove(): void;
  flyTo(o: { center: [number, number]; zoom?: number; pitch?: number; bearing?: number; duration?: number }): void;
  on(ev: string, fn: () => void): void;
}
interface MarkerLike { setLngLat(c: [number, number]): MarkerLike; addTo(m: MapLike): MarkerLike }
interface MapLibreGlobal {
  Map: new (o: Record<string, unknown>) => MapLike;
  Marker: new (o: { element: HTMLElement; anchor?: string }) => MarkerLike;
  AttributionControl: new (o: { compact: boolean }) => unknown;
}

let loader: Promise<MapLibreGlobal> | null = null;

function loadMapLibre(): Promise<MapLibreGlobal> {
  const w = window as unknown as { maplibregl?: MapLibreGlobal };
  if (w.maplibregl) return Promise.resolve(w.maplibregl);
  if (loader) return loader;
  loader = new Promise<MapLibreGlobal>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = MAPLIBRE_CSS;
    document.head.append(css);
    const s = document.createElement("script");
    s.src = MAPLIBRE_JS;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => (w.maplibregl ? resolve(w.maplibregl) : reject(new Error("MapLibre missing after load")));
    s.onerror = () => { loader = null; reject(new Error("MapLibre failed to load")); };
    document.head.append(s);
  });
  return loader;
}

interface HeroMapProps {
  readonly lat: number;
  readonly lon: number;
  readonly label: string;
}

/** Pitched 3D street map centred on the listing: our own hero image instead of listing photos. */
export function HeroMap({ lat, lon, label }: HeroMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLike | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    loadMapLibre()
      .then((gl) => {
        if (cancelled || !el.current) return;
        if (map.current) { map.current.flyTo({ center: [lon, lat], zoom: 16.4, pitch: 58, bearing: -24, duration: 1600 }); return; }
        const m = new gl.Map({
          container: el.current, style: STYLE_URL, center: [lon, lat], zoom: 16.4, pitch: 58, bearing: -24,
          interactive: false, attributionControl: false, fadeDuration: 0,
        });
        (m as unknown as { addControl(c: unknown, p: string): void }).addControl(new gl.AttributionControl({ compact: true }), "bottom-right");
        const pin = document.createElement("div");
        pin.className = "hero-pin";
        pin.setAttribute("aria-hidden", "true");
        new gl.Marker({ element: pin, anchor: "bottom" }).setLngLat([lon, lat]).addTo(m);
        m.on("load", () => { if (!cancelled) setStatus("ready"); });
        m.on("error", () => { /* tile hiccups are non-fatal */ });
        map.current = m;
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [lat, lon]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  return (
    <div className="hero-map" data-status={status} role="img" aria-label={`Street map around ${label}`}>
      <div ref={el} className="hero-map-canvas" />
      {status !== "ready" ? <div className="hero-map-veil">{status === "error" ? "Map unavailable offline" : "Loading street map…"}</div> : null}
    </div>
  );
}
