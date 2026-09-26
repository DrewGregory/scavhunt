import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Menu,
  MenuButton,
  MenuItemOption,
  MenuList,
  MenuOptionGroup,
  Select,
  Text,
  useToast,
  VStack,
} from "@chakra-ui/react";
import dynamic from "next/dynamic";
import {
  findNeighborhoodAt,
  type NeighborhoodWithBoundary,
} from "../lib/geo";
import { neighborhoodEmoji } from "../lib/neighborhoodEmoji";
import ChallengeDraftCard, {
  type DraftChallenge,
  type DraftNeighborhood,
} from "./ChallengeDraftCard";
import type { DraftMapNeighborhood } from "./ChallengeDraftMap";

const ChallengeDraftMap = dynamic(() => import("./ChallengeDraftMap"), {
  ssr: false,
});

type ApiChallenge = {
  id: string;
  title: string;
  prompt: string;
  lat: number | null;
  lng: number | null;
  pts: number;
  numWinners: number;
  enabled: boolean;
  createdAt: string;
};

type ApiNeighborhood = {
  id: string;
  name: string;
  emoji: string | null;
  boundary: unknown;
  onMap: boolean;
  centerLat: number | null;
  centerLng: number | null;
};

type SortKey = "title" | "pts" | "neighborhood" | "created";
type DropTarget = "enabled" | "disabled";

const DRAG_MIME = "application/x-scavhunt-challenge-id";
const UNPLACED_FILTER = "__unplaced__";

function hydrate(
  c: ApiChallenge,
  neighborhoods: NeighborhoodWithBoundary[],
): DraftChallenge {
  let neighborhood: DraftNeighborhood | null = null;
  if (
    c.lat != null &&
    c.lng != null &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng)
  ) {
    const hit = findNeighborhoodAt(c.lng, c.lat, neighborhoods);
    if (hit) {
      neighborhood = {
        id: hit.id,
        name: hit.name,
        emoji: neighborhoodEmoji(hit.name, (hit as ApiNeighborhood).emoji),
      };
    }
  }
  return {
    ...c,
    neighborhood,
  };
}

