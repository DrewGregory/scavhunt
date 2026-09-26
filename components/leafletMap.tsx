import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
} from "react-leaflet";
import { LatLngExpression, PathOptions, divIcon, icon, type Path } from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { LatestTeamLocation } from "../lib/types";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  Switch,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { FiLayers } from "react-icons/fi";
import { getPosition, type GeoFix } from "./useSession";
import {
  centroidOf,
  findNeighborhoodAt,
  SF_CENTER,
  type GeoGeometry,
} from "../lib/geo";

type ChallengeWithSubmissions = {
  id: string;
  title: string;
  lat: number | null;
  lng: number | null;
  numWinners: number;
  submissions: Array<{
    teamId: string;
    accepted: boolean;
    rejected?: boolean;
    [key: string]: unknown;
  }>;
};

type TeamSlice = {
  teamId: string;
  teamName: string;
  teamEmoji: string;
  teamColor: string;
  points: number;
};

export type TerritoryNeighborhood = {
  id: string;
  name: string;
  emoji: string | null;
  centerLat: number | null;
  centerLng: number | null;
  boundary: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  } | null;
  totals: TeamSlice[];
  claimedBy: TeamSlice | null;
  contested: boolean;
  totalDeposited: number;
};

type Bank = {
  earned: number;
  deposited: number;
  score: number;
};

