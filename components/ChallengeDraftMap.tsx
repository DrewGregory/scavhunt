import { useEffect, useMemo, useState } from "react";
import {
  GeoJSON,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Box, HStack, Switch, Text, VStack } from "@chakra-ui/react";
import { SF_CENTER, type GeoGeometry } from "../lib/geo";
import type { DraftChallenge } from "./ChallengeDraftCard";

export type DraftMapNeighborhood = {
  id: string;
  name: string;
  emoji?: string | null;
  boundary: unknown;
  onMap?: boolean;
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

function isGeometry(raw: unknown): raw is GeoGeometry {
  if (!raw || typeof raw !== "object") return false;
  const g = raw as { type?: string };
  return g.type === "Polygon" || g.type === "MultiPolygon";
}

function InvalidateSize({ deps }: { deps: unknown[] }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...deps]);
  return null;
}

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

function FlyToSelected({
  challenge,
}: {
  challenge: DraftChallenge | null;
}) {
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

  const neighborhoodFeatures = useMemo(() => {
    return neighborhoods
      .filter((n) => n.onMap !== false && isGeometry(n.boundary))
      .map((n) => ({
        type: "Feature" as const,
        properties: { id: n.id, name: n.name, emoji: n.emoji ?? null },
        geometry: n.boundary as GeoGeometry,
      }));
  }, [neighborhoods]);

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
        <HStack spacing={4} flexWrap="wrap">
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
        </HStack>
        <Text fontSize="xs" color="gray.500">
          Right-click map to create · click map with a card selected to place
        </Text>
      </HStack>

      <Box flex={1} minH={0} position="relative">
        <MapContainer
          center={SF_CENTER}
          zoom={13}
          style={{ height: "100%", width: "100%", minHeight: 280 }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents
            selectedId={selectedId}
            onMapClickPlace={onMapClickPlace}
            onContextCreate={onContextCreate}
          />
          <FlyToSelected challenge={selected} />
          <InvalidateSize
            deps={[showChallenges, showNeighborhoods, hideDisabled, height]}
          />

          {showNeighborhoods &&
            neighborhoodFeatures.map((f) => (
              <GeoJSON
                key={f.properties.id}
                data={f as any}
                style={() => ({
                  color: "#4A5568",
                  weight: 1,
                  fillColor: "#A0AEC0",
                  fillOpacity: 0.12,
                })}
                onEachFeature={(feature, layer) => {
                  const name = feature.properties?.name ?? "";
                  const emoji = feature.properties?.emoji;
                  layer.bindTooltip(emoji ? `${emoji} ${name}` : name, {
                    sticky: true,
                  });
                }}
              />
            ))}

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
          Blue = enabled, gray = disabled, orange = selected. Unplaced
          challenges only appear in the side lists.
        </Text>
      </VStack>
    </Box>
  );
}
