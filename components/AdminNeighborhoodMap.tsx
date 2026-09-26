/**
 * Admin map for neighborhoods: multi-select, context menu (edit / rename /
 * split / combine), basemap + label overlays. Separate from the draft-board map.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  MapContainer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import {
  Box,
  Button,
  HStack,
  Input,
  Spinner,
  Switch,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { arcIndicesForObject, type ZoneObject } from "../lib/topology";
import { bboxOf, centroidOf, type GeoGeometry, type Position } from "../lib/geo";
import {
  BasemapSelect,
  BasemapTileLayer,
  usePersistedBasemap,
} from "./HuntMapShared";

export type AdminMapNeighborhood = {
  id: string;
  name: string;
  emoji?: string | null;
  boundary: unknown;
  centerLat: number | null;
  centerLng: number | null;
};

export type AdminMapDeposit = {
  id: string;
  lat: number;
  lng: number;
  points: number;
  deletedAt: string | null;
  team: { emoji: string; name: string; color: string };
  neighborhood: { id: string; name: string };
};

type TopologyPayload = {
  version: number;
  arcs: Position[][];
  objects: Record<string, ZoneObject>;
  lockedArcs: number[];
  neighborhoods: AdminMapNeighborhood[];
};

type ContextMenuState = {
  x: number;
  y: number;
  /** Neighborhood under the cursor when opened (may already be in selection). */
  targetId: string;
};

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

function isGeom(raw: unknown): raw is GeoGeometry {
  if (!raw || typeof raw !== "object") return false;
  const t = (raw as { type?: string }).type;
  return t === "Polygon" || t === "MultiPolygon";
}

function MapChrome({
  selectedIds,
  editingId,
  onExitEdit,
  splitting,
  onCancelSplit,
  onConfirmSplit,
  busy,
}: {
  selectedIds: string[];
  editingId: string | null;
  onExitEdit: () => void;
  splitting: boolean;
  onCancelSplit: () => void;
  onConfirmSplit: () => void;
  busy: boolean;
}) {
  if (splitting) {
    return (
      <HStack
        position="absolute"
        bottom={3}
        left="50%"
        transform="translateX(-50%)"
        zIndex={1000}
        bg="purple.600"
        color="white"
        px={3}
        py={2}
        borderRadius="lg"
        boxShadow="md"
        spacing={3}
        fontSize="xs"
      >
        <Text fontWeight="semibold">Drag the cut line, then confirm</Text>
        <Button size="xs" onClick={onCancelSplit} variant="outline" color="white">
          Cancel
        </Button>
        <Button
          size="xs"
          colorScheme="whiteAlpha"
          bg="white"
          color="purple.700"
          onClick={onConfirmSplit}
          isLoading={busy}
        >
          Confirm split
        </Button>
      </HStack>
    );
  }
  if (editingId) {
    return (
      <HStack
        position="absolute"
        bottom={3}
        left="50%"
        transform="translateX(-50%)"
        zIndex={1000}
        bg="orange.500"
        color="white"
        px={3}
        py={2}
        borderRadius="lg"
        boxShadow="md"
        spacing={3}
        fontSize="xs"
      >
        <Text fontWeight="semibold">
          Editing borders — drag orange vertices · Esc when done
        </Text>
        <Button size="xs" bg="white" color="orange.700" onClick={onExitEdit}>
          Done
        </Button>
      </HStack>
    );
  }
  if (selectedIds.length > 0) {
    return (
      <Box
        position="absolute"
        bottom={3}
        left="50%"
        transform="translateX(-50%)"
        zIndex={1000}
        bg="blue.600"
        color="white"
        px={3}
        py={1.5}
        borderRadius="lg"
        boxShadow="md"
        fontSize="xs"
        pointerEvents="none"
        textAlign="center"
      >
        <Text fontWeight="semibold">
          {selectedIds.length} selected — right-click for actions · Esc to clear
        </Text>
      </Box>
    );
  }
  return null;
}

function EscapeHandler({
  onEscape,
}: {
  onEscape: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape]);
  return null;
}

function MapClickClear({
  onClear,
  enabled,
}: {
  onClear: () => void;
  enabled: boolean;
}) {
  useMapEvents({
    click() {
      if (enabled) onClear();
    },
  });
  return null;
}

