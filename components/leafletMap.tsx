import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { LatLngExpression, divIcon, icon } from "leaflet";
import 'leaflet/dist/leaflet.css';
import { SerializedChallenge } from '../models/Challenge';
import Link from 'next/link';
import { LatestTeamLocation } from '../lib/types';

export default function LeafletMap({
  locations,
  challenges,
}: {
  locations: Array<LatestTeamLocation>
  challenges: Array<SerializedChallenge>
}) {
  useEffect(() => {
    // This ensures the map container size is calculated correctly
    window.dispatchEvent(new Event('resize'));
  }, []);
  // https://fontawesome.com/icons/location-dot
  const BLACK_MARKER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg>`)}`;


  const BlackMarker = icon({
    iconUrl: BLACK_MARKER_SVG,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });

  const position: LatLngExpression = [37.7749, -122.4194];
  return (
    <MapContainer center={position} zoom={13} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {challenges.map(c =>
        <Marker icon={BlackMarker} key={c._id} position={[c.loc.lat, c.loc.lng]}>
          <Popup>
            <Link href={`/challenges?challenge=${c._id}`}>{c.title}</Link>
          </Popup>
        </Marker>
      )}
      {
        
        locations.map(l => 
          <Marker icon={divIcon({
            html: `${l.emoji}`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            className: 'teamMarker',
          })} key={l._id} position={[l.latestLocation.lat, l.latestLocation.lng]}>
            <Popup>
              <Link href={`/teams?team=${l._id}`}>{l.emoji}</Link>
            </Popup>
          </Marker>
        )
      }
    </MapContainer>
  );
}
