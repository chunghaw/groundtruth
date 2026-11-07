"use client";

import { useEffect, useState } from "react";
import { fetchStreetPhoto, type StreetPhoto as Photo } from "@/lib/mapillary";
import { Facade } from "./Illustrations";
import type { PropertyKind } from "../presets";

const TOKEN = process.env.NEXT_PUBLIC_MAPILLARY_TOKEN ?? "";

interface StreetPhotoProps {
  readonly lat: number;
  readonly lon: number;
  readonly kind: PropertyKind;
}

/** Street-level photo from Mapillary (CC-BY-SA) when a token is configured; otherwise our own illustration. */
export function StreetPhoto({ lat, lon, kind }: StreetPhotoProps) {
  const [photo, setPhoto] = useState<Photo | null>(null);

  useEffect(() => {
    setPhoto(null);
    if (!TOKEN) return;
    const ctrl = new AbortController();
    fetchStreetPhoto(TOKEN, lat, lon, ctrl.signal)
      .then(setPhoto)
      .catch(() => setPhoto(null)); // graceful: keep the illustration
    return () => ctrl.abort();
  }, [lat, lon]);

  if (!photo) {
    return (
      <figure className="tile tile-illustration">
        <Facade kind={kind} />
        <figcaption>Illustration</figcaption>
      </figure>
    );
  }
  return (
    <figure className="tile tile-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt="Street-level view near the address" width={1024} height={768} loading="lazy" />
      <figcaption>
        <a href={photo.pageUrl} target="_blank" rel="noreferrer">
          © {photo.author ?? "Mapillary contributor"}, Mapillary, CC-BY-SA{photo.capturedAt ? ` · ${photo.capturedAt}` : ""}
        </a>
      </figcaption>
    </figure>
  );
}