/**
 * Vertical cut for Split: Leaflet-managed marker + line so drag isn't interrupted
 * by React re-renders (controlled Marker position was resetting each move).
 */
function SplitCutLine({
  cutLng,
  minLat,
  maxLat,
  minLng,
  maxLng,
  onChange,
}: {
  cutLng: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  onChange: (lng: number) => void;
}) {
  const map = useMap();
  const cutLngRef = useRef(cutLng);
  const onChangeRef = useRef(onChange);
  const boundsRef = useRef({ minLat, maxLat, minLng, maxLng });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    boundsRef.current = { minLat, maxLat, minLng, maxLng };
  }, [minLat, maxLat, minLng, maxLng]);

  useEffect(() => {
    const pad = 0.002;
    const clamp = (lng: number) => {
      const b = boundsRef.current;
      return Math.min(b.maxLng - 1e-5, Math.max(b.minLng + 1e-5, lng));
    };

    const line = L.polyline(
      [
        [minLat - pad, cutLng],
        [maxLat + pad, cutLng],
      ],
      { color: "#805AD5", weight: 3, dashArray: "6 4", interactive: false },
    ).addTo(map);

    const marker = L.marker([(minLat + maxLat) / 2, cutLng], {
      draggable: true,
      zIndexOffset: 3000,
      autoPan: false,
      icon: L.divIcon({
        className: "split-cut-handle",
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#805AD5;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:ew-resize"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    }).addTo(map);

    const syncLine = (lng: number) => {
      const b = boundsRef.current;
      line.setLatLngs([
        [b.minLat - pad, lng],
        [b.maxLat + pad, lng],
      ]);
    };

    marker.on("drag", () => {
      const lng = clamp(marker.getLatLng().lng);
      cutLngRef.current = lng;
      syncLine(lng);
    });

    marker.on("dragend", () => {
      const lng = clamp(marker.getLatLng().lng);
      cutLngRef.current = lng;
      const midLat =
        (boundsRef.current.minLat + boundsRef.current.maxLat) / 2;
      marker.setLatLng([midLat, lng]);
      syncLine(lng);
      onChangeRef.current(lng);
    });

    cutLngRef.current = cutLng;

    return () => {
      map.removeLayer(marker);
      map.removeLayer(line);
    };
    // Mount once per split session — initial cutLng/bounds only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

function MapController({
  topology,
  selectedIds,
  editingId,
  showLabels,
  onSelectClick,
  onContextMenu,
  onTopologyChange,
  setSaving,
  mapFittedRef,
}: {
  topology: TopologyPayload;
  selectedIds: string[];
  editingId: string | null;
  showLabels: boolean;
  onSelectClick: (id: string, shiftKey: boolean) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onTopologyChange: (next: TopologyPayload) => void;
  setSaving: (v: boolean) => void;
  /** Survives quiet topology reloads so we don't re-fit the whole city. */
  mapFittedRef: MutableRefObject<boolean>;
}) {
  const map = useMap();
  const toast = useToast();
  const fillGroupRef = useRef<L.FeatureGroup | null>(null);
  const labelGroupRef = useRef<L.LayerGroup | null>(null);
  const arcGroupRef = useRef<L.FeatureGroup | null>(null);
  const versionRef = useRef(topology.version);
  const arcsRef = useRef(topology.arcs);
  const objectsRef = useRef(topology.objects);
  const lockedRef = useRef(topology.lockedArcs);
  const savingRef = useRef(false);
  const selectedIdsRef = useRef(selectedIds);
  const editingIdRef = useRef(editingId);
  const onSelectClickRef = useRef(onSelectClick);
  const onContextMenuRef = useRef(onContextMenu);
  const onTopologyChangeRef = useRef(onTopologyChange);

  useEffect(() => {
    versionRef.current = topology.version;
    arcsRef.current = topology.arcs;
    objectsRef.current = topology.objects;
    lockedRef.current = topology.lockedArcs;
  }, [topology]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);
  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);
  useEffect(() => {
    onSelectClickRef.current = onSelectClick;
  }, [onSelectClick]);
  useEffect(() => {
    onContextMenuRef.current = onContextMenu;
  }, [onContextMenu]);
  useEffect(() => {
    onTopologyChangeRef.current = onTopologyChange;
  }, [onTopologyChange]);

  useEffect(() => {
    if (mapFittedRef.current) return;
    const withBounds = topology.neighborhoods.filter((n) => isGeom(n.boundary));
    if (!withBounds.length) return;
    try {
      const group = L.featureGroup(
        withBounds.map((n) =>
          L.geoJSON(n.boundary as GeoJSON.GeoJsonObject),
        ),
      );
      map.fitBounds(group.getBounds(), { padding: [24, 24], maxZoom: 13 });
      mapFittedRef.current = true;
    } catch {
      /* ignore */
    }
  }, [map, topology.neighborhoods, mapFittedRef]);

  // Fills + selection styling
  useEffect(() => {
    if (fillGroupRef.current) {
      map.removeLayer(fillGroupRef.current);
      fillGroupRef.current = null;
    }
    if (labelGroupRef.current) {
      map.removeLayer(labelGroupRef.current);
      labelGroupRef.current = null;
    }
    const group = L.featureGroup().addTo(map);
    fillGroupRef.current = group;
    const labels = L.layerGroup().addTo(map);
    labelGroupRef.current = labels;
    const selected = new Set(selectedIds);

    for (const n of topology.neighborhoods) {
      if (!isGeom(n.boundary)) continue;
      const isSelected = selected.has(n.id);
      const isEditing = editingId === n.id;
      const layer = L.geoJSON(n.boundary as GeoJSON.GeoJsonObject, {
        style: {
          color: isEditing ? "#C05621" : isSelected ? "#2B6CB0" : "#718096",
          weight: isEditing ? 3 : isSelected ? 2.5 : 1,
          fillColor: isEditing ? "#ED8936" : isSelected ? "#63B3ED" : "#A0AEC0",
          fillOpacity: isEditing ? 0.45 : isSelected ? 0.4 : 0.16,
          interactive: true,
        },
        onEachFeature: (_feat, lyr) => {
          lyr.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            onSelectClickRef.current(n.id, e.originalEvent.shiftKey);
          });
          lyr.on("contextmenu", (e) => {
            L.DomEvent.stopPropagation(e);
            L.DomEvent.preventDefault(e.originalEvent);
            const oe = e.originalEvent;
            onContextMenuRef.current(n.id, oe.clientX, oe.clientY);
          });
        },
      });
      layer.addTo(group);

      if (showLabels) {
        const fromBoundary = centroidOf(n.boundary);
        const lat = fromBoundary?.lat ?? n.centerLat;
        const lng = fromBoundary?.lng ?? n.centerLng;
        if (lat != null && lng != null) {
          const label = n.emoji ? `${n.emoji} ${n.name}` : n.name;
          L.marker([lat, lng], {
            interactive: false,
            zIndexOffset: 400,
            icon: L.divIcon({
              className: "neighborhood-label-icon",
              html: `<div class="neighborhood-label-pill" style="border-color:${isSelected ? "#3182CE" : "#CBD5E0"}">${label}</div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            }),
          }).addTo(labels);
        }
      }
    }

    if (arcGroupRef.current) arcGroupRef.current.bringToFront();

    return () => {
      if (fillGroupRef.current) {
        map.removeLayer(fillGroupRef.current);
        fillGroupRef.current = null;
      }
      if (labelGroupRef.current) {
        map.removeLayer(labelGroupRef.current);
        labelGroupRef.current = null;
      }
    };
  }, [
    map,
    topology.neighborhoods,
    topology.version,
    selectedIds,
    editingId,
    showLabels,
  ]);

  // Editable arcs only while editingId is set + topology exists
  useEffect(() => {
    if (arcGroupRef.current) {
      map.removeLayer(arcGroupRef.current);
      arcGroupRef.current = null;
    }
    if (!editingId) return;
    if (!topology.arcs.length) return;

    const selectedObj = objectsRef.current[editingId];
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
          if (Array.isArray(data.arcs)) arcsRef.current = data.arcs;
          const reload = await fetch("/api/admin/topology");
          if (reload.ok) {
            onTopologyChangeRef.current(await reload.json());
          }
        } finally {
          savingRef.current = false;
          setSaving(false);
        }
      };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, editingId, topology.version, setSaving, toast]);

  return null;
}

export default function AdminNeighborhoodMap({
  selectedIds,
  onSelectedIdsChange,
  editingId,
  onEditingIdChange,
  deposits = [],
  onSaved,
}: {
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  editingId: string | null;
  onEditingIdChange: (id: string | null) => void;
  deposits?: AdminMapDeposit[];
  onSaved?: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [topology, setTopology] = useState<TopologyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState(false);
  const [basemap, setBasemap] = usePersistedBasemap(
    "scavhunt.mapBasemap.adminNeighborhoods",
  );
  const [showLabels, setShowLabels] = useState(true);
  const [showDeposits, setShowDeposits] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [splitCutLng, setSplitCutLng] = useState<number | null>(null);
  const [splitBounds, setSplitBounds] = useState<{
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const onSavedRef = useRef(onSaved);
  const mapFittedRef = useRef(false);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    if (!quiet) {
      setLoading(true);
      setMissing(false);
    }
    try {
      const res = await fetch("/api/admin/topology");
      if (res.status === 404) {
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
        if (!quiet) {
          toast({ title: "Failed to load map topology", status: "error" });
        }
        return;
      }
      setTopology(await res.json());
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleTopologyChange = useCallback((next: TopologyPayload) => {
    setTopology(next);
    void onSavedRef.current?.();
  }, []);

  const clearAll = useCallback(() => {
    onSelectedIdsChange([]);
    onEditingIdChange(null);
    setMenu(null);
    setRenameOpen(false);
    setSplitCutLng(null);
    setSplitBounds(null);
  }, [onSelectedIdsChange, onEditingIdChange]);

  const onSelectClick = useCallback(
    (id: string, shiftKey: boolean) => {
      setMenu(null);
      if (editingId && editingId !== id) {
        onEditingIdChange(null);
      }
      if (shiftKey) {
        if (selectedIds.includes(id)) {
          onSelectedIdsChange(selectedIds.filter((x) => x !== id));
        } else {
          onSelectedIdsChange([...selectedIds, id]);
        }
      } else {
        onSelectedIdsChange([id]);
      }
    },
    [editingId, onEditingIdChange, onSelectedIdsChange, selectedIds],
  );

  const onContextMenu = useCallback(
    (id: string, x: number, y: number) => {
      // Ensure the right-clicked neighborhood is in the selection
      if (!selectedIds.includes(id)) {
        onSelectedIdsChange([id]);
        onEditingIdChange(null);
      }
      setMenu({ x, y, targetId: id });
      setRenameOpen(false);
    },
    [onEditingIdChange, onSelectedIdsChange, selectedIds],
  );

  const effectiveSelection = useMemo(() => {
    if (selectedIds.length > 0) return selectedIds;
    if (menu) return [menu.targetId];
    return [];
  }, [menu, selectedIds]);

  const singleId =
    effectiveSelection.length === 1 ? effectiveSelection[0]! : null;
  const canEdit = Boolean(singleId && topology && topology.arcs.length > 0);
  const canRename = Boolean(singleId);
  const canSplit = Boolean(singleId);
  const canCombine = effectiveSelection.length >= 2;

  const startSplit = () => {
    setMenu(null);
    const id = singleId;
    if (!id || !topology) return;
    const n = topology.neighborhoods.find((x) => x.id === id);
    if (!n || !isGeom(n.boundary)) {
      toast({ title: "No boundary to split", status: "warning" });
      return;
    }
    const bb = bboxOf(n.boundary);
    setSplitBounds({
      minLat: bb.minLat,
      maxLat: bb.maxLat,
      minLng: bb.minLng,
      maxLng: bb.maxLng,
    });
    setSplitCutLng((bb.minLng + bb.maxLng) / 2);
    onSelectedIdsChange([id]);
    onEditingIdChange(null);
  };

  const confirmSplit = async () => {
    if (!singleId || splitCutLng == null) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/neighborhoods/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: singleId, cutLng: splitCutLng }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Split failed", status: "error" });
        return;
      }
      toast({
        title: `Split — created ${data.childName}`,
        status: "success",
      });
      setSplitCutLng(null);
      setSplitBounds(null);
      await load({ quiet: true });
      await onSavedRef.current?.();
      onSelectedIdsChange([singleId, data.childId].filter(Boolean));
    } catch {
      toast({ title: "Split failed", status: "error" });
    } finally {
      setBusy(false);
    }
  };

  const doCombine = async () => {
    setMenu(null);
    const ids = effectiveSelection;
    if (ids.length < 2) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/neighborhoods/combine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Combine failed", status: "error" });
        return;
      }
      toast({
        title: `Combined into ${data.survivorName}`,
        status: "success",
      });
      await load({ quiet: true });
      await onSavedRef.current?.();
      onSelectedIdsChange([data.survivorId]);
      onEditingIdChange(null);
    } catch {
      toast({ title: "Combine failed", status: "error" });
    } finally {
      setBusy(false);
    }
  };

  const startRename = () => {
    setMenu(null);
    const id = singleId;
    if (!id || !topology) return;
    const n = topology.neighborhoods.find((x) => x.id === id);
    setRenameValue(n?.name ?? "");
    setRenameOpen(true);
  };

  const submitRename = async () => {
    if (!singleId) return;
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/neighborhoods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: singleId, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Rename failed", status: "error" });
        return;
      }
      setRenameOpen(false);
      await load({ quiet: true });
      await onSavedRef.current?.();
    } catch {
      toast({ title: "Rename failed", status: "error" });
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setMenu(null);
    if (!singleId) return;
    if (!topology?.arcs.length) {
      toast({
        title: "Shared-border editing needs topology",
        description: "Borders can still be viewed; arc edit is unavailable.",
        status: "warning",
      });
      return;
    }
    onSelectedIdsChange([singleId]);
    onEditingIdChange(singleId);
  };

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
          No map neighborhoods loaded yet.
        </Text>
        <Button size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </Box>
    );
  }

  const browseOnly = topology.version === 0 || topology.arcs.length === 0;
  const liveDeposits = deposits.filter((d) => !d.deletedAt);

  return (
    <Box position="relative">
      <Text fontSize="sm" color="gray.600" mb={2}>
        {browseOnly
          ? "Browse mode (no shared-arc topology). Click to select, shift-click for multi-select, right-click for Combine / Split / Rename."
          : "Click to select · shift-click multi-select · right-click for Edit / Rename / Split / Combine."}
      </Text>

      <Box
        height={{ base: "420px", md: "560px" }}
        borderRadius="md"
        overflow="hidden"
        borderWidth="1px"
        position="relative"
      >
        <HStack
          position="absolute"
          top={3}
          right={3}
          zIndex={1000}
          align="flex-start"
        >
          <Box>
            <Button
              size="sm"
              bg="white"
              boxShadow="md"
              onClick={() => setLayersOpen((o) => !o)}
            >
              Layers
            </Button>
            {layersOpen && (
              <Box
                mt={2}
                bg="white"
                p={3}
                borderRadius="md"
                boxShadow="lg"
                minW="200px"
              >
                <VStack align="stretch" spacing={3}>
                  <HStack justify="space-between">
                    <Text fontSize="sm" fontWeight="medium">
                      Name labels
                    </Text>
                    <Switch
                      size="sm"
                      isChecked={showLabels}
                      onChange={(e) => setShowLabels(e.target.checked)}
                      colorScheme="blue"
                    />
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontSize="sm" fontWeight="medium">
                      Deposits
                    </Text>
                    <Switch
                      size="sm"
                      isChecked={showDeposits}
                      onChange={(e) => setShowDeposits(e.target.checked)}
                      colorScheme="blue"
                    />
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontSize="sm" fontWeight="medium">
                      Basemap
                    </Text>
                    <BasemapSelect value={basemap} onChange={setBasemap} />
                  </HStack>
                </VStack>
              </Box>
            )}
          </Box>
        </HStack>

        <MapContainer
          center={[37.76, -122.44]}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
        >
          <BasemapTileLayer basemap={basemap} />
          <EscapeHandler
            onEscape={() => {
              if (splitCutLng != null) {
                setSplitCutLng(null);
                setSplitBounds(null);
                return;
              }
              if (editingId) {
                onEditingIdChange(null);
                return;
              }
              clearAll();
            }}
          />
          <MapClickClear
            enabled={!editingId && splitCutLng == null}
            onClear={clearAll}
          />
          <MapController
            topology={topology}
            selectedIds={selectedIds}
            editingId={editingId}
            showLabels={showLabels}
            onSelectClick={onSelectClick}
            onContextMenu={onContextMenu}
            onTopologyChange={handleTopologyChange}
            setSaving={setSaving}
            mapFittedRef={mapFittedRef}
          />

          {showDeposits &&
            liveDeposits.map((d) => (
              <Marker
                key={d.id}
                position={[d.lat, d.lng]}
                zIndexOffset={200}
                icon={L.divIcon({
                  className: "",
                  html: `<div style="width:10px;height:10px;border-radius:50%;background:${d.team.color || "#805AD5"};border:1px solid #fff;box-shadow:0 0 2px rgba(0,0,0,.4)"></div>`,
                  iconSize: [10, 10],
                  iconAnchor: [5, 5],
                })}
              />
            ))}

          {splitCutLng != null && splitBounds && (
            <SplitCutLine
              key={`split-${singleId ?? "x"}-${splitBounds.minLng.toFixed(5)}`}
              cutLng={splitCutLng}
              minLat={splitBounds.minLat}
              maxLat={splitBounds.maxLat}
              minLng={splitBounds.minLng}
              maxLng={splitBounds.maxLng}
              onChange={setSplitCutLng}
            />
          )}
        </MapContainer>

        <MapChrome
          selectedIds={selectedIds}
          editingId={editingId}
          onExitEdit={() => onEditingIdChange(null)}
          splitting={splitCutLng != null}
          onCancelSplit={() => {
            setSplitCutLng(null);
            setSplitBounds(null);
          }}
          onConfirmSplit={() => void confirmSplit()}
          busy={busy}
        />

        {menu && (
          <Box
            position="fixed"
            left={`${menu.x}px`}
            top={`${menu.y}px`}
            zIndex={2000}
            bg="white"
            borderWidth="1px"
            borderRadius="md"
            boxShadow="lg"
            py={1}
            minW="160px"
            onClick={(e) => e.stopPropagation()}
          >
            <VStack align="stretch" spacing={0}>
              <Button
                size="sm"
                variant="ghost"
                justifyContent="flex-start"
                borderRadius={0}
                isDisabled={!canEdit}
                onClick={startEdit}
              >
                Edit borders
              </Button>
              <Button
                size="sm"
                variant="ghost"
                justifyContent="flex-start"
                borderRadius={0}
                isDisabled={!canRename}
                onClick={startRename}
              >
                Rename
              </Button>
              <Button
                size="sm"
                variant="ghost"
                justifyContent="flex-start"
                borderRadius={0}
                isDisabled={!canSplit}
                onClick={startSplit}
              >
                Split…
              </Button>
              <Button
                size="sm"
                variant="ghost"
                justifyContent="flex-start"
                borderRadius={0}
                isDisabled={!canCombine}
                onClick={() => void doCombine()}
                isLoading={busy && canCombine}
              >
                Combine ({effectiveSelection.length})
              </Button>
            </VStack>
          </Box>
        )}

        {renameOpen && singleId && (
          <Box
            position="absolute"
            top={3}
            left={3}
            zIndex={1100}
            bg="white"
            p={3}
            borderRadius="md"
            boxShadow="lg"
            minW="240px"
          >
            <Text fontSize="xs" color="gray.500" mb={1}>
              Rename neighborhood
            </Text>
            <HStack>
              <Input
                size="sm"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitRename();
                  if (e.key === "Escape") setRenameOpen(false);
                }}
              />
              <Button
                size="sm"
                colorScheme="blue"
                onClick={() => void submitRename()}
                isLoading={busy}
              >
                Save
              </Button>
            </HStack>
          </Box>
        )}
      </Box>

      {saving ? (
        <Text fontSize="xs" color="orange.600" mt={1}>
          Saving…
        </Text>
      ) : null}

      {/* click-away closes context menu */}
      {menu && (
        <Box
          position="fixed"
          inset={0}
          zIndex={1999}
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        />
      )}
    </Box>
  );
}
