import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import {
  Box,
  Button,
  HStack,
  Spinner,
  Text,
  useToast,
} from "@chakra-ui/react";
import { arcIndicesForObject, type ZoneObject } from "../lib/topology";
import type { Position } from "../lib/geo";

export type TopologyPayload = {
  version: number;
  arcs: Position[][];
  objects: Record<string, ZoneObject>;
  lockedArcs: number[];
  neighborhoods: Array<{
    id: string;
    name: string;
    emoji?: string | null;
    boundary: unknown;
    centerLat: number | null;
    centerLng: number | null;
  }>;
};

/** Keep junction nodes fixed — Geoman sometimes nudges endpoints while dragging. */
function snapEndpoints(original: Position[], edited: Position[]): Position[] {
  if (edited.length < 2 || original.length < 2) return edited;
  const next = edited.map((p) => [p[0], p[1]] as Position);
  next[0] = [original[0][0], original[0][1]];
  next[next.length - 1] = [
    original[original.length - 1][0],
    original[original.length - 1][1],
  ];
  return next;
}

function MapController({
  topology,
  selectedId,
  onSelect,
  onTopologyChange,
  setSaving,
}: {
  topology: TopologyPayload;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onTopologyChange: (next: TopologyPayload) => void;
  setSaving: (v: boolean) => void;
}) {
  const map = useMap();
  const toast = useToast();
  const fillGroupRef = useRef<L.FeatureGroup | null>(null);
  const arcGroupRef = useRef<L.FeatureGroup | null>(null);
  const versionRef = useRef(topology.version);
  const arcsRef = useRef(topology.arcs);
  const objectsRef = useRef(topology.objects);
  const lockedRef = useRef(topology.lockedArcs);
  const savingRef = useRef(false);
  const fittedRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onTopologyChangeRef = useRef(onTopologyChange);

  useEffect(() => {
    versionRef.current = topology.version;
    arcsRef.current = topology.arcs;
    objectsRef.current = topology.objects;
    lockedRef.current = topology.lockedArcs;
  }, [topology]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onTopologyChangeRef.current = onTopologyChange;
  }, [onTopologyChange]);

  // Full-city fit once
  useEffect(() => {
    if (fittedRef.current) return;
    const withBounds = topology.neighborhoods.filter((n) => n.boundary);
    if (!withBounds.length) return;
    try {
      const group = L.featureGroup(
        withBounds.map((n) =>
          L.geoJSON(n.boundary as GeoJSON.GeoJsonObject),
        ),
      );
      map.fitBounds(group.getBounds(), { padding: [24, 24], maxZoom: 13 });
      fittedRef.current = true;
    } catch {
      /* ignore */
    }
  }, [map, topology.neighborhoods]);

  // Neighborhood fills — click to select. Rebuild when boundaries or selection change.
  useEffect(() => {
    if (fillGroupRef.current) {
      map.removeLayer(fillGroupRef.current);
      fillGroupRef.current = null;
    }
    const group = L.featureGroup().addTo(map);
    fillGroupRef.current = group;

    for (const n of topology.neighborhoods) {
      if (!n.boundary) continue;
      const isSelected = n.id === selectedId;
      const layer = L.geoJSON(n.boundary as GeoJSON.GeoJsonObject, {
        style: {
          color: isSelected ? "#2B6CB0" : "#718096",
          weight: isSelected ? 2.5 : 1,
          fillColor: isSelected ? "#63B3ED" : "#A0AEC0",
          fillOpacity: isSelected ? 0.4 : 0.16,
          // Keep fills clickable for selection, but don't steal vertex handles
          interactive: true,
        },
        onEachFeature: (_feat, lyr) => {
          lyr.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            onSelectRef.current(n.id);
          });
          lyr.bindTooltip(n.name, {
            sticky: true,
            direction: "top",
            opacity: 0.9,
          });
        },
      });
      layer.addTo(group);
      if (isSelected && typeof (layer as L.GeoJSON).bringToFront === "function") {
        (layer as L.GeoJSON).bringToFront();
      }
    }

    // Arcs should sit above fills for easier vertex grabbing
    if (arcGroupRef.current) {
      arcGroupRef.current.bringToFront();
    }

    return () => {
      if (fillGroupRef.current) {
        map.removeLayer(fillGroupRef.current);
        fillGroupRef.current = null;
      }
    };
  }, [map, topology.neighborhoods, topology.version, selectedId]);

  // Editable arcs for the selected neighborhood only
  useEffect(() => {
    if (arcGroupRef.current) {
      map.removeLayer(arcGroupRef.current);
      arcGroupRef.current = null;
    }
    if (!selectedId) return;

    const selectedObj = objectsRef.current[selectedId];
    if (!selectedObj) return;

    const group = L.featureGroup().addTo(map);
    arcGroupRef.current = group;
    const locked = new Set(lockedRef.current);
    const arcIdxs = arcIndicesForObject(selectedObj);

    for (const arcIndex of arcIdxs) {
      const pts = arcsRef.current[arcIndex];
      if (!pts || pts.length < 2) continue;
      const isLocked = locked.has(arcIndex);
      const latlngs = pts.map((p) => L.latLng(p[1], p[0]));
      const polyline = L.polyline(latlngs, {
        color: isLocked ? "#A0AEC0" : "#DD6B20",
        weight: isLocked ? 2 : 4,
        opacity: isLocked ? 0.55 : 1,
        dashArray: isLocked ? "4 6" : undefined,
        interactive: !isLocked,
      });
      polyline.addTo(group);

      if (isLocked) continue;

      polyline.pm.enable({
        allowSelfIntersection: false,
        snappable: false,
      });

      const saveArc = async () => {
        if (savingRef.current) return;
        savingRef.current = true;
        setSaving(true);

        const original = arcsRef.current[arcIndex];
        const latLngs = polyline.getLatLngs() as L.LatLng[];
        let points: Position[] = latLngs.map((ll) => [ll.lng, ll.lat]);
        if (original) {
          points = snapEndpoints(original, points);
          polyline.setLatLngs(points.map((p) => L.latLng(p[1], p[0])));
        }

        try {
          const res = await fetch("/api/admin/topology", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              arcIndex,
              points,
              version: versionRef.current,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (res.status !== 409) {
              toast({
                title: data.error || "Couldn't save that edit",
                status: "error",
                duration: 3000,
              });
            }
            const reload = await fetch("/api/admin/topology");
            if (reload.ok) onTopologyChangeRef.current(await reload.json());
            return;
          }

          versionRef.current = data.version;
          if (Array.isArray(data.arcs)) {
            arcsRef.current = data.arcs;
          }
          const reload = await fetch("/api/admin/topology");
          if (reload.ok) {
            onTopologyChangeRef.current(await reload.json());
          } else {
            onTopologyChangeRef.current({
              version: data.version,
              arcs: data.arcs,
              objects: data.objects,
              lockedArcs: data.lockedArcs,
              neighborhoods: topology.neighborhoods,
            });
          }
        } finally {
          savingRef.current = false;
          setSaving(false);
        }
      };

      // Save once when a vertex drag finishes (not on every pm:edit tick)
      polyline.on("pm:markerdragend", () => {
        void saveArc();
      });
      polyline.on("pm:vertexadded", () => {
        void saveArc();
      });
      polyline.on("pm:vertexremoved", () => {
        void saveArc();
      });
    }

    group.bringToFront();

    return () => {
      if (arcGroupRef.current) {
        map.removeLayer(arcGroupRef.current);
        arcGroupRef.current = null;
      }
    };
    // Only rebuild when selection or server version changes — callbacks via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId, topology.version, setSaving, toast]);

  return null;
}

/**
 * Full-SF admin map: all neighborhoods visible, click one to edit its borders.
 */
export default function AdminBoundaryEditor({
  selectedId,
  onSelect,
  onSaved,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSaved?: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [topology, setTopology] = useState<TopologyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState(false);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const load = useCallback(async () => {
    setLoading(true);
    setMissing(false);
    try {
      const res = await fetch("/api/admin/topology");
      if (res.status === 404) {
        // No shared-arc topology (e.g. DataSF 117 seed) — still show boundaries
        const nRes = await fetch("/api/admin/neighborhoods");
        if (!nRes.ok) {
          setMissing(true);
          setTopology(null);
          return;
        }
        const nData = await nRes.json();
        const neighborhoods = (nData.neighborhoods ?? [])
          .filter((n: { onMap: boolean }) => n.onMap)
          .map(
            (n: {
              id: string;
              name: string;
              emoji: string | null;
              boundary: unknown;
              centerLat: number | null;
              centerLng: number | null;
            }) => ({
              id: n.id,
              name: n.name,
              emoji: n.emoji,
              boundary: n.boundary,
              centerLat: n.centerLat,
              centerLng: n.centerLng,
            }),
          );
        if (neighborhoods.length === 0) {
          setMissing(true);
          setTopology(null);
          return;
        }
        setTopology({
          version: 0,
          arcs: [],
          objects: {},
          lockedArcs: [],
          neighborhoods,
        });
        return;
      }
      if (!res.ok) {
        toast({ title: "Failed to load map topology", status: "error" });
        return;
      }
      setTopology(await res.json());
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleTopologyChange = useCallback((next: TopologyPayload) => {
    setTopology(next);
    void onSavedRef.current?.();
  }, []);

  if (loading) {
    return (
      <HStack py={8} justify="center">
        <Spinner size="sm" />
        <Text fontSize="sm" color="gray.500">
          Loading SF map…
        </Text>
      </HStack>
    );
  }

  if (missing || !topology) {
    return (
      <Box py={4}>
        <Text fontSize="sm" color="gray.600" mb={2}>
          No map loaded yet. Import the gap-free SF map (shared-border editing)
          or Import DataSF 117 zones (raw breakup, browse-only borders).
        </Text>
        <Button size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </Box>
    );
  }

  const browseOnly = topology.version === 0 || topology.arcs.length === 0;
  const selectedName =
    topology.neighborhoods.find((n) => n.id === selectedId)?.name ?? null;

  return (
    <Box>
      <Text fontSize="sm" color="gray.600" mb={2}>
        {browseOnly
          ? selectedName
            ? `Browsing ${selectedName} (DataSF raw seed — re-import the gap-free map to edit shared borders).`
            : "DataSF raw seed loaded — click neighborhoods to inspect. Shared-border editing needs the gap-free import."
          : selectedName
            ? `Editing ${selectedName} — drag orange vertices to reshape the border (neighbors update too). Gray dashes are shoreline and stay fixed.`
            : "Click a neighborhood on the map (or in the list) to edit its borders."}
      </Text>
      <Box
        height={{ base: "420px", md: "560px" }}
        borderRadius="md"
        overflow="hidden"
        borderWidth="1px"
      >
        <MapContainer
          center={[37.76, -122.44]}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapController
            topology={topology}
            selectedId={selectedId}
            onSelect={onSelect}
            onTopologyChange={handleTopologyChange}
            setSaving={setSaving}
          />
        </MapContainer>
      </Box>
      {saving ? (
        <Text fontSize="xs" color="orange.600" mt={1}>
          Saving…
        </Text>
      ) : null}
    </Box>
  );
}
