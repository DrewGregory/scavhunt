/** Free raster basemaps for Leaflet TileLayer. */

export type BasemapId = "positron" | "dark" | "satellite" | "osm";

export type BasemapDef = {
  id: BasemapId;
  label: string;
  url: string;
  attribution: string;
  maxZoom?: number;
};

export const BASEMAPS: Record<BasemapId, BasemapDef> = {
  positron: {
    id: "positron",
    label: "Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  },
  dark: {
    id: "dark",
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  },
  satellite: {
    id: "satellite",
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxZoom: 19,
  },
  osm: {
    id: "osm",
    label: "OSM",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
};

export const DEFAULT_ADMIN_BASEMAP: BasemapId = "positron";
export const DEFAULT_PLAYER_BASEMAP: BasemapId = "osm";

export function loadBasemap(
  storageKey: string,
  fallback: BasemapId,
): BasemapId {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw && raw in BASEMAPS) return raw as BasemapId;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function saveBasemap(storageKey: string, id: BasemapId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, id);
  } catch {
    /* ignore */
  }
}

/** SF bounding box for Nominatim bias: west,south,east,north */
export const SF_VIEWBOX = "-122.52,37.70,-122.35,37.84";