export default function LeafletMap({
  locations,
  challenges,
  team,
  territoryEnabled = false,
  isAdmin = false,
  initialNeighborhoods = [],
  initialBank = null,
}: {
  locations: Array<LatestTeamLocation>;
  challenges: Array<ChallengeWithSubmissions>;
  team: { id: string; name?: string; emoji?: string; color?: string } | null;
  /** Global HuntSettings.territoryEnabled — players only see territory when true. */
  territoryEnabled?: boolean;
  isAdmin?: boolean;
  initialNeighborhoods?: TerritoryNeighborhood[];
  initialBank?: Bank | null;
}) {
  const toast = useToast();
  const [showChallenges, setShowChallenges] = useState(true);
  const [showPlayers, setShowPlayers] = useState(true);
  const [showNeighborhoods, setShowNeighborhoods] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [hideFullChallenges, setHideFullChallenges] = useState(false);
  /** Admin-only local toggle (does not change HuntSettings). */
  const [previewTerritory, setPreviewTerritory] = useState(
    () => territoryEnabled || isAdmin,
  );
  const territoryOn = isAdmin ? previewTerritory : territoryEnabled;
  const [neighborhoods, setNeighborhoods] =
    useState<TerritoryNeighborhood[]>(initialNeighborhoods);
  const [bank, setBank] = useState<Bank | null>(initialBank);
  const [depositAmount, setDepositAmount] = useState("10");
  const [depositing, setDepositing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [myFix, setMyFix] = useState<GeoFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const myFixRef = useRef<GeoFix | null>(null);
  /** Only one neighborhood highlight at a time (fast mouse moves skip mouseout). */
  const highlightedLayerRef = useRef<{
    layer: Path;
    style: PathOptions;
  } | null>(null);

  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  const applyFix = useCallback((fix: GeoFix) => {
    myFixRef.current = fix;
    setMyFix(fix);
  }, []);

  const refreshMyLocation = useCallback(async () => {
    if (!territoryOn || !team) return;
    setLocating(true);
    try {
      const fix = await getPosition({
        enableHighAccuracy: true,
        // Accept a recent cached reading — don't force a cold GPS lock
        maximumAge: 30_000,
        timeout: 8_000,
        hardTimeoutMs: 10_000,
      });
      applyFix(fix);
    } catch (e) {
      // Keep the last good fix if we have one; only toast when we have nothing
      if (!myFixRef.current) {
        toast({
          title: e instanceof Error ? e.message : "Could not get location",
          status: "warning",
          duration: 4000,
        });
      }
    } finally {
      setLocating(false);
    }
  }, [territoryOn, team, toast, applyFix]);

  // Live GPS via watch only — avoid a parallel getCurrentPosition (that was
  // re-prompting / hanging on deposit). Refresh button still does a one-shot.
  useEffect(() => {
    if (!territoryOn || !team) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        applyFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy:
            typeof pos.coords.accuracy === "number"
              ? pos.coords.accuracy
              : null,
        });
      },
      () => {
        /* keep last fix; Refresh button still available */
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 15_000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [territoryOn, team, applyFix]);

  const currentNeighborhood = useMemo(() => {
    if (!myFix) return null;
    return findNeighborhoodAt(myFix.lng, myFix.lat, neighborhoods);
  }, [myFix, neighborhoods]);

  const controlAfterDeposit = useMemo(() => {
    if (!team || !currentNeighborhood) return null;
    const pts = Math.floor(Number(depositAmount));
    if (!Number.isFinite(pts) || pts <= 0) return null;

    const mineNow =
      currentNeighborhood.totals.find((t) => t.teamId === team.id)?.points ?? 0;
    const mineAfter = mineNow + pts;
    const topRival = currentNeighborhood.totals.find((t) => t.teamId !== team.id);
    const rivalPts = topRival?.points ?? 0;

    if (mineAfter > rivalPts) {
      return {
        kind: "control" as const,
        label: `${team.emoji ?? ""} ${team.name ?? "Your team"}`.trim(),
      };
    }
    if (topRival && mineAfter === rivalPts) {
      return { kind: "tie" as const, label: null };
    }
    if (topRival) {
      return {
        kind: "other" as const,
        label: `${topRival.teamEmoji} ${topRival.teamName}`,
      };
    }
    return {
      kind: "control" as const,
      label: `${team.emoji ?? ""} ${team.name ?? "Your team"}`.trim(),
    };
  }, [team, currentNeighborhood, depositAmount]);

  const refreshTerritory = useCallback(async () => {
    if (!territoryOn) return;
    const res = await fetch("/api/territory");
    if (!res.ok) return;
    const data = await res.json();
    setNeighborhoods(data.neighborhoods ?? []);
    if (data.bank) setBank(data.bank);
  }, [territoryOn]);

  useEffect(() => {
    if (territoryOn && neighborhoods.length === 0) {
      void refreshTerritory();
    }
  }, [territoryOn, neighborhoods.length, refreshTerritory]);

  const completedFiltered =
    hideCompleted && team
      ? challenges.filter(
          (c) =>
            !c.submissions.some((s) => s.teamId === team.id && s.accepted),
        )
      : challenges;

  const filteredChallenges = hideFullChallenges
    ? completedFiltered.filter(
        (c) => c.submissions.filter((s) => s.accepted).length < c.numWinners,
      )
    : completedFiltered;

  const BlackMarker = icon({
    iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path fill="black" d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg>`,
    )}`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });

  const standingsKey = useMemo(
    () =>
      neighborhoods
        .map(
          (n) =>
            `${n.id}:${n.claimedBy?.teamId ?? ""}:${n.contested ? "c" : ""}:${n.totalDeposited}`,
        )
        .join("|"),
    [neighborhoods],
  );

  const styleFor = useCallback(
    (n: TerritoryNeighborhood): PathOptions => {
      const isHere = currentNeighborhood?.id === n.id;
      if (n.contested) {
        return {
          color: isHere ? "#2B6CB0" : "#4A5568",
          weight: isHere ? 3.5 : 1.5,
          dashArray: "6 4",
          fillColor: isHere ? "#90CDF4" : "#A0AEC0",
          fillOpacity: isHere ? 0.55 : 0.35,
        };
      }
      if (n.claimedBy) {
        return {
          color: isHere ? "#2B6CB0" : n.claimedBy.teamColor,
          weight: isHere ? 3.5 : 1.5,
          fillColor: isHere ? "#90CDF4" : n.claimedBy.teamColor,
          fillOpacity: isHere ? 0.55 : 0.4,
        };
      }
      return {
        color: isHere ? "#2B6CB0" : "#718096",
        weight: isHere ? 3.5 : 1,
        fillColor: isHere ? "#90CDF4" : "#E2E8F0",
        fillOpacity: isHere ? 0.55 : 0.25,
      };
    },
    [currentNeighborhood?.id],
  );

  const handleDeposit = async () => {
    if (!team || !territoryOn) return;
    if (!currentNeighborhood) {
      toast({
        title: "Move into a neighborhood first",
        status: "warning",
      });
      return;
    }
    const points = Math.floor(Number(depositAmount));
    if (!Number.isFinite(points) || points <= 0) {
      toast({ title: "Enter a positive number of points", status: "warning" });
      return;
    }
    if (bank && points > bank.score) {
      toast({ title: `You only have ${bank.score} pts`, status: "warning" });
      return;
    }

    setDepositing(true);
    try {
      // Use the live watch fix — don't call getCurrentPosition again (that
      // re-prompted for permission and could hang forever in some browsers).
      const fix = myFixRef.current;
      if (!fix) {
        throw new Error("No GPS fix yet — tap Refresh or wait a moment");
      }

      setStatusMsg("Depositing…");
      const res = await fetch("/api/territory/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
          points,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: data.error || "Deposit failed",
          status: "error",
          duration: 5000,
        });
        setStatusMsg(null);
        return;
      }
      toast({
        title: `Deposited ${points} pts into ${data.deposit.neighborhoodName}`,
        status: "success",
      });
      if (data.bank) setBank(data.bank);
      await refreshTerritory();
      setStatusMsg(null);
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Deposit failed",
        status: "error",
      });
      setStatusMsg(null);
    } finally {
      setDepositing(false);
    }
  };

  const position: LatLngExpression = SF_CENTER;

  return (
    <Box position="relative" height="100%" width="100%">
      <Box position="absolute" top={4} right={4} zIndex={1000}>
        <IconButton
          aria-label={layersOpen ? "Hide map layers" : "Show map layers"}
          icon={<FiLayers />}
          size="md"
          colorScheme="blackAlpha"
          bg="white"
          color="gray.700"
          boxShadow="lg"
          onClick={() => setLayersOpen((o) => !o)}
        />
        {layersOpen ? (
          <Box
            mt={2}
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
                  isChecked={showPlayers}
                  onChange={(e) => setShowPlayers(e.target.checked)}
                  colorScheme="blue"
                />
              </HStack>
              {isAdmin && (
                <HStack justifyContent="space-between">
                  <Box>
                    <Text fontSize="sm" fontWeight="medium">
                      Territory mode
                    </Text>
                    {!territoryEnabled && (
                      <Text fontSize="xs" color="purple.600">
                        Players: off
                      </Text>
                    )}
                  </Box>
                  <Switch
                    isChecked={previewTerritory}
                    onChange={(e) => setPreviewTerritory(e.target.checked)}
                    colorScheme="purple"
                  />
                </HStack>
              )}
              {territoryOn && (
                <HStack justifyContent="space-between">
                  <Text fontSize="sm" fontWeight="medium">
                    Neighborhoods
                  </Text>
                  <Switch
                    isChecked={showNeighborhoods}
                    onChange={(e) => setShowNeighborhoods(e.target.checked)}
                    colorScheme="blue"
                  />
                </HStack>
              )}
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
        ) : null}
      </Box>

      {territoryOn && team && (
        <Box
          position="absolute"
          bottom={4}
          left={4}
          zIndex={1000}
          bg="white"
          p={4}
          borderRadius="md"
          boxShadow="lg"
          maxW="420px"
        >
          <VStack align="stretch" spacing={2}>
            <Text fontSize="sm" fontWeight="semibold">
              {currentNeighborhood
                ? `Deposit points in ${currentNeighborhood.emoji ? `${currentNeighborhood.emoji} ` : ""}${currentNeighborhood.name}`
                : locating && !myFix
                  ? "Finding your location…"
                  : myFix
                    ? "Move into a neighborhood to deposit"
                    : "Allow GPS to deposit"}
            </Text>
            <Text fontSize="xs" color="gray.600">
              You have{" "}
              <Text as="span" fontWeight="bold" color="gray.800">
                {bank?.score ?? "—"} pts
              </Text>
              {controlAfterDeposit?.kind === "control" ? (
                <>
                  . After this deposit,{" "}
                  <Text as="span" fontWeight="bold" color="gray.800">
                    {controlAfterDeposit.label}
                  </Text>{" "}
                  will control this neighborhood.
                </>
              ) : controlAfterDeposit?.kind === "tie" ? (
                <>
                  . After this deposit, this neighborhood will be contested.
                </>
              ) : controlAfterDeposit?.kind === "other" ? (
                <>
                  . After this deposit,{" "}
                  <Text as="span" fontWeight="bold" color="gray.800">
                    {controlAfterDeposit.label}
                  </Text>{" "}
                  will control this neighborhood.
                </>
              ) : (
                "."
              )}
            </Text>
            <HStack>
              <Input
                type="number"
                min={1}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                maxW="100px"
                size="sm"
              />
              <Button
                size="sm"
                colorScheme="blue"
                onClick={handleDeposit}
                isLoading={depositing}
                isDisabled={!currentNeighborhood}
              >
                Deposit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refreshMyLocation()}
                isLoading={locating}
              >
                Refresh
              </Button>
            </HStack>
            {statusMsg && (
              <Text fontSize="xs" color="gray.500">
                {statusMsg}
              </Text>
            )}
          </VStack>
        </Box>
      )}

      <MapContainer
        center={position}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {territoryOn &&
          showNeighborhoods &&
          neighborhoods.map((n) => {
            if (!n.boundary) return null;
            const feature = {
              type: "Feature" as const,
              properties: { id: n.id, name: n.name },
              geometry: n.boundary,
            };
            return (
              <GeoJSON
                key={`${n.id}-${standingsKey}-${currentNeighborhood?.id ?? "none"}`}
                data={feature as never}
                style={() => styleFor(n)}
                onEachFeature={(_feat, layer) => {
                  const baseStyle = styleFor(n);
                  const claimLabel = n.contested
                    ? "Contested"
                    : n.claimedBy
                      ? `${n.claimedBy.teamEmoji} ${n.claimedBy.teamName} (${n.claimedBy.points})`
                      : "Unclaimed";
                  const totalsHtml = n.totals
                    .slice(0, 5)
                    .map(
                      (t) =>
                        `<div>${t.teamEmoji} ${t.teamName}: ${t.points}</div>`,
                    )
                    .join("");
                  const hereNote =
                    currentNeighborhood?.id === n.id
                      ? "<br/><em>You are here</em>"
                      : "";
                  layer.bindPopup(
                    `<strong>${n.emoji ?? ""} ${n.name}</strong><br/>${claimLabel}<br/>${totalsHtml || "<em>No deposits yet</em>"}${hereNote}`,
                  );
                  if (currentNeighborhood?.id === n.id) {
                    // Keep "you are here" zone above neighbors for visibility
                    if (typeof (layer as Path).bringToFront === "function") {
                      (layer as Path).bringToFront();
                    }
                  }
                  layer.on({
                    mouseover: (e) => {
                      const target = e.target as Path;
                      const prev = highlightedLayerRef.current;
                      if (prev && prev.layer !== target) {
                        prev.layer.setStyle(prev.style);
                      }
                      target.setStyle({
                        fillColor: "#68D391",
                        fillOpacity: 0.55,
                        color: "#276749",
                        weight: 3,
                        dashArray: undefined,
                      });
                      if (typeof target.bringToFront === "function") {
                        target.bringToFront();
                      }
                      highlightedLayerRef.current = {
                        layer: target,
                        style: baseStyle,
                      };
                    },
                    mouseout: (e) => {
                      const target = e.target as Path;
                      target.setStyle(baseStyle);
                      if (highlightedLayerRef.current?.layer === target) {
                        highlightedLayerRef.current = null;
                      }
                    },
                  });
                }}
              />
            );
          })}
        {territoryOn &&
          showNeighborhoods &&
          neighborhoods.map((n) => {
            const fromBoundary =
              n.boundary != null
                ? centroidOf(n.boundary as GeoGeometry)
                : null;
            const lat = fromBoundary?.lat ?? n.centerLat;
            const lng = fromBoundary?.lng ?? n.centerLng;
            if (lat == null || lng == null) return null;
            const borderColor = n.claimedBy?.teamColor ?? "#CBD5E0";
            const label = n.claimedBy
              ? `${n.claimedBy.teamEmoji} ${n.name}`
              : n.contested
                ? `~ ${n.name}`
                : n.name;
            return (
              <Marker
                key={`label-${n.id}-${standingsKey}`}
                position={[lat, lng]}
                icon={divIcon({
                  className: "neighborhood-label-icon",
                  html: `<div class="neighborhood-label-pill" style="border-color:${borderColor}">${label}</div>`,
                  iconSize: [0, 0],
                  iconAnchor: [0, 0],
                })}
                interactive={false}
                zIndexOffset={400}
              />
            );
          })}
        {showChallenges &&
          filteredChallenges.map((c) => (
            <Marker
              icon={BlackMarker}
              key={c.id}
              position={[c.lat ?? SF_CENTER[0], c.lng ?? SF_CENTER[1]]}
            >
              <Popup>
                <Link href={`/challenges?challenge=${c.id}`}>{c.title}</Link>
              </Popup>
            </Marker>
          ))}
        {showPlayers &&
          locations.map((l) => (
            <Marker
              icon={divIcon({
                html: `${l.emoji}`,
                iconSize: [36, 36],
                iconAnchor: [18, 18],
                className: "teamMarker",
              })}
              key={l.id}
              position={[l.latestLocation.lat, l.latestLocation.lng]}
            >
              <Popup>
                <Link href={`/teams?team=${l.id}`}>
                  {l.emoji} {l.name}
                </Link>
              </Popup>
            </Marker>
          ))}
        {territoryOn && myFix && (
          <CircleMarker
            center={[myFix.lat, myFix.lng]}
            radius={8}
            pathOptions={{
              color: "#2B6CB0",
              weight: 2,
              fillColor: "#63B3ED",
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              You
              {currentNeighborhood
                ? ` — in ${currentNeighborhood.name}`
                : " — outside playable neighborhoods"}
            </Popup>
          </CircleMarker>
        )}
      </MapContainer>
    </Box>
  );
}
