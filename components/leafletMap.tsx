import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Popup,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { LatLngExpression, PathOptions, divIcon, type Path } from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { LatestTeamLocation } from "../lib/types";
import type { MapFilterTeam } from "../lib/mapPayload";
import {
  Badge,
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
import { LuLayers } from "react-icons/lu";
import { getPosition, type GeoFix } from "./useSession";
import { useLocationPermissionUI } from "./LocationPermissionPrompt";
import {
  centroidOf,
  findNeighborhoodAt,
  SF_CENTER,
  type GeoGeometry,
} from "../lib/geo";
import { DEFAULT_PLAYER_BASEMAP } from "../lib/mapBasemaps";
import { BasemapTileLayer } from "./HuntMapShared";
import {
  challengePinKind,
  makeChallengePinIcon,
} from "../lib/challengePins";

/** Show neighborhood name pills at this zoom and above (polygons always show). */
const NEIGHBORHOOD_LABEL_MIN_ZOOM = 14;

function canHover(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

type ChallengeWithSubmissions = {
  id: string;
  title: string;
  emoji?: string | null;
  lat: number | null;
  lng: number | null;
  numWinners: number;
  pts?: number;
  favorited?: boolean;
  submissions: Array<{
    id?: string;
    teamId: string;
    accepted: boolean;
    rejected?: boolean;
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

function FlyToSelection({
  challenge,
  neighborhood,
  zoomChallengeId,
  zoomNeighborhoodId,
  onDeepLinkZoomConsumed,
}: {
  challenge: ChallengeWithSubmissions | null;
  neighborhood: TerritoryNeighborhood | null;
  zoomChallengeId?: string | null;
  zoomNeighborhoodId?: string | null;
  onDeepLinkZoomConsumed?: (kind: "challenge" | "neighborhood") => void;
}) {
  const map = useMap();
  const lastChallengeId = useRef<string | null>(null);
  const lastNeighborhoodId = useRef<string | null>(null);

  useEffect(() => {
    if (!challenge) {
      lastChallengeId.current = null;
      return;
    }
    if (lastChallengeId.current === challenge.id) return;
    lastChallengeId.current = challenge.id;
    const lat = challenge.lat ?? SF_CENTER[0];
    const lng = challenge.lng ?? SF_CENTER[1];
    map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
    if (zoomChallengeId === challenge.id) {
      onDeepLinkZoomConsumed?.("challenge");
    }
  }, [
    map,
    challenge?.id,
    challenge?.lat,
    challenge?.lng,
    zoomChallengeId,
    onDeepLinkZoomConsumed,
  ]);

  useEffect(() => {
    if (!neighborhood) {
      lastNeighborhoodId.current = null;
      return;
    }
    if (lastNeighborhoodId.current === neighborhood.id) return;
    lastNeighborhoodId.current = neighborhood.id;
    const fromBoundary =
      neighborhood.boundary != null
        ? centroidOf(neighborhood.boundary as GeoGeometry)
        : null;
    const lat = fromBoundary?.lat ?? neighborhood.centerLat;
    const lng = fromBoundary?.lng ?? neighborhood.centerLng;
    if (lat == null || lng == null) return;
    map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
    if (zoomNeighborhoodId === neighborhood.id) {
      onDeepLinkZoomConsumed?.("neighborhood");
    }
  }, [
    map,
    neighborhood?.id,
    neighborhood?.boundary,
    neighborhood?.centerLat,
    neighborhood?.centerLng,
    zoomNeighborhoodId,
    onDeepLinkZoomConsumed,
  ]);

  return null;
}

function NeighborhoodLabelLayer({
  neighborhoods,
  standingsKey,
  selectedNeighborhoodId,
  onSelectNeighborhood,
}: {
  neighborhoods: TerritoryNeighborhood[];
  standingsKey: string;
  selectedNeighborhoodId?: string | null;
  onSelectNeighborhood?: (id: string | null) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const [hoverOk, setHoverOk] = useState(false);

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
    zoom: () => setZoom(map.getZoom()),
  });

  useEffect(() => {
    setHoverOk(canHover());
  }, []);

  if (zoom < NEIGHBORHOOD_LABEL_MIN_ZOOM) return null;

  return (
    <>
      {neighborhoods.map((n) => {
        const fromBoundary =
          n.boundary != null ? centroidOf(n.boundary as GeoGeometry) : null;
        const lat = fromBoundary?.lat ?? n.centerLat;
        const lng = fromBoundary?.lng ?? n.centerLng;
        if (lat == null || lng == null) return null;
        const borderColor =
          selectedNeighborhoodId === n.id
            ? "#2B6CB0"
            : (n.claimedBy?.teamColor ?? "#CBD5E0");
        // Prefix with claiming team's emoji (not the neighborhood's).
        const label = n.claimedBy
          ? `${n.claimedBy.teamEmoji} ${n.name}`
          : n.contested
            ? `~ ${n.name}`
            : n.name;
        const totalsLine = n.totals
          .slice(0, 5)
          .map((t) => `${t.teamEmoji} ${t.teamName}: ${t.points}`)
          .join(" · ");
        return (
          <Marker
            key={`label-${n.id}-${standingsKey}`}
            position={[lat, lng]}
            icon={divIcon({
              className: "neighborhood-label-icon",
              html: `<div class="neighborhood-label-pill${
                selectedNeighborhoodId === n.id ? " is-selected" : ""
              }" style="border-color:${borderColor}">${label}</div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            })}
            interactive
            zIndexOffset={selectedNeighborhoodId === n.id ? 600 : 400}
            eventHandlers={{
              click: (e) => {
                e.originalEvent.stopPropagation();
                onSelectNeighborhood?.(n.id);
              },
            }}
          >
            {hoverOk && (
              <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>
                <div>
                  <strong>
                    {n.claimedBy
                      ? `${n.claimedBy.teamEmoji} ${n.name}`
                      : n.contested
                        ? `~ ${n.name}`
                        : n.name}
                  </strong>
                  {!n.claimedBy && (
                    <>
                      <br />
                      {n.contested ? "Contested" : "Unclaimed"}
                    </>
                  )}
                  {totalsLine ? (
                    <>
                      <br />
                      {totalsLine}
                    </>
                  ) : null}
                </div>
              </Tooltip>
            )}
          </Marker>
        );
      })}
    </>
  );
}

export default function LeafletMap({
  locations,
  challenges,
  team,
  teams: initialTeams = [],
  territoryEnabled = false,
  isAdmin = false,
  initialNeighborhoods = [],
  initialBank = null,
  selectedChallengeId = null,
  selectedNeighborhoodId = null,
  zoomChallengeId = null,
  zoomNeighborhoodId = null,
  onDeepLinkZoomConsumed,
  onSelectChallenge,
  onSelectNeighborhood,
}: {
  locations: Array<LatestTeamLocation>;
  challenges: Array<ChallengeWithSubmissions>;
  team: { id: string; name?: string; emoji?: string; color?: string } | null;
  /** All teams for per-team pin toggles (alphabetical; includes admin/HQ). */
  teams?: MapFilterTeam[];
  /** Global HuntSettings.territoryEnabled — players only see territory when true. */
  territoryEnabled?: boolean;
  isAdmin?: boolean;
  initialNeighborhoods?: TerritoryNeighborhood[];
  initialBank?: Bank | null;
  selectedChallengeId?: string | null;
  selectedNeighborhoodId?: string | null;
  /** Deep-link ids that should zoom once on first selection. */
  zoomChallengeId?: string | null;
  zoomNeighborhoodId?: string | null;
  onDeepLinkZoomConsumed?: (kind: "challenge" | "neighborhood") => void;
  onSelectChallenge?: (id: string | null) => void;
  onSelectNeighborhood?: (id: string | null) => void;
}) {
  const toast = useToast();
  const {
    state: locationPermission,
    openHelp: openLocationHelp,
  } = useLocationPermissionUI();
  const [liveChallenges, setLiveChallenges] = useState(challenges);
  const [liveLocations, setLiveLocations] = useState(locations);
  const [mapTeams, setMapTeams] = useState(initialTeams);
  const [showChallenges, setShowChallenges] = useState(true);
  const [showPlayers, setShowPlayers] = useState(true);
  /** Team ids whose pins are hidden (default: none hidden). */
  const [hiddenTeamIds, setHiddenTeamIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showNeighborhoods, setShowNeighborhoods] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(true);
  const [hideFullChallenges, setHideFullChallenges] = useState(true);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
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
  const [hoverCapable, setHoverCapable] = useState(false);
  const hoverCapableRef = useRef(false);
  const myFixRef = useRef<GeoFix | null>(null);
  /** Only one neighborhood highlight at a time (fast mouse moves skip mouseout). */
  const highlightedLayerRef = useRef<{
    layer: Path;
    style: PathOptions;
  } | null>(null);

  useEffect(() => {
    const ok = canHover();
    setHoverCapable(ok);
    hoverCapableRef.current = ok;
  }, []);

  useEffect(() => {
    setLiveChallenges(challenges);
  }, [challenges]);
  useEffect(() => {
    setLiveLocations(locations);
  }, [locations]);
  useEffect(() => {
    setMapTeams(initialTeams);
  }, [initialTeams]);

  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  // Poll map state so teammate favorites, challenge capacity, and territory stay live.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/map-live");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.challenges)) setLiveChallenges(data.challenges);
        if (Array.isArray(data.locations)) setLiveLocations(data.locations);
        if (Array.isArray(data.teams)) setMapTeams(data.teams);
        if (Array.isArray(data.neighborhoods)) {
          setNeighborhoods(data.neighborhoods);
        }
        if (data.bank) setBank(data.bank);
      } catch {
        /* ignore poll errors */
      }
    };
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const toggleTeamVisible = useCallback((teamId: string) => {
    setHiddenTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }, []);

  const visibleTeamLocations = useMemo(
    () =>
      liveLocations.filter((l) => showPlayers && !hiddenTeamIds.has(l.id)),
    [liveLocations, showPlayers, hiddenTeamIds],
  );

  const applyFix = useCallback((fix: GeoFix) => {
    myFixRef.current = fix;
    setMyFix(fix);
  }, []);

  const refreshMyLocation = useCallback(async () => {
    if (!territoryOn || !team) return;
    if (locationPermission !== "granted") {
      openLocationHelp();
      return;
    }
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
  }, [
    territoryOn,
    team,
    toast,
    applyFix,
    locationPermission,
    openLocationHelp,
  ]);

  // Live GPS via watch only — avoid a parallel getCurrentPosition (that was
  // re-prompting / hanging on deposit). Refresh button still does a one-shot.
  // Gate on granted so we never prompt from the map watch.
  useEffect(() => {
    if (!territoryOn || !team) return;
    if (locationPermission !== "granted") return;
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
  }, [territoryOn, team, applyFix, locationPermission]);

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
      ? liveChallenges.filter(
          (c) =>
            !c.submissions.some((s) => s.teamId === team.id && s.accepted),
        )
      : liveChallenges;

  const capacityFiltered = hideFullChallenges
    ? completedFiltered.filter(
        (c) => c.submissions.filter((s) => s.accepted).length < c.numWinners,
      )
    : completedFiltered;

  const filteredChallenges = onlyFavorites
    ? capacityFiltered.filter((c) => c.favorited)
    : capacityFiltered;

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

  const styleFor = useCallback((n: TerritoryNeighborhood): PathOptions => {
    if (n.contested) {
      return {
        color: "#A0AEC0",
        weight: 1.25,
        dashArray: "6 4",
        fillColor: "#CBD5E0",
        fillOpacity: 0.18,
      };
    }
    if (n.claimedBy) {
      const c = n.claimedBy.teamColor || "#3182CE";
      return {
        color: c,
        weight: 1.25,
        fillColor: c,
        fillOpacity: 0.2,
      };
    }
    return {
      color: "#A0AEC0",
      weight: 1,
      fillColor: "#EDF2F7",
      fillOpacity: 0.12,
    };
  }, []);

  /** Hover + selected outline (desktop hover / mobile selection). */
  const highlightStyle = useMemo(
    (): PathOptions => ({
      fillColor: "#CBD5E0",
      fillOpacity: 0.5,
      color: "#2D3748",
      weight: 3.5,
      dashArray: undefined,
    }),
    [],
  );

  const handleDeposit = async () => {
    if (!team || !territoryOn) return;
    if (locationPermission !== "granted") {
      openLocationHelp();
      return;
    }
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
          icon={<LuLayers />}
          size="md"
          colorScheme="blackAlpha"
          bg="white"
          color="gray.700"
          boxShadow="lg"
          onClick={() => setLayersOpen((o) => !o)}
        />
        {layersOpen ? (
          <Box
            position="absolute"
            top="100%"
            right={0}
            mt={2}
            bg="white"
            p={4}
            borderRadius="md"
            boxShadow="lg"
            width="280px"
            maxW="calc(100vw - 2rem)"
            maxH="min(70dvh, calc(100dvh - 6rem))"
            overflowY="auto"
            overscrollBehavior="contain"
          >
            <VStack spacing={3} alignItems="stretch">
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
                <Box
                  borderTop={isAdmin ? "1px solid" : undefined}
                  borderColor="gray.200"
                  pt={isAdmin ? 3 : 0}
                >
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
                </Box>
              )}
              <Box
                borderTop={
                  isAdmin || territoryOn ? "1px solid" : undefined
                }
                borderColor="gray.200"
                pt={isAdmin || territoryOn ? 3 : 0}
              >
                <HStack
                  justifyContent="space-between"
                  mb={showChallenges && team ? 2 : 0}
                >
                  <Text fontSize="sm" fontWeight="medium">
                    Challenges
                  </Text>
                  <Switch
                    isChecked={showChallenges}
                    onChange={(e) => setShowChallenges(e.target.checked)}
                    colorScheme="blue"
                  />
                </HStack>
                {showChallenges && team && (
                  <VStack spacing={2} alignItems="stretch">
                    <HStack justifyContent="space-between">
                      <Text fontSize="xs" fontWeight="medium" color="gray.600">
                        Only favorites
                      </Text>
                      <Switch
                        size="sm"
                        isChecked={onlyFavorites}
                        onChange={(e) => setOnlyFavorites(e.target.checked)}
                        colorScheme="pink"
                      />
                    </HStack>
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
                    <HStack justifyContent="space-between">
                      <Text fontSize="xs" fontWeight="medium" color="gray.600">
                        Hide at capacity
                      </Text>
                      <Switch
                        size="sm"
                        isChecked={hideFullChallenges}
                        onChange={(e) =>
                          setHideFullChallenges(e.target.checked)
                        }
                        colorScheme="blue"
                      />
                    </HStack>
                  </VStack>
                )}
              </Box>
              {mapTeams.length > 0 && (
                <Box borderTop="1px solid" borderColor="gray.200" pt={3}>
                  <HStack
                    justifyContent="space-between"
                    mb={showPlayers ? 2 : 0}
                  >
                    <Text fontSize="sm" fontWeight="medium">
                      Teams
                    </Text>
                    <Switch
                      isChecked={showPlayers}
                      onChange={(e) => setShowPlayers(e.target.checked)}
                      colorScheme="blue"
                    />
                  </HStack>
                  {showPlayers && (
                    <VStack spacing={2} alignItems="stretch">
                      {mapTeams.map((t) => (
                        <HStack
                          key={t.id}
                          justifyContent="space-between"
                          gap={2}
                        >
                          <HStack spacing={1.5} minW={0} flex="1">
                            <Text fontSize="xs" noOfLines={1}>
                              {t.emoji} {t.name}
                            </Text>
                            {t.isAdminTeam && (
                              <Badge
                                colorScheme="purple"
                                fontSize="0.65em"
                                flexShrink={0}
                              >
                                admin
                              </Badge>
                            )}
                          </HStack>
                          <Switch
                            size="sm"
                            isChecked={!hiddenTeamIds.has(t.id)}
                            onChange={() => toggleTeamVisible(t.id)}
                            colorScheme="blue"
                            flexShrink={0}
                          />
                        </HStack>
                      ))}
                    </VStack>
                  )}
                </Box>
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
                : locationPermission === "denied" ? (
                    <>
                      Location is blocked, so you can&apos;t deposit —{" "}
                      <Box
                        as="button"
                        type="button"
                        textDecoration="underline"
                        onClick={openLocationHelp}
                      >
                        How to fix
                      </Box>
                    </>
                  ) : locationPermission === "unsupported" ? (
                    "This browser can't share your location, so you can't deposit."
                  ) : locationPermission !== "granted" ? (
                    <Box
                      as="button"
                      type="button"
                      textAlign="left"
                      onClick={openLocationHelp}
                    >
                      Turn on location to deposit points here.
                    </Box>
                  ) : !myFix ? (
                    "Finding your location…"
                  ) : (
                    "Move into a neighborhood to deposit"
                  )}
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
        <BasemapTileLayer basemap={DEFAULT_PLAYER_BASEMAP} />
        <FlyToSelection
          challenge={
            selectedChallengeId
              ? (liveChallenges.find((c) => c.id === selectedChallengeId) ??
                null)
              : null
          }
          neighborhood={
            selectedNeighborhoodId
              ? (neighborhoods.find((n) => n.id === selectedNeighborhoodId) ??
                null)
              : null
          }
          zoomChallengeId={zoomChallengeId}
          zoomNeighborhoodId={zoomNeighborhoodId}
          onDeepLinkZoomConsumed={onDeepLinkZoomConsumed}
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
            const isSelected = selectedNeighborhoodId === n.id;
            return (
              <GeoJSON
                key={`${n.id}-${standingsKey}-${isSelected ? "sel" : ""}`}
                data={feature as never}
                style={() => {
                  const base = styleFor(n);
                  if (!isSelected) return base;
                  return { ...base, ...highlightStyle };
                }}
                onEachFeature={(_feat, layer) => {
                  const baseStyle = styleFor(n);
                  const selectedStyle = { ...baseStyle, ...highlightStyle };
                  if (isSelected) {
                    if (typeof (layer as Path).bringToFront === "function") {
                      (layer as Path).bringToFront();
                    }
                  }
                  layer.on({
                    click: () => {
                      onSelectNeighborhood?.(n.id);
                    },
                    mouseover: (e) => {
                      // Desktop fine-pointer only; ignore touch / coarse pointers.
                      if (!hoverCapableRef.current) return;
                      const target = e.target as Path;
                      const prev = highlightedLayerRef.current;
                      if (prev && prev.layer !== target) {
                        prev.layer.setStyle(prev.style);
                      }
                      target.setStyle(highlightStyle);
                      if (typeof target.bringToFront === "function") {
                        target.bringToFront();
                      }
                      highlightedLayerRef.current = {
                        layer: target,
                        style: isSelected ? selectedStyle : baseStyle,
                      };
                    },
                    mouseout: (e) => {
                      if (!hoverCapableRef.current) return;
                      const target = e.target as Path;
                      target.setStyle(isSelected ? selectedStyle : baseStyle);
                      if (highlightedLayerRef.current?.layer === target) {
                        highlightedLayerRef.current = null;
                      }
                    },
                  });
                }}
              />
            );
          })}
        {territoryOn && showNeighborhoods && (
          <NeighborhoodLabelLayer
            neighborhoods={neighborhoods}
            standingsKey={standingsKey}
            selectedNeighborhoodId={selectedNeighborhoodId}
            onSelectNeighborhood={onSelectNeighborhood}
          />
        )}
        {showChallenges &&
          filteredChallenges.map((c) => {
            const accepted = c.submissions.filter((s) => s.accepted).length;
            const finishedByTeam = Boolean(
              team &&
                c.submissions.some((s) => s.teamId === team.id && s.accepted),
            );
            const kind = challengePinKind({
              numWinners: c.numWinners,
              acceptedCount: accepted,
              finishedByTeam,
            });
            const spotsLeft = Math.max(0, c.numWinners - accepted);
            const isSelected = selectedChallengeId === c.id;
            return (
              <Marker
                icon={makeChallengePinIcon({
                  kind,
                  favorited: Boolean(c.favorited),
                  selected: isSelected,
                })}
                key={`${c.id}:${kind}:${c.favorited ? 1 : 0}:${accepted}:${isSelected ? 1 : 0}`}
                position={[c.lat ?? SF_CENTER[0], c.lng ?? SF_CENTER[1]]}
                zIndexOffset={isSelected ? 1000 : 0}
                eventHandlers={{
                  click: () => {
                    onSelectChallenge?.(c.id);
                  },
                }}
              >
                {hoverCapable && (
                  <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                    <div>
                      <strong>
                        {c.emoji ? `${c.emoji} ${c.title}` : c.title}
                      </strong>
                      <br />
                      {c.lat == null || c.lng == null
                        ? "Location agnostic"
                        : null}
                      {c.lat == null || c.lng == null ? <br /> : null}
                      {accepted}/{c.numWinners} filled
                      {spotsLeft > 0 ? ` · ${spotsLeft} left` : " · full"}
                      {c.pts != null ? ` · ${c.pts} pts` : ""}
                    </div>
                  </Tooltip>
                )}
              </Marker>
            );
          })}
        {visibleTeamLocations.map((l) => (
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
