import { useEffect, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { GeoSearchControl, OpenStreetMapProvider } from "leaflet-geosearch";
import "leaflet-geosearch/dist/geosearch.css";
import { GeoJSON } from "react-leaflet";
import { Select } from "@chakra-ui/react";
import {
  BASEMAPS,
  DEFAULT_ADMIN_BASEMAP,
  SF_VIEWBOX,
  loadBasemap,
  saveBasemap,
  type BasemapId,
} from "../lib/mapBasemaps";
import { type GeoGeometry } from "../lib/geo";

export function isGeoGeometry(raw: unknown): raw is GeoGeometry {
  if (!raw || typeof raw !== "object") return false;
  const g = raw as { type?: string };
  return g.type === "Polygon" || g.type === "MultiPolygon";
}

export function usePersistedBasemap(
  storageKey: string,
  fallback: BasemapId = DEFAULT_ADMIN_BASEMAP,
) {
  const [basemap, setBasemapState] = useState<BasemapId>(() =>
    loadBasemap(storageKey, fallback),
  );
  const setBasemap = (id: BasemapId) => {
    setBasemapState(id);
    saveBasemap(storageKey, id);
  };
  return [basemap, setBasemap] as const;
}

export function BasemapTileLayer({ basemap }: { basemap: BasemapId }) {
  const def = BASEMAPS[basemap];
  return (
    <TileLayer
      key={def.id}
      url={def.url}
      attribution={def.attribution}
      maxZoom={def.maxZoom}
    />
  );
}

export function BasemapSelect({
  value,
  onChange,
  size = "xs",
}: {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
  size?: "xs" | "sm";
}) {
  return (
    <Select
      size={size}
      value={value}
      onChange={(e) => onChange(e.target.value as BasemapId)}
      w="110px"
      aria-label="Basemap"
    >
      {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
        <option key={id} value={id}>
          {BASEMAPS[id].label}
        </option>
      ))}
    </Select>
  );
}

/** Nominatim place search control (admin surfaces only). */
export function PlaceSearchControl({
  zoomLevel = 15,
}: {
  zoomLevel?: number;
}) {
  const map = useMap();
  useEffect(() => {
    const provider = new OpenStreetMapProvider({
      params: {
        "accept-language": "en",
        countrycodes: "us",
        viewbox: SF_VIEWBOX,
        bounded: 1,
      },
    });
    const control = GeoSearchControl({
      provider,
      style: "bar",
      showMarker: false,
      showPopup: false,
      autoClose: true,
      retainZoomLevel: false,
      animateZoom: true,
      searchLabel: "Search places…",
      zoomLevel,
      position: "topleft",
    });
    map.addControl(control);
    return () => {
      map.removeControl(control);
    };
  }, [map, zoomLevel]);
  return null;
}

export function InvalidateMapSize({ deps }: { deps: unknown[] }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...deps]);
  return null;
}

export type QuietNeighborhood = {
  id: string;
  name: string;
  emoji?: string | null;
  boundary: unknown;
  onMap?: boolean;
};

/**
 * Faint neighborhood polygons for admin canvases.
 * Minimal hover; click pans/fits the neighborhood (does not place pins).
 */
export function QuietNeighborhoodLayers({
  neighborhoods,
  fillOpacity = 0.1,
  showTooltip = false,
}: {
  neighborhoods: QuietNeighborhood[];
  fillOpacity?: number;
  /** Sticky hover tooltip — prefer false on draft board. */
  showTooltip?: boolean;
}) {
  const map = useMap();
  const features = neighborhoods
    .filter((n) => n.onMap !== false && isGeoGeometry(n.boundary))
    .map((n) => ({
      type: "Feature" as const,
      properties: { id: n.id, name: n.name, emoji: n.emoji ?? null },
      geometry: n.boundary as GeoGeometry,
    }));

  return (
    <>
      {features.map((f) => (
        <GeoJSON
          key={f.properties.id}
          data={f as any}
          style={() => ({
            color: "#718096",
            weight: 1,
            fillColor: "#A0AEC0",
            fillOpacity,
          })}
          onEachFeature={(feature, layer) => {
            const name = feature.properties?.name ?? "";
            const emoji = feature.properties?.emoji;
            if (showTooltip) {
              layer.bindTooltip(emoji ? `${emoji} ${name}` : name, {
                sticky: true,
                opacity: 0.85,
              });
            }
            layer.on({
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                const path = e.target as L.Polygon;
                if (typeof path.getBounds === "function") {
                  const b = path.getBounds();
                  if (b.isValid()) {
                    map.fitBounds(b, {
                      padding: [40, 40],
                      maxZoom: 15,
                      animate: true,
                    });
                  }
                }
              },
              mouseover: (e) => {
                const path = e.target as L.Path;
                path.setStyle({
                  fillOpacity: Math.min(fillOpacity + 0.08, 0.25),
                });
              },
              mouseout: (e) => {
                const path = e.target as L.Path;
                path.setStyle({ fillOpacity });
              },
            });
          }}
        />
      ))}
    </>
  );
}
