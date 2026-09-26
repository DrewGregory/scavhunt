import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Box,
  HStack,
  Select,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { SF_CENTER, centroidOf, type GeoGeometry } from "../lib/geo";
import type { DraftChallenge } from "./ChallengeDraftCard";
import {
  BasemapSelect,
  BasemapTileLayer,
  InvalidateMapSize,
  PlaceSearchControl,
  QuietNeighborhoodLayers,
  isGeoGeometry,
  usePersistedBasemap,
} from "./HuntMapShared";

export type DraftMapNeighborhood = {
  id: string;
  name: string;
  emoji?: string | null;
  boundary: unknown;
  onMap?: boolean;
  centerLat?: number | null;
  centerLng?: number | null;
};

function pinHtml(fill: string, size: number) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#ffffff" stroke="none"/></svg>`;
}

const enabledIcon = L.divIcon({
  className: "",
  html: pinHtml("#3182CE", 28),
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

const disabledIcon = L.divIcon({
  className: "",
  html: pinHtml("#A0AEC0", 24),
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

const selectedIcon = L.divIcon({
  className: "",
  html: pinHtml("#DD6B20", 30),
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

function MapEvents({
  selectedId,
  onMapClickPlace,
  onContextCreate,
}: {
  selectedId: string | null;
  onMapClickPlace: (lat: number, lng: number) => void;
  onContextCreate: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (selectedId) onMapClickPlace(e.latlng.lat, e.latlng.lng);
    },
    contextmenu(e) {
      e.originalEvent.preventDefault();
      onContextCreate(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToSelected({ challenge }: { challenge: DraftChallenge | null }) {
  const map = useMap();
  useEffect(() => {
    if (
      challenge?.lat != null &&
      challenge?.lng != null &&
      Number.isFinite(challenge.lat) &&
      Number.isFinite(challenge.lng)
    ) {
      map.setView([challenge.lat, challenge.lng], Math.max(map.getZoom(), 14), {
        animate: true,
      });
    }
  }, [map, challenge?.id, challenge?.lat, challenge?.lng]);
  return null;
}

function FlyToNeighborhood({
  target,
}: {
  target: { lat: number; lng: number; token: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.setView([target.lat, target.lng], Math.max(map.getZoom(), 14), {
      animate: true,
    });
  }, [map, target]);
  return null;
}

export default function ChallengeDraftMap({
  challenges,
  neighborhoods,
  selectedId,
  onSelect,
  onMapClickPlace,
  onContextCreate,
  height = "100%",
}: {
  challenges: DraftChallenge[];
  neighborhoods: DraftMapNeighborhood[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMapClickPlace: (lat: number, lng: number) => void;
  onContextCreate: (lat: number, lng: number) => void;
  height?: number | string;
}) {
  const [showChallenges, setShowChallenges] = useState(true);
  const [showNeighborhoods, setShowNeighborhoods] = useState(true);
  const [hideDisabled, setHideDisabled] = useState(false);
  const [basemap, setBasemap] = usePersistedBasemap(
    "scavhunt.mapBasemap.draft",
  );
  const [jumpTarget, setJumpTarget] = useState<{
    lat: number;
    lng: number;
    token: number;
  } | null>(null);

  const jumpOptions = useMemo(() => {
    return neighborhoods
      .filter((n) => n.onMap !== false)
      .map((n) => {
        let lat: number | null = null;
        let lng: number | null = null;
        if (isGeoGeometry(n.boundary)) {
          const c = centroidOf(n.boundary as GeoGeometry);
          lat = c.lat;
          lng = c.lng;
        }
        return { id: n.id, name: n.name, lat, lng };
      })
      .filter((n) => n.lat != null && n.lng != null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [neighborhoods]);

  const placed = useMemo(
    () =>
      challenges.filter(
        (c) =>
          c.lat != null &&
          c.lng != null &&
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lng) &&
          (!hideDisabled || c.enabled),
      ),
    [challenges, hideDisabled],
  );

  const selected = useMemo(
    () => challenges.find((c) => c.id === selectedId) ?? null,
    [challenges, selectedId],
  );

  return (
    <Box
      borderWidth="1px"
      borderRadius="md"
      overflow="hidden"
      bg="white"
      height={height}
      display="flex"
      flexDirection="column"
      minH="320px"
    >
      <HStack
        px={3}
        py={2}
        borderBottomWidth="1px"
        justify="space-between"
        flexWrap="wrap"
        gap={2}
        flexShrink={0}
      >
        <HStack spacing={3} flexWrap="wrap" align="center">
          <HStack spacing={2}>
            <Text fontSize="xs" fontWeight="medium">
              Challenges
            </Text>
            <Switch
              size="sm"
              isChecked={showChallenges}
              onChange={(e) => setShowChallenges(e.target.checked)}
              colorScheme="blue"
            />
          </HStack>
          <HStack spacing={2}>
            <Text fontSize="xs" fontWeight="medium">
              Neighborhoods
            </Text>
            <Switch
              size="sm"
              isChecked={showNeighborhoods}
              onChange={(e) => setShowNeighborhoods(e.target.checked)}
              colorScheme="blue"
            />
          </HStack>
          <HStack spacing={2}>
            <Text fontSize="xs" fontWeight="medium">
              Hide disabled
            </Text>
            <Switch
              size="sm"
              isChecked={hideDisabled}
              onChange={(e) => setHideDisabled(e.target.checked)}
              colorScheme="blue"
            />
          </HStack>
          <HStack spacing={2}>
            <Text fontSize="xs" fontWeight="medium">
              Basemap
            </Text>
            <BasemapSelect value={basemap} onChange={setBasemap} />
          </HStack>
          <HStack spacing={2}>
            <Text fontSize="xs" fontWeight="medium">
              Jump
            </Text>
            <Select
              size="xs"
              w="150px"
              placeholder="Neighborhood…"
              onChange={(e) => {
                const id = e.target.value;
                const hit = jumpOptions.find((n) => n.id === id);
                if (hit?.lat != null && hit?.lng != null) {
                  setJumpTarget({
                    lat: hit.lat,
                    lng: hit.lng,
                    token: Date.now(),
                  });
                }
                e.target.value = "";
              }}
            >
              {jumpOptions.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </Select>
          </HStack>
        </HStack>
        <Text fontSize="xs" color="gray.500">
          Search · right-click create · click nbhd to pan · select card then
          click map to place
        </Text>
      </HStack>

      <Box flex={1} minH={0} position="relative">
        <MapContainer
          center={SF_CENTER}
          zoom={13}
          style={{ height: "100%", width: "100%", minHeight: 280 }}
          scrollWheelZoom
        >
          <BasemapTileLayer basemap={basemap} />
          <PlaceSearchControl />
          <MapEvents
            selectedId={selectedId}
            onMapClickPlace={onMapClickPlace}
            onContextCreate={onContextCreate}
          />
          <FlyToSelected challenge={selected} />
          <FlyToNeighborhood target={jumpTarget} />
          <InvalidateMapSize
            deps={[showChallenges, showNeighborhoods, hideDisabled, height, basemap]}
          />

          {showNeighborhoods && (
            <QuietNeighborhoodLayers neighborhoods={neighborhoods} />
          )}

          {showChallenges &&
            placed.map((c) => (
              <Marker
                key={c.id}
                position={[c.lat!, c.lng!]}
                icon={
                  c.id === selectedId
                    ? selectedIcon
                    : c.enabled
                      ? enabledIcon
                      : disabledIcon
                }
                opacity={c.enabled ? 1 : 0.75}
                zIndexOffset={c.id === selectedId ? 1000 : c.enabled ? 100 : 0}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    onSelect(c.id);
                  },
                }}
              >
                <Popup>
                  <strong>{c.title}</strong>
                  <br />
                  {c.enabled ? "Enabled" : "Disabled"} · {c.pts} pts
                </Popup>
              </Marker>
            ))}
        </MapContainer>
      </Box>

      <VStack align="stretch" spacing={0} px={3} py={2} flexShrink={0}>
        <Text fontSize="xs" color="gray.500">
          Blue = enabled, gray = disabled, orange = selected. Toggle
          Neighborhoods for fills, hover highlight, and name pills (same as the
          player map). Click a zone to zoom. Unplaced challenges stay in the
          side lists.
        </Text>
      </VStack>
    </Box>
  );
}
