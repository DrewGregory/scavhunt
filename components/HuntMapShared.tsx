import { Fragment, useEffect, useRef, useState } from "react";
import { GeoJSON, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { GeoSearchControl, OpenStreetMapProvider } from "leaflet-geosearch";
import "leaflet-geosearch/dist/geosearch.css";
import { Select } from "@chakra-ui/react";
import {
  BASEMAPS,
  DEFAULT_ADMIN_BASEMAP,
  SF_VIEWBOX,
  loadBasemap,
  saveBasemap,
  type BasemapId,
} from "../lib/mapBasemaps";
import { centroidOf, type GeoGeometry } from "../lib/geo";

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
  centerLat?: number | null;
  centerLng?: number | null;
};

const BASE_NBH_STYLE: L.PathOptions = {
  color: "#718096",
  weight: 1,
  fillColor: "#E2E8F0",
  fillOpacity: 0.25,
};

const HOVER_NBH_STYLE: L.PathOptions = {
  fillColor: "#68D391",
  fillOpacity: 0.55,
  color: "#276749",
  weight: 3,
  dashArray: undefined,
};

/**
 * Neighborhood polygons matching the player map: visible fill, hover highlight,
 * name pills, click to pan. Use on admin draft / location maps.
 */
export function QuietNeighborhoodLayers({
  neighborhoods,
}: {
  neighborhoods: QuietNeighborhood[];
}) {
  const map = useMap();
  const highlightedRef = useRef<{
    layer: L.Path;
    style: L.PathOptions;
  } | null>(null);

  const withGeom = neighborhoods.filter(
    (n) => n.onMap !== false && isGeoGeometry(n.boundary),
  );

  return (
    <>
      {withGeom.map((n) => {
        const feature = {
          type: "Feature" as const,
          properties: { id: n.id, name: n.name, emoji: n.emoji ?? null },
          geometry: n.boundary as GeoGeometry,
        };
        const fromBoundary = centroidOf(n.boundary as GeoGeometry);
        const lat = fromBoundary?.lat ?? n.centerLat ?? null;
        const lng = fromBoundary?.lng ?? n.centerLng ?? null;
        const label = n.emoji ? `${n.emoji} ${n.name}` : n.name;

        return (
          <Fragment key={n.id}>
            <GeoJSON
              data={feature as any}
              style={() => ({ ...BASE_NBH_STYLE })}
              onEachFeature={(_feature, layer) => {
                const baseStyle = { ...BASE_NBH_STYLE };
                // Name comes from center pill — no sticky tooltip (avoids duplicates).
                layer.on({
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    const path = e.target as L.Polygon;
                    const el = (e.originalEvent?.target ?? null) as
                      | HTMLElement
                      | null;
                    el?.blur?.();
                    if (typeof (document.activeElement as HTMLElement | null)?.blur === "function") {
                      (document.activeElement as HTMLElement).blur();
                    }
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
                    const target = e.target as L.Path;
                    const prev = highlightedRef.current;
                    if (prev && prev.layer !== target) {
                      prev.layer.setStyle(prev.style);
                    }
                    target.setStyle(HOVER_NBH_STYLE);
                    if (typeof target.bringToFront === "function") {
                      target.bringToFront();
                    }
                    highlightedRef.current = {
                      layer: target,
                      style: baseStyle,
                    };
                  },
                  mouseout: (e) => {
                    const target = e.target as L.Path;
                    target.setStyle(baseStyle);
                    if (highlightedRef.current?.layer === target) {
                      highlightedRef.current = null;
                    }
                  },
                });
              }}
            />
            {lat != null && lng != null && (
              <Marker
                position={[lat, lng]}
                interactive={false}
                zIndexOffset={400}
                icon={L.divIcon({
                  className: "neighborhood-label-icon",
                  html: `<div class="neighborhood-label-pill" style="border-color:#CBD5E0">${label}</div>`,
                  iconSize: [0, 0],
                  iconAnchor: [0, 0],
                })}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
}
