/**
 * Thin wrapper kept for any callers that only need a simple pin picker.
 * Prefer AdminLocationMap when overlays are useful.
 */
import AdminLocationMap from "./AdminLocationMap";

export default function ChallengeLocationPicker({
  lat,
  lng,
  onChange,
  height = 260,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
  height?: number;
}) {
  return (
    <AdminLocationMap
      lat={lat}
      lng={lng}
      onChange={onChange}
      height={height}
      defaultShowChallenges={false}
      defaultShowNeighborhoods={false}
    />
  );
}