export default function ChallengeDraftBoard() {
  const toast = useToast();
  const [challenges, setChallenges] = useState<DraftChallenge[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<ApiNeighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("title");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DropTarget | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const focusTitleId = useRef<string | null>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const neighborhoodGeo = useMemo(
    () =>
      neighborhoods.map((n) => ({
        id: n.id,
        name: n.name,
        emoji: n.emoji,
        boundary: n.boundary,
        centerLat: n.centerLat,
        centerLng: n.centerLng,
      })) as (NeighborhoodWithBoundary & { emoji: string | null })[],
    [neighborhoods],
  );

  const mapNeighborhoods: DraftMapNeighborhood[] = useMemo(
    () =>
      neighborhoods.map((n) => ({
        id: n.id,
        name: n.name,
        emoji: n.emoji,
        boundary: n.boundary,
        onMap: n.onMap,
      })),
    [neighborhoods],
  );

  const load = useCallback(async () => {
    const [cRes, nRes] = await Promise.all([
      fetch("/api/admin/challenges"),
      fetch("/api/admin/neighborhoods"),
    ]);
    if (!cRes.ok || !nRes.ok) throw new Error("Failed to load");
    const cData = await cRes.json();
    const nData = await nRes.json();
    const ns = (nData.neighborhoods ?? []) as ApiNeighborhood[];
    setNeighborhoods(ns);
    const geo = ns.map((n) => ({
      id: n.id,
      name: n.name,
      emoji: n.emoji,
      boundary: n.boundary,
      centerLat: n.centerLat,
      centerLng: n.centerLng,
    })) as (NeighborhoodWithBoundary & { emoji: string | null })[];
    setChallenges(
      ((cData.challenges ?? []) as ApiChallenge[]).map((c) =>
        hydrate(c, geo),
      ),
    );
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch {
        toast({ title: "Failed to load challenge board", status: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [load, toast]);

  useEffect(() => {
    if (!focusTitleId.current) return;
    const id = focusTitleId.current;
    focusTitleId.current = null;
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-challenge-id="${id}"] input`,
      ) as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }, [challenges]);

  const patchChallenge = async (
    id: string,
    patch: Record<string, unknown>,
    optimistic: Partial<DraftChallenge>,
  ) => {
    const prev = challenges;
    setChallenges((list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...optimistic };
        return hydrate(
          {
            id: next.id,
            title: next.title,
            prompt: next.prompt,
            lat: next.lat,
            lng: next.lng,
            pts: next.pts,
            numWinners: next.numWinners,
            enabled: next.enabled,
            createdAt: next.createdAt,
          },
          neighborhoodGeo,
        );
      }),
    );
    try {
      const res = await fetch("/api/admin/update-challenge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChallenges(prev);
        toast({ title: data.error || "Update failed", status: "error" });
        return false;
      }
      if (data.challenge) {
        setChallenges((list) =>
          list.map((c) =>
            c.id === id
              ? hydrate(
                  {
                    ...data.challenge,
                    createdAt: c.createdAt,
                  },
                  neighborhoodGeo,
                )
              : c,
          ),
        );
      }
      return true;
    } catch {
      setChallenges(prev);
      toast({ title: "Update failed", status: "error" });
      return false;
    }
  };

  const schedulePatch = (
    id: string,
    patch: Record<string, unknown>,
    optimistic: Partial<DraftChallenge>,
  ) => {
    setChallenges((list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...optimistic };
        return hydrate(
          {
            id: next.id,
            title: next.title,
            prompt: next.prompt,
            lat: next.lat,
            lng: next.lng,
            pts: next.pts,
            numWinners: next.numWinners,
            enabled: next.enabled,
            createdAt: next.createdAt,
          },
          neighborhoodGeo,
        );
      }),
    );
    const existing = saveTimers.current.get(id);
    if (existing) clearTimeout(existing);
    saveTimers.current.set(
      id,
      setTimeout(() => {
        void (async () => {
          try {
            const res = await fetch("/api/admin/update-challenge", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, ...patch }),
            });
            if (!res.ok) {
              const data = await res.json();
              toast({ title: data.error || "Save failed", status: "error" });
              await load();
            }
          } catch {
            toast({ title: "Save failed", status: "error" });
            await load();
          }
        })();
      }, 400),
    );
  };

  const createChallenge = async (opts?: {
    lat?: number | null;
    lng?: number | null;
  }) => {
    const base = "Untitled";
    let title = base;
    let n = 1;
    const titles = new Set(challenges.map((c) => c.title));
    while (titles.has(title)) {
      n += 1;
      title = `${base} ${n}`;
    }
    try {
      const res = await fetch("/api/admin/update-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          prompt: " ",
          pts: 10,
          numWinners: 1,
          enabled: false,
          lat: opts?.lat ?? null,
          lng: opts?.lng ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Create failed", status: "error" });
        return;
      }
      const created = hydrate(
        {
          ...data.challenge,
          createdAt: new Date().toISOString(),
        },
        neighborhoodGeo,
      );
      focusTitleId.current = created.id;
      setChallenges((list) => [created, ...list]);
      setSelectedId(created.id);
    } catch {
      toast({ title: "Create failed", status: "error" });
    }
  };

  const setEnabled = async (id: string, enabled: boolean) => {
    await patchChallenge(id, { enabled }, { enabled });
  };

  const archive = async (id: string) => {
    if (!confirm("Archive this challenge? (soft-delete)")) return;
    const prev = challenges;
    setChallenges((list) => list.filter((c) => c.id !== id));
    try {
      const res = await fetch("/api/admin/delete-challenge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: id }),
      });
      if (!res.ok) {
        setChallenges(prev);
        toast({ title: "Archive failed", status: "error" });
      }
    } catch {
      setChallenges(prev);
      toast({ title: "Archive failed", status: "error" });
    }
  };

  const onCardDragStart = (id: string) => (e: DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const makeDropHandlers = (target: DropTarget) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(target);
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget === e.target) setDragOver(null);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const id =
        e.dataTransfer.getData(DRAG_MIME) ||
        e.dataTransfer.getData("text/plain");
      if (!id) return;
      void setEnabled(id, target === "enabled");
    },
  });

  const filteredSorted = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = challenges.filter((c) => {
      if (q) {
        const hay = `${c.title} ${c.prompt}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (neighborhoodFilter.length > 0) {
        const nid = c.neighborhood?.id ?? UNPLACED_FILTER;
        if (!neighborhoodFilter.includes(nid)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
        case "pts":
          return b.pts - a.pts;
        case "neighborhood": {
          const an = a.neighborhood?.name ?? "zzz";
          const bn = b.neighborhood?.name ?? "zzz";
          return an.localeCompare(bn) || a.title.localeCompare(b.title);
        }
        case "created":
          return b.createdAt.localeCompare(a.createdAt);
        case "title":
        default:
          return a.title.localeCompare(b.title);
      }
    });
    return list;
  }, [challenges, filter, neighborhoodFilter, sort]);

  const enabledList = filteredSorted.filter((c) => c.enabled);
  const disabledList = filteredSorted.filter((c) => !c.enabled);

  const neighborhoodOptions = useMemo(() => {
    const opts = neighborhoods
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => ({
        id: n.id,
        label: `${neighborhoodEmoji(n.name, n.emoji)} ${n.name}`,
      }));
    return [{ id: UNPLACED_FILTER, label: "Unplaced" }, ...opts];
  }, [neighborhoods]);

  if (loading) {
    return <Text color="gray.500">Loading draft board…</Text>;
  }

  const renderColumn = (
    title: string,
    items: DraftChallenge[],
    target: DropTarget,
    showAdd?: boolean,
  ) => (
    <Box
      borderWidth="1px"
      borderRadius="md"
      bg="gray.50"
      display="flex"
      flexDirection="column"
      minH={0}
      outline={dragOver === target ? "2px solid" : undefined}
      outlineColor={dragOver === target ? "purple.400" : undefined}
      {...makeDropHandlers(target)}
    >
      <HStack
        px={3}
        py={2}
        borderBottomWidth="1px"
        bg="white"
        borderTopRadius="md"
        justify="space-between"
        flexShrink={0}
      >
        <Heading size="sm">
          {title}{" "}
          <Text as="span" color="gray.500" fontWeight="normal">
            ({items.length})
          </Text>
        </Heading>
        {showAdd && (
          <Button
            size="xs"
            colorScheme="green"
            onClick={() => void createChallenge()}
          >
            +
          </Button>
        )}
      </HStack>
      <VStack
        align="stretch"
        spacing={2}
        p={2}
        overflowY="auto"
        flex={1}
        minH={0}
      >
        {items.length === 0 && (
          <Text fontSize="sm" color="gray.500" px={1}>
            Drop challenges here
          </Text>
        )}
        {items.map((c) => (
          <ChallengeDraftCard
            key={c.id}
            challenge={c}
            selected={selectedId === c.id || placingId === c.id}
            onSelect={() => {
              setSelectedId(c.id);
              setPlacingId(null);
            }}
            onDragStart={onCardDragStart(c.id)}
            onChange={(patch) => {
              const body: Record<string, unknown> = {};
              if (patch.title !== undefined) body.title = patch.title;
              if (patch.prompt !== undefined) body.prompt = patch.prompt;
              if (patch.pts !== undefined) body.pts = patch.pts;
              if (patch.numWinners !== undefined) {
                body.numWinners = patch.numWinners;
              }
              schedulePatch(c.id, body, patch);
            }}
            onPlaceOnMap={() => {
              setSelectedId(c.id);
              setPlacingId(c.id);
              toast({
                title: "Click the map to place this challenge",
                status: "info",
                duration: 2500,
              });
            }}
            onClearLocation={() => {
              void patchChallenge(
                c.id,
                { lat: null, lng: null },
                { lat: null, lng: null, neighborhood: null },
              );
            }}
            onArchive={() => void archive(c.id)}
          />
        ))}
      </VStack>
    </Box>
  );

  return (
    <VStack align="stretch" spacing={3} height={{ base: "auto", lg: "calc(100dvh - 160px)" }} minH="480px">
      <HStack flexWrap="wrap" gap={2} align="flex-end">
        <Box flex="1" minW="160px">
          <Text fontSize="xs" color="gray.500" mb={1}>
            Search
          </Text>
          <Input
            size="sm"
            placeholder="Title or prompt…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </Box>
        <Box>
          <Text fontSize="xs" color="gray.500" mb={1}>
            Sort
          </Text>
          <Select
            size="sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            w="160px"
          >
            <option value="title">Title</option>
            <option value="pts">Points</option>
            <option value="neighborhood">Neighborhood</option>
            <option value="created">Created</option>
          </Select>
        </Box>
        <Box>
          <Text fontSize="xs" color="gray.500" mb={1}>
            Neighborhoods
          </Text>
          <Menu closeOnSelect={false}>
            <MenuButton as={Button} size="sm" variant="outline">
              {neighborhoodFilter.length === 0
                ? "All neighborhoods"
                : `${neighborhoodFilter.length} selected`}
            </MenuButton>
            <MenuList maxH="280px" overflowY="auto" minW="220px">
              <MenuOptionGroup
                type="checkbox"
                value={neighborhoodFilter}
                onChange={(v) =>
                  setNeighborhoodFilter(typeof v === "string" ? [v] : [...v])
                }
              >
                {neighborhoodOptions.map((o) => (
                  <MenuItemOption key={o.id} value={o.id}>
                    {o.label}
                  </MenuItemOption>
                ))}
              </MenuOptionGroup>
            </MenuList>
          </Menu>
        </Box>
        {neighborhoodFilter.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setNeighborhoodFilter([])}
          >
            Clear filters
          </Button>
        )}
      </HStack>

      <Box
        display="grid"
        gridTemplateColumns={{
          base: "1fr",
          lg: "minmax(220px,260px) minmax(220px,260px) 1fr",
        }}
        gap={3}
        flex={1}
        minH={0}
      >
        {renderColumn("Enabled", enabledList, "enabled")}
        {renderColumn("Disabled", disabledList, "disabled", true)}
        <Box minH={{ base: "360px", lg: 0 }} minW={0}>
          <ChallengeDraftMap
            challenges={filteredSorted}
            neighborhoods={mapNeighborhoods}
            selectedId={placingId ?? selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setPlacingId(null);
              document
                .querySelector(`[data-challenge-id="${id}"]`)
                ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }}
            onMapClickPlace={(lat, lng) => {
              const id = placingId ?? selectedId;
              if (!id) return;
              void patchChallenge(id, { lat, lng }, { lat, lng });
              setPlacingId(null);
            }}
            onContextCreate={(lat, lng) => {
              void createChallenge({ lat, lng });
            }}
            height="100%"
          />
        </Box>
      </Box>
    </VStack>
  );
}
