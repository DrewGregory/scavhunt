import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import { LatLngExpression, PathOptions, divIcon, type Path } from "leaflet";
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
import { FiHeart, FiLayers } from "react-icons/fi";
import { AiFillHeart } from "react-icons/ai";
import { getPosition, type GeoFix } from "./useSession";
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

function FlyToChallenge({
  challenge,
}: {
  challenge: ChallengeWithSubmissions | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!challenge) return;
    const lat = challenge.lat ?? SF_CENTER[0];
    const lng = challenge.lng ?? SF_CENTER[1];
    map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
  }, [map, challenge?.id, challenge?.lat, challenge?.lng]);
  return null;
}

export default function LeafletMap({
  locations,
  challenges,
  team,
  territoryEnabled = false,
  isAdmin = false,
  initialNeighborhoods = [],
  initialBank = null,
  selectedChallengeId = null,
  onSelectChallenge,
}: {
  locations: Array<LatestTeamLocation>;
  challenges: Array<ChallengeWithSubmissions>;
  team: { id: string; name?: string; emoji?: string; color?: string } | null;
  /** Global HuntSettings.territoryEnabled — players only see territory when true. */
  territoryEnabled?: boolean;
  isAdmin?: boolean;
  initialNeighborhoods?: TerritoryNeighborhood[];
  initialBank?: Bank | null;
  selectedChallengeId?: string | null;
  onSelectChallenge?: (id: string | null) => void;
}) {
  const toast = useToast();
  const [liveChallenges, setLiveChallenges] = useState(challenges);
  const [liveLocations, setLiveLocations] = useState(locations);
  const [showChallenges, setShowChallenges] = useState(true);
  const [showPlayers, setShowPlayers] = useState(true);
  const [showNeighborhoods, setShowNeighborhoods] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(true);
  const [hideFullChallenges, setHideFullChallenges] = useState(true);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favBusyId, setFavBusyId] = useState<string | null>(null);
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
    setLiveChallenges(challenges);
  }, [challenges]);
  useEffect(() => {
    setLiveLocations(locations);
  }, [locations]);

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

  const toggleFavorite = async (challengeId: string) => {
    if (!team) {
      toast({ title: "Join a team to favorite challenges", status: "warning" });
      return;
    }
    setFavBusyId(challengeId);
    const prev = liveChallenges.find((c) => c.id === challengeId)?.favorited;
    setLiveChallenges((list) =>
      list.map((c) =>
        c.id === challengeId ? { ...c, favorited: !c.favorited } : c,
      ),
    );
    try {
      const res = await fetch("/api/toggle-challenge-favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLiveChallenges((list) =>
          list.map((c) =>
            c.id === challengeId ? { ...c, favorited: Boolean(prev) } : c,
          ),
        );
        toast({ title: data.error || "Favorite failed", status: "error" });
        return;
      }
      setLiveChallenges((list) =>
        list.map((c) =>
          c.id === challengeId ? { ...c, favorited: Boolean(data.favorited) } : c,
        ),
      );
    } catch {
      setLiveChallenges((list) =>
        list.map((c) =>
          c.id === challengeId ? { ...c, favorited: Boolean(prev) } : c,
        ),
      );
      toast({ title: "Favorite failed", status: "error" });
    } finally {
      setFavBusyId(null);
    }
  };

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
          color: isHere ? "#4A5568" : "#A0AEC0",
          weight: isHere ? 3 : 1.25,
          dashArray: "6 4",
          fillColor: "#CBD5E0",
          fillOpacity: isHere ? 0.4 : 0.18,
        };
      }
      if (n.claimedBy) {
        const c = n.claimedBy.teamColor || "#3182CE";
        return {
          color: c,
          weight: isHere ? 3.5 : 1.25,
          fillColor: c,
          fillOpacity: isHere ? 0.42 : 0.2,
        };
      }
      return {
        color: isHere ? "#2B6CB0" : "#A0AEC0",
        weight: isHere ? 3 : 1,
        fillColor: isHere ? "#90CDF4" : "#EDF2F7",
        fillOpacity: isHere ? 0.4 : 0.12,
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
                        Only favorites
                      </Text>
                      <Switch
                        size="sm"
                        isChecked={onlyFavorites}
                        onChange={(e) => setOnlyFavorites(e.target.checked)}
                        colorScheme="pink"
                      />
                    </HStack>
                  </Box>
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
        <BasemapTileLayer basemap={DEFAULT_PLAYER_BASEMAP} />
        <FlyToChallenge
          challenge={
            selectedChallengeId
              ? (liveChallenges.find((c) => c.id === selectedChallengeId) ??
                null)
              : null
          }
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
                    click: (e) => {
                      const target = e.target as Path & {
                        getBounds: () => import("leaflet").LatLngBounds;
                      };
                      const map = (e.target as { _map?: import("leaflet").Map })
                        ._map;
                      if (map && typeof target.getBounds === "function") {
                        const bounds = target.getBounds();
                        if (bounds.isValid()) {
                          map.fitBounds(bounds, {
                            padding: [40, 40],
                            maxZoom: 15,
                            animate: true,
                          });
                        }
                      }
                    },
                    mouseover: (e) => {
                      const target = e.target as Path;
                      const prev = highlightedLayerRef.current;
                      if (prev && prev.layer !== target) {
                        prev.layer.setStyle(prev.style);
                      }
                      const hoverColor = n.claimedBy?.teamColor || "#3182CE";
                      target.setStyle({
                        fillColor: hoverColor,
                        fillOpacity: 0.5,
                        color: hoverColor,
                        weight: 3.5,
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
                <Popup>
                  <VStack align="stretch" spacing={2} minW="160px">
                    <Text
                      fontWeight="semibold"
                      cursor="pointer"
                      onClick={() => onSelectChallenge?.(c.id)}
                    >
                      {c.emoji ? `${c.emoji} ${c.title}` : c.title}
                    </Text>
                    <Text fontSize="xs" color="gray.600">
                      {accepted}/{c.numWinners} filled
                      {spotsLeft > 0 ? ` · ${spotsLeft} left` : " · full"}
                      {c.pts != null ? ` · ${c.pts} pts` : ""}
                    </Text>
                    {team && (
                      <Button
                        size="xs"
                        leftIcon={
                          c.favorited ? <AiFillHeart /> : <FiHeart />
                        }
                        colorScheme={c.favorited ? "pink" : "gray"}
                        variant={c.favorited ? "solid" : "outline"}
                        isLoading={favBusyId === c.id}
                        onClick={() => void toggleFavorite(c.id)}
                      >
                        {c.favorited
                          ? "Unfavorite for team"
                          : "Favorite for team"}
                      </Button>
                    )}
                    <Button
                      size="xs"
                      colorScheme="blue"
                      onClick={() => onSelectChallenge?.(c.id)}
                    >
                      View details
                    </Button>
                  </VStack>
                </Popup>
              </Marker>
            );
          })}
        {showPlayers &&
          liveLocations.map((l) => (
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
