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
  IconButton,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FiLayers } from "react-icons/fi";
import { SF_CENTER } from "../lib/geo";
import type { DraftChallenge } from "./ChallengeDraftCard";
import {
  BasemapSelect,
  BasemapTileLayer,
  InvalidateMapSize,
  PlaceSearchControl,
  QuietNeighborhoodLayers,
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
  editingId,
  onMapClickPlace,
  onContextCreate,
}: {
  editingId: string | null;
  onMapClickPlace: (lat: number, lng: number) => void;
  onContextCreate: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (editingId) onMapClickPlace(e.latlng.lat, e.latlng.lng);
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
  token,
}: {
  challenge: DraftChallenge | null;
  token: number;
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
    // token forces re-pan when user re-clicks same card
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, challenge?.id, token]);
  return null;
}

export default function ChallengeDraftMap({
  challenges,
  neighborhoods,
  selectedId,
  editingId,
  panToken = 0,
  onSelect,
  onMapClickPlace,
  onContextCreate,
  onMarkerMove,
  height = "100%",
}: {
  challenges: DraftChallenge[];
  neighborhoods: DraftMapNeighborhood[];
  selectedId: string | null;
  editingId: string | null;
  panToken?: number;
  onSelect: (id: string) => void;
  onMapClickPlace: (lat: number, lng: number) => void;
  onContextCreate: (lat: number, lng: number) => void;
  onMarkerMove: (id: string, lat: number, lng: number) => void;
  height?: number | string;
}) {
  const [showChallenges, setShowChallenges] = useState(true);
  const [showNeighborhoods, setShowNeighborhoods] = useState(true);
  const [hideDisabled, setHideDisabled] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [basemap, setBasemap] = usePersistedBasemap(
    "scavhunt.mapBasemap.draft",
  );

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
      position="relative"
    >
      <Box flex={1} minH={0} position="relative">
        <Box position="absolute" top={3} right={3} zIndex={1000}>
          <IconButton
            aria-label={layersOpen ? "Hide map layers" : "Show map layers"}
            icon={<FiLayers />}
            size="sm"
            bg="white"
            boxShadow="md"
            onClick={() => setLayersOpen((o) => !o)}
          />
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
                    Challenges
                  </Text>
                  <Switch
                    size="sm"
                    isChecked={showChallenges}
                    onChange={(e) => setShowChallenges(e.target.checked)}
                    colorScheme="blue"
                  />
                </HStack>
                <HStack justify="space-between">
                  <Text fontSize="sm" fontWeight="medium">
                    Neighborhoods
                  </Text>
                  <Switch
                    size="sm"
                    isChecked={showNeighborhoods}
                    onChange={(e) => setShowNeighborhoods(e.target.checked)}
                    colorScheme="blue"
                  />
                </HStack>
                <HStack justify="space-between">
                  <Text fontSize="sm" fontWeight="medium">
                    Hide disabled
                  </Text>
                  <Switch
                    size="sm"
                    isChecked={hideDisabled}
                    onChange={(e) => setHideDisabled(e.target.checked)}
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

        <MapContainer
          center={SF_CENTER}
          zoom={13}
          style={{ height: "100%", width: "100%", minHeight: 280 }}
          scrollWheelZoom
        >
          <BasemapTileLayer basemap={basemap} />
          <PlaceSearchControl />
          <MapEvents
            editingId={editingId}
            onMapClickPlace={onMapClickPlace}
            onContextCreate={onContextCreate}
          />
          <FlyToSelected challenge={selected} token={panToken} />
          <InvalidateMapSize
            deps={[
              showChallenges,
              showNeighborhoods,
              hideDisabled,
              height,
              basemap,
              layersOpen,
            ]}
          />

          {showNeighborhoods && (
            <QuietNeighborhoodLayers neighborhoods={neighborhoods} />
          )}

          {showChallenges &&
            placed.map((c) => {
              const isEditing = editingId === c.id;
              return (
                <Marker
                  key={c.id}
                  position={[c.lat!, c.lng!]}
                  draggable={isEditing}
                  icon={
                    c.id === selectedId || isEditing
                      ? selectedIcon
                      : c.enabled
                        ? enabledIcon
                        : disabledIcon
                  }
                  opacity={c.enabled ? 1 : 0.75}
                  zIndexOffset={
                    c.id === selectedId || isEditing
                      ? 1000
                      : c.enabled
                        ? 100
                        : 0
                  }
                  eventHandlers={{
                    click: (e) => {
                      L.DomEvent.stopPropagation(e);
                      onSelect(c.id);
                    },
                    dragend: (e) => {
                      const p = (e.target as L.Marker).getLatLng();
                      onMarkerMove(c.id, p.lat, p.lng);
                    },
                  }}
                >
                  <Popup>
                    <strong>{c.title}</strong>
                    <br />
                    {c.enabled ? "Enabled" : "Disabled"} · {c.pts} pts
                    {isEditing ? " · drag to move" : ""}
                  </Popup>
                </Marker>
              );
            })}
        </MapContainer>
      </Box>
    </Box>
  );
}
