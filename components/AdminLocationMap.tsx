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
  Button,
  HStack,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { SF_CENTER } from "../lib/geo";
import {
  BasemapSelect,
  BasemapTileLayer,
  InvalidateMapSize,
  PlaceSearchControl,
  QuietNeighborhoodLayers,
  usePersistedBasemap,
} from "./HuntMapShared";

export type LocationMapChallenge = {
  id: string;
  title: string;
  emoji?: string | null;
  lat: number | null;
  lng: number | null;
};

export type LocationMapNeighborhood = {
  id: string;
  name: string;
  emoji?: string | null;
  boundary: unknown;
  onMap?: boolean;
  centerLat?: number | null;
  centerLng?: number | null;
};

const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="28" height="28" viewBox="0 0 24 24" fill="#3182CE" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#ffffff" stroke="none"/></svg>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

const otherPinIcon = L.divIcon({
  className: "",
  html: `<svg width="22" height="22" viewBox="0 0 24 24" fill="#718096" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#ffffff" stroke="none"/></svg>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

function ClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recententer({
  lat,
  lng,
}: {
  lat: number | null;
  lng: number | null;
}) {
  const map = useMap();
  const valid =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  useEffect(() => {
    if (valid) map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [map, lat, lng, valid]);
  return null;
}

/**
 * Admin map for picking a lat/lng with shared basemap, place search,
 * and quiet neighborhood overlays (click to pan).
 */
export default function AdminLocationMap({
  lat,
  lng,
  onChange,
  height = 360,
  challenges = [],
  activeChallengeId = null,
  neighborhoods = [],
  defaultShowChallenges = true,
  defaultShowNeighborhoods = true,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
  height?: number;
  challenges?: LocationMapChallenge[];
  activeChallengeId?: string | null;
  neighborhoods?: LocationMapNeighborhood[];
  defaultShowChallenges?: boolean;
  defaultShowNeighborhoods?: boolean;
}) {
  const [showChallenges, setShowChallenges] = useState(defaultShowChallenges);
  const [showNeighborhoods, setShowNeighborhoods] = useState(
    defaultShowNeighborhoods,
  );
  const [basemap, setBasemap] = usePersistedBasemap(
    "scavhunt.mapBasemap.adminLocation",
  );

  const valid =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const center = useMemo<[number, number]>(
    () => (valid ? [lat, lng] : SF_CENTER),
    [lat, lng, valid],
  );

  const otherChallenges = useMemo(
    () =>
      challenges.filter(
        (c) =>
          c.id !== activeChallengeId &&
          c.lat != null &&
          c.lng != null &&
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lng),
      ),
    [challenges, activeChallengeId],
  );

  return (
    <Box borderWidth="1px" borderRadius="md" overflow="hidden" bg="white">
      <HStack
        px={3}
        py={2}
        borderBottomWidth="1px"
        justify="space-between"
        flexWrap="wrap"
        gap={2}
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
              Basemap
            </Text>
            <BasemapSelect value={basemap} onChange={setBasemap} />
          </HStack>
        </HStack>
        <HStack spacing={2}>
          <Text fontSize="xs" color="gray.500" fontFamily="mono">
            {valid
              ? `${lat!.toFixed(5)}, ${lng!.toFixed(5)}`
              : "unplaced (SF center)"}
          </Text>
          {valid && (
            <Button size="xs" variant="ghost" onClick={() => onChange(null, null)}>
              Clear
            </Button>
          )}
        </HStack>
      </HStack>

      <MapContainer
        center={center}
        zoom={13}
        style={{ height, width: "100%" }}
        scrollWheelZoom
      >
        <BasemapTileLayer basemap={basemap} />
        <PlaceSearchControl />
        <ClickHandler onPick={onChange} />
        <Recententer lat={lat} lng={lng} />
        <InvalidateMapSize
          deps={[height, showChallenges, showNeighborhoods, basemap]}
        />

        {showNeighborhoods && (
          <QuietNeighborhoodLayers neighborhoods={neighborhoods} />
        )}

        {showChallenges &&
          otherChallenges.map((c) => (
            <Marker
              key={c.id}
              position={[c.lat!, c.lng!]}
              icon={otherPinIcon}
              opacity={0.85}
            >
              <Popup>
                {c.emoji ? `${c.emoji} ${c.title}` : c.title}
              </Popup>
            </Marker>
          ))}

        {valid && (
          <Marker
            position={[lat!, lng!]}
            icon={pinIcon}
            draggable
            zIndexOffset={1000}
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                onChange(p.lat, p.lng);
              },
            }}
          >
            <Popup>Selected location</Popup>
          </Marker>
        )}
      </MapContainer>

      <VStack align="stretch" spacing={0} px={3} py={2}>
        <Text fontSize="xs" color="gray.500">
          Search or click/drag the blue pin to set location. Click a
          neighborhood to pan. Leave cleared to draft without a place.
        </Text>
      </VStack>
    </Box>
  );
}
