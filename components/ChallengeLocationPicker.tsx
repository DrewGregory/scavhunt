import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Box, Text } from "@chakra-ui/react";

const SF_CENTER: [number, number] = [37.7749, -122.4194];

// Draggable default pin so the picker doesn't depend on external image assets.
const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="28" height="28" viewBox="0 0 24 24" fill="#3182CE" stroke="#ffffff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#ffffff" stroke="none"/></svg>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
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

// Re-centers the map whenever the coordinates change (e.g. typed manually).
function Recententer({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const valid = Number.isFinite(lat) && Number.isFinite(lng);
  useEffect(() => {
    if (valid) map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [map, lat, lng, valid]);
  return null;
}

// The map renders inside an animated Chakra Modal, so Leaflet can measure the
// container before it reaches its final size — recalculate once it settles.
function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export default function ChallengeLocationPicker({
  lat,
  lng,
  onChange,
  height = 260,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  height?: number;
}) {
  const valid = Number.isFinite(lat) && Number.isFinite(lng);
  const center = useMemo<[number, number]>(
    () => (valid ? [lat, lng] : SF_CENTER),
    [lat, lng, valid],
  );

  return (
    <Box borderWidth="1px" borderRadius="md" overflow="hidden">
      <MapContainer
        center={center}
        zoom={13}
        style={{ height, width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onPick={onChange} />
        <Recententer lat={lat} lng={lng} />
        <InvalidateSize />
        {valid && (
          <Marker
            position={[lat, lng]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                onChange(p.lat, p.lng);
              },
            }}
          />
        )}
      </MapContainer>
      <Text fontSize="xs" color="gray.500" px={2} py={1}>
        Click the map or drag the pin to set the location
      </Text>
    </Box>
  );
}
