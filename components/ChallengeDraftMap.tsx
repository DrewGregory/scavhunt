import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItemOption,
  MenuList,
  MenuOptionGroup,
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

/** Stack point for challenges with no lat/lng yet. */
const UNPLACED_STACK: [number, number] = SF_CENTER;

function pinHtml(fill: string, size: number) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#ffffff" stroke="none"/></svg>`;
}

function makeIcon(fill: string, size: number) {
  return L.divIcon({
    className: "challenge-draft-pin",
    html: pinHtml(fill, size),
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

const enabledIcon = makeIcon("#3182CE", 28);
const disabledIcon = makeIcon("#A0AEC0", 24);
const selectedIcon = makeIcon("#DD6B20", 34);
const unplacedIcon = makeIcon("#718096", 26);
const unplacedSelectedIcon = makeIcon("#DD6B20", 34);

function MapEvents({
  selectedId,
  onMapClickPlace,
  onContextCreate,
  onDeselect,
}: {
  selectedId: string | null;
  onMapClickPlace: (lat: number, lng: number) => void;
  onContextCreate: (lat: number, lng: number) => void;
  onDeselect: () => void;
}) {
  useMapEvents({
    click(e) {
      if (selectedId) onMapClickPlace(e.latlng.lat, e.latlng.lng);
    },
    dblclick(e) {
      if (!selectedId) return;
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e.originalEvent);
      onDeselect();
    },
    contextmenu(e) {
      e.originalEvent.preventDefault();
      onContextCreate(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Esc clears selection while a challenge is selected. */
function EscapeDeselect({
  selectedId,
  onDeselect,
}: {
  selectedId: string | null;
  onDeselect: () => void;
}) {
  useEffect(() => {
    if (!selectedId) return;
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
      onDeselect();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, onDeselect]);
  return null;
}

/** Prefer deselect-on-dblclick over zoom while a pin is selected. */
function DoubleClickZoomWhenIdle({ selectedId }: { selectedId: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (selectedId) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [map, selectedId]);
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
    if (!challenge) return;
    const lat = challenge.lat ?? UNPLACED_STACK[0];
    const lng = challenge.lng ?? UNPLACED_STACK[1];
    map.setView([lat, lng], Math.max(map.getZoom(), 14), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, challenge?.id, token]);
  return null;
}

/** While a pin is dragged, disable map pan so Leaflet doesn't steal the gesture. */
function MapDragLock({ locked }: { locked: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!locked) return;
    map.dragging.disable();
    map.doubleClickZoom.disable();
    return () => {
      map.dragging.enable();
      map.doubleClickZoom.enable();
    };
  }, [map, locked]);
  return null;
}

export default function ChallengeDraftMap({
  challenges,
  neighborhoods,
  selectedId,
  panToken = 0,
  onSelect,
  onDeselect,
  onMapClickPlace,
  onContextCreate,
  onMarkerMove,
  neighborhoodFilter = [],
  neighborhoodOptions = [],
  onNeighborhoodFilterChange,
  height = "100%",
}: {
  challenges: DraftChallenge[];
  neighborhoods: DraftMapNeighborhood[];
  selectedId: string | null;
  /** kept for API compat; selection drives drag, not field-edit mode */
  editingId?: string | null;
  panToken?: number;
  onSelect: (id: string) => void;
  onDeselect: () => void;
  onMapClickPlace: (lat: number, lng: number) => void;
  onContextCreate: (lat: number, lng: number) => void;
  onMarkerMove: (id: string, lat: number, lng: number) => void;
  neighborhoodFilter?: string[];
  neighborhoodOptions?: Array<{ id: string; label: string }>;
  onNeighborhoodFilterChange?: (ids: string[]) => void;
  height?: number | string;
}) {
  const [showChallenges, setShowChallenges] = useState(true);
  const [showNeighborhoods, setShowNeighborhoods] = useState(true);
  const [hideDisabled, setHideDisabled] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [pinDragging, setPinDragging] = useState(false);
  const [basemap, setBasemap] = usePersistedBasemap(
    "scavhunt.mapBasemap.draft",
  );

  /** All challenges (incl. no location → stack at SF center). */
  const mapChallenges = useMemo(() => {
    return challenges
      .filter((c) => !hideDisabled || c.enabled)
      .map((c) => {
        const unplaced = c.lat == null || c.lng == null;
        return {
          challenge: c,
          unplaced,
          lat: unplaced ? UNPLACED_STACK[0] : c.lat!,
          lng: unplaced ? UNPLACED_STACK[1] : c.lng!,
        };
      });
  }, [challenges, hideDisabled]);

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
        <HStack
          position="absolute"
          top={3}
          right={3}
          zIndex={1000}
          align="flex-start"
          spacing={2}
        >
          {onNeighborhoodFilterChange && (
            <Menu closeOnSelect={false}>
              <MenuButton
                as={Button}
                size="sm"
                bg="white"
                boxShadow="md"
                fontWeight="medium"
              >
                {neighborhoodFilter.length === 0
                  ? "Neighborhoods"
                  : `${neighborhoodFilter.length} neighborhoods`}
              </MenuButton>
              <MenuList maxH="280px" overflowY="auto" minW="220px">
                <MenuOptionGroup
                  type="checkbox"
                  value={neighborhoodFilter}
                  onChange={(v) =>
                    onNeighborhoodFilterChange(
                      typeof v === "string" ? [v] : [...v],
                    )
                  }
                >
                  {neighborhoodOptions.map((o) => (
                    <MenuItemOption key={o.id} value={o.id}>
                      {o.label}
                    </MenuItemOption>
                  ))}
                </MenuOptionGroup>
                {neighborhoodFilter.length > 0 && (
                  <Box px={3} py={2} borderTopWidth="1px">
                    <Button
                      size="xs"
                      variant="ghost"
                      w="100%"
                      onClick={() => onNeighborhoodFilterChange([])}
                    >
                      Clear filter
                    </Button>
                  </Box>
                )}
              </MenuList>
            </Menu>
          )}
          <Box>
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
                      Neighborhood overlays
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
        </HStack>

        {selected && (
          <Box
            position="absolute"
            bottom={3}
            left="50%"
            transform="translateX(-50%)"
            zIndex={1000}
            bg="orange.500"
            color="white"
            px={3}
            py={1.5}
            borderRadius="lg"
            boxShadow="md"
            fontSize="xs"
            pointerEvents="none"
            textAlign="center"
            maxW="90%"
          >
            <Text fontWeight="semibold" whiteSpace="nowrap">
              Click map to move. Press escape to stop editing
            </Text>
            <Text fontWeight="medium" opacity={0.95} noOfLines={1} mt={0.5}>
              Editing {selected.title}
            </Text>
          </Box>
        )}

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
            onDeselect={onDeselect}
          />
          <EscapeDeselect selectedId={selectedId} onDeselect={onDeselect} />
          <DoubleClickZoomWhenIdle selectedId={selectedId} />
          <FlyToSelected challenge={selected} token={panToken} />
          <MapDragLock locked={pinDragging} />
          <InvalidateMapSize
            deps={[
              showChallenges,
              showNeighborhoods,
              hideDisabled,
              height,
              basemap,
              layersOpen,
              selectedId,
            ]}
          />

          {showNeighborhoods && (
            <QuietNeighborhoodLayers neighborhoods={neighborhoods} />
          )}

          {showChallenges &&
            mapChallenges.map(({ challenge: c, unplaced, lat, lng }) => {
              const isSelected = selectedId === c.id;
              const icon = isSelected
                ? unplaced
                  ? unplacedSelectedIcon
                  : selectedIcon
                : unplaced
                  ? unplacedIcon
                  : c.enabled
                    ? enabledIcon
                    : disabledIcon;
              return (
                <Marker
                  key={c.id}
                  position={[lat, lng]}
                  draggable={isSelected}
                  autoPan={isSelected}
                  icon={icon}
                  opacity={isSelected ? 1 : c.enabled ? 0.9 : 0.65}
                  zIndexOffset={
                    isSelected ? 2000 : unplaced ? 50 : c.enabled ? 100 : 0
                  }
                  eventHandlers={{
                    click: (e) => {
                      L.DomEvent.stopPropagation(e);
                      if (isSelected) onDeselect();
                      else onSelect(c.id);
                    },
                    dblclick: (e) => {
                      L.DomEvent.stopPropagation(e);
                      L.DomEvent.preventDefault(e.originalEvent);
                      if (isSelected) onDeselect();
                    },
                    mousedown: (e) => {
                      if (isSelected) L.DomEvent.stopPropagation(e);
                    },
                    dragstart: (e) => {
                      L.DomEvent.stopPropagation(e);
                      setPinDragging(true);
                    },
                    dragend: (e) => {
                      setPinDragging(false);
                      const p = (e.target as L.Marker).getLatLng();
                      onMarkerMove(c.id, p.lat, p.lng);
                    },
                  }}
                >
                  <Tooltip
                    direction={isSelected ? "right" : "top"}
                    offset={isSelected ? [14, -18] : [0, -40]}
                    opacity={0.95}
                    permanent={isSelected}
                  >
                    <strong>{c.title}</strong>
                    <br />
                    {unplaced ? "No location · " : ""}
                    {c.enabled ? "Enabled" : "Disabled"} · {c.pts} pts
                    {isSelected ? " · drag me" : ""}
                  </Tooltip>
                </Marker>
              );
            })}
        </MapContainer>
      </Box>
    </Box>
  );
}
