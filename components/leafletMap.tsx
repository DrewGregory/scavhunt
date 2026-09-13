import { useEffect, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { LatLngExpression, divIcon, icon } from "leaflet";
import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { LatestTeamLocation } from '../lib/types';
import { Box, HStack, Switch, Text, VStack } from '@chakra-ui/react';

type ChallengeWithSubmissions = {
  _id: string;
  title: string;
  loc: {
    lat: number;
    lng: number;
  };
  numWinners: number;
  submissions: Array<{
    teamId: string;
    accepted: boolean;
    rejected?: boolean;
    [key: string]: any;
  }>;
};

export default function LeafletMap({
  locations,
  challenges,
  team,
}: {
  locations: Array<LatestTeamLocation>
  challenges: Array<ChallengeWithSubmissions>
  team: any
}) {
  const [showChallenges, setShowChallenges] = useState(true);
  const [showPlayers, setShowPlayers] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [hideFullChallenges, setHideFullChallenges] = useState(false);

  useEffect(() => {
    // This ensures the map container size is calculated correctly
    window.dispatchEvent(new Event('resize'));
  }, []);

  // Filter out completed challenges if hideCompleted is true
  const completedFilteredChallenges = hideCompleted && team
    ? challenges.filter(c => 
        !c.submissions.some(s => s.teamId === (team as any)._id && s.accepted)
      )
    : challenges;
  
  // Filter out full challenges if hideFullChallenges is true
  const filteredChallenges = hideFullChallenges
    ? completedFilteredChallenges.filter(c => 
        c.submissions.filter(s => s.accepted).length < c.numWinners
      )
    : completedFilteredChallenges;

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
    <Box position="relative" height="100%" width="100%">
      {/* Toggle Controls */}
      <Box
        position="absolute"
        bottom={4}
        right={4}
        zIndex={1000}
        bg="white"
        p={4}
        borderRadius="md"
        boxShadow="lg"
        maxWidth="280px"
      >
        <VStack spacing={3} alignItems="stretch">
          <HStack justifyContent="space-between">
            <Text fontSize="sm" fontWeight="medium">
              Challenges
            </Text>
            <Switch
              id="show-challenges"
              isChecked={showChallenges}
              onChange={(e) => setShowChallenges(e.target.checked)}
              colorScheme="blue"
            />
          </HStack>
          <HStack justifyContent="space-between">
            <Text fontSize="sm" fontWeight="medium">
              Teams
            </Text>
            <Switch
              id="show-players"
              isChecked={showPlayers}
              onChange={(e) => setShowPlayers(e.target.checked)}
              colorScheme="blue"
            />
          </HStack>
          {team && (
            <>
              <Box borderTop="1px solid" borderColor="gray.200" pt={3}>
                <HStack justifyContent="space-between">
                  <Text fontSize="xs" fontWeight="medium" color="gray.600">
                    Hide finished
                  </Text>
                  <Switch
                    size="sm"
                    isChecked={hideCompleted}
                    onChange={(e) => setHideCompleted(e.target.checked)}
                    colorScheme="blue"
                  />
                </HStack>
              </Box>
              <HStack justifyContent="space-between">
                <Text fontSize="xs" fontWeight="medium" color="gray.600">
                  Hide at capacity
                </Text>
                <Switch
                  size="sm"
                  isChecked={hideFullChallenges}
                  onChange={(e) => setHideFullChallenges(e.target.checked)}
                  colorScheme="blue"
                />
              </HStack>
            </>
          )}
        </VStack>
      </Box>

      {/* Map */}
      <MapContainer center={position} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {showChallenges && filteredChallenges.map(c =>
          <Marker icon={BlackMarker} key={c._id} position={[c.loc.lat, c.loc.lng]}>
            <Popup>
              <Link href={`/challenges?challenge=${c._id}`}>{c.title}</Link>
            </Popup>
          </Marker>
        )}
        {showPlayers && locations.map(l => 
          <Marker icon={divIcon({
            html: `${l.emoji}`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            className: 'teamMarker',
          })} key={l._id} position={[l.latestLocation.lat, l.latestLocation.lng]}>
            <Popup>
              <Link href={`/teams?team=${l._id}`}>{l.emoji} {l.name}</Link>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </Box>
  );
}
