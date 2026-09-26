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

const PANEL_WIDTHS_KEY = "scavhunt.draftBoard.panelWidths";
const DEFAULT_PANEL_WIDTHS = [26, 22, 52]; // % disabled / enabled / map
const MIN_PANEL_PCT = 12;

function loadPanelWidths(): number[] {
  if (typeof window === "undefined") return DEFAULT_PANEL_WIDTHS;
  try {
    const raw = localStorage.getItem(PANEL_WIDTHS_KEY);
    if (!raw) return DEFAULT_PANEL_WIDTHS;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 3 ||
      !parsed.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return DEFAULT_PANEL_WIDTHS;
    }
    const sum = (parsed as number[]).reduce((a, b) => a + b, 0);
    if (sum <= 0) return DEFAULT_PANEL_WIDTHS;
    return (parsed as number[]).map((n) => (n / sum) * 100);
  } catch {
    return DEFAULT_PANEL_WIDTHS;
  }
}

function PanelResizeHandle({
  onDrag,
}: {
  onDrag: (deltaPx: number, containerWidth: number) => void;
}) {
  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panels"
      flexShrink={0}
      w="10px"
      mx="-2px"
      cursor="col-resize"
      display={{ base: "none", lg: "flex" }}
      alignItems="center"
      justifyContent="center"
      zIndex={2}
      userSelect="none"
      onMouseDown={(e) => {
        e.preventDefault();
        const container = e.currentTarget.parentElement as HTMLElement | null;
        const containerWidth = container?.getBoundingClientRect().width ?? 1;
        let lastX = e.clientX;
        const onMove = (ev: MouseEvent) => {
          const delta = ev.clientX - lastX;
          lastX = ev.clientX;
          onDrag(delta, containerWidth);
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
      _hover={{ bg: "purple.100" }}
      sx={{
        "&::after": {
          content: '""',
          display: "block",
          w: "3px",
          h: "36px",
          borderRadius: "full",
          bg: "gray.300",
        },
        "&:hover::after": { bg: "purple.400" },
      }}
    />
  );
}

type ApiChallenge = {
  id: string;
  title: string;
  prompt: string;
  emoji: string | null;
  lat: number | null;
  lng: number | null;
  pts: number;
  numWinners: number;
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
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
    emoji: c.emoji ?? null,
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panToken, setPanToken] = useState(0);
  const [dragOver, setDragOver] = useState<DropTarget | null>(null);
  const [panelWidths, setPanelWidths] = useState<number[] | null>(null);
  const focusTitleId = useRef<string | null>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const widths = panelWidths ?? DEFAULT_PANEL_WIDTHS;

  useEffect(() => {
    setPanelWidths(loadPanelWidths());
  }, []);

  useEffect(() => {
    if (panelWidths == null) return;
    try {
      localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify(panelWidths));
    } catch {
      /* ignore */
    }
  }, [panelWidths]);

  const resizePanels = useCallback((index: number, deltaPx: number, containerWidth: number) => {
    if (containerWidth <= 0) return;
    const deltaPct = (deltaPx / containerWidth) * 100;
    setPanelWidths((prev) => {
      const base = prev ?? DEFAULT_PANEL_WIDTHS;
      const next = [...base];
      const left = next[index]! + deltaPct;
      const right = next[index + 1]! - deltaPct;
      if (left < MIN_PANEL_PCT || right < MIN_PANEL_PCT) return prev;
      next[index] = left;
      next[index + 1] = right;
      return next;
    });
  }, []);

  /** Resize between (disabled+enabled) group and the map. */
  const resizeListGroupVsMap = useCallback(
    (deltaPx: number, containerWidth: number) => {
      if (containerWidth <= 0) return;
      const deltaPct = (deltaPx / containerWidth) * 100;
      setPanelWidths((prev) => {
        const base = prev ?? DEFAULT_PANEL_WIDTHS;
        const [a, b, c] = base;
        const leftSum = a + b;
        const newLeft = leftSum + deltaPct;
        const newRight = c - deltaPct;
        if (newLeft < MIN_PANEL_PCT * 2 || newRight < MIN_PANEL_PCT) {
          return prev;
        }
        const scale = leftSum > 0 ? newLeft / leftSum : 1;
        return [a * scale, b * scale, newRight];
      });
    },
    [],
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
        centerLat: n.centerLat,
        centerLng: n.centerLng,
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

  // Live updates: poll while the tab is focused. Pending local edits win.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const [cRes, nRes] = await Promise.all([
          fetch("/api/admin/challenges"),
          fetch("/api/admin/neighborhoods"),
        ]);
        if (!cRes.ok || !nRes.ok || cancelled) return;
        const cData = await cRes.json();
        const nData = await nRes.json();
        const ns = (nData.neighborhoods ?? []) as ApiNeighborhood[];
        const geo = ns.map((n) => ({
          id: n.id,
          name: n.name,
          emoji: n.emoji,
          boundary: n.boundary,
          centerLat: n.centerLat,
          centerLng: n.centerLng,
        })) as (NeighborhoodWithBoundary & { emoji: string | null })[];
        const remote = ((cData.challenges ?? []) as ApiChallenge[]).map((c) =>
          hydrate(
            {
              ...c,
              emoji: c.emoji ?? null,
            },
            geo,
          ),
        );
        if (cancelled) return;
        setNeighborhoods(ns);
        setChallenges((prev) => {
          const pending = new Set(saveTimers.current.keys());
          if (editingId) pending.add(editingId);
          const prevById = new Map(prev.map((p) => [p.id, p]));
          const remoteIds = new Set(remote.map((r) => r.id));
          const merged = remote.map((r) =>
            pending.has(r.id) ? (prevById.get(r.id) ?? r) : r,
          );
          for (const p of prev) {
            if (pending.has(p.id) && !remoteIds.has(p.id)) merged.push(p);
          }
          return merged;
        });
      } catch {
        /* ignore poll errors */
      }
    };
    const id = window.setInterval(() => void tick(), 2000);
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loading, editingId]);

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
            emoji: next.emoji ?? null,
            lat: next.lat,
            lng: next.lng,
            pts: next.pts,
            numWinners: next.numWinners,
            enabled: next.enabled,
            createdAt: next.createdAt,
            updatedAt: next.updatedAt,
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
            emoji: next.emoji ?? null,
            lat: next.lat,
            lng: next.lng,
            pts: next.pts,
            numWinners: next.numWinners,
            enabled: next.enabled,
            createdAt: next.createdAt,
            updatedAt: next.updatedAt,
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
      setEditingId(created.id);
      setPanToken((t) => t + 1);
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
    return [
      { id: UNPLACED_FILTER, label: "No location" },
      ...opts,
    ];
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
      height="100%"
      flex={1}
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
            selected={selectedId === c.id}
            editing={editingId === c.id}
            onSelect={() => {
              if (selectedId === c.id) {
                setSelectedId(null);
                return;
              }
              setSelectedId(c.id);
              setPanToken((t) => t + 1);
            }}
            onStartEdit={() => {
              setSelectedId(c.id);
              setEditingId(c.id);
              setPanToken((t) => t + 1);
            }}
            onStopEdit={() => setEditingId(null)}
            onDragStart={onCardDragStart(c.id)}
            onChange={(patch) => {
              const body: Record<string, unknown> = {};
              if (patch.title !== undefined) body.title = patch.title;
              if (patch.prompt !== undefined) body.prompt = patch.prompt;
              if (patch.emoji !== undefined) body.emoji = patch.emoji;
              if (patch.pts !== undefined) body.pts = patch.pts;
              if (patch.numWinners !== undefined) {
                body.numWinners = patch.numWinners;
              }
              schedulePatch(c.id, body, patch);
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
      <Box
        display="flex"
        flexDirection={{ base: "column", lg: "row" }}
        gap={{ base: 3, lg: 0 }}
        flex={1}
        minH={0}
      >
        {/* List columns + their toolbar (not over the map) */}
        <VStack
          align="stretch"
          spacing={2}
          flex={{ base: "none", lg: `${widths[0]! + widths[1]!} 1 0` }}
          w={{ base: "100%", lg: undefined }}
          minW={{ lg: 0 }}
          minH={{ base: "420px", lg: 0 }}
          overflow="hidden"
        >
          <HStack flexWrap="wrap" gap={2} align="flex-end" flexShrink={0}>
            <Box flex="1" minW="120px">
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
                w="140px"
              >
                <option value="title">Title</option>
                <option value="pts">Points</option>
                <option value="neighborhood">Neighborhood</option>
                <option value="created">Created</option>
              </Select>
            </Box>
            <Box>
              <Text fontSize="xs" color="gray.500" mb={1}>
                Filter
              </Text>
              <Menu closeOnSelect={false}>
                <MenuButton
                  as={Button}
                  size="sm"
                  variant="outline"
                  fontWeight="medium"
                  minW="120px"
                >
                  {neighborhoodFilter.length === 0
                    ? "All neighborhoods"
                    : `${neighborhoodFilter.length} selected`}
                </MenuButton>
                <MenuList maxH="280px" overflowY="auto" minW="240px" zIndex={20}>
                  <Box px={3} pt={2} pb={1}>
                    <Text fontSize="xs" color="gray.500">
                      Neighborhoods — multi-select
                    </Text>
                  </Box>
                  <MenuOptionGroup
                    type="checkbox"
                    value={neighborhoodFilter}
                    onChange={(v) =>
                      setNeighborhoodFilter(
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
                        onClick={() => setNeighborhoodFilter([])}
                      >
                        Clear filter
                      </Button>
                    </Box>
                  )}
                </MenuList>
              </Menu>
            </Box>
          </HStack>

          <Box
            display="flex"
            flexDirection={{ base: "column", lg: "row" }}
            gap={{ base: 3, lg: 0 }}
            flex={1}
            minH={0}
            overflow="hidden"
          >
            <Box
              flex={{ base: "none", lg: `${widths[0]} 1 0` }}
              w={{ base: "100%", lg: undefined }}
              minW={{ lg: 0 }}
              minH={{ base: "240px", lg: 0 }}
              display="flex"
              flexDirection="column"
              overflow="hidden"
            >
              {renderColumn("Disabled", disabledList, "disabled", true)}
            </Box>
            <PanelResizeHandle onDrag={(d, w) => resizePanels(0, d, w)} />
            <Box
              flex={{ base: "none", lg: `${widths[1]} 1 0` }}
              w={{ base: "100%", lg: undefined }}
              minW={{ lg: 0 }}
              minH={{ base: "240px", lg: 0 }}
              display="flex"
              flexDirection="column"
              overflow="hidden"
            >
              {renderColumn("Enabled", enabledList, "enabled")}
            </Box>
          </Box>
        </VStack>

        <PanelResizeHandle onDrag={(d, w) => resizeListGroupVsMap(d, w)} />

        <Box
          flex={{ base: "none", lg: `${widths[2]} 1 0` }}
          w={{ base: "100%", lg: undefined }}
          minW={{ lg: 0 }}
          minH={{ base: "360px", lg: 0 }}
          display="flex"
          flexDirection="column"
          overflow="hidden"
        >
          <ChallengeDraftMap
            challenges={filteredSorted}
            neighborhoods={mapNeighborhoods}
            selectedId={selectedId}
            editingId={editingId}
            panToken={panToken}
            onSelect={(id) => {
              setSelectedId(id);
              setPanToken((t) => t + 1);
              document
                .querySelector(`[data-challenge-id="${id}"]`)
                ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }}
            onDeselect={() => setSelectedId(null)}
            onMapClickPlace={(lat, lng) => {
              const id = selectedId;
              if (!id) return;
              void patchChallenge(id, { lat, lng }, { lat, lng });
            }}
            onMarkerMove={(id, lat, lng) => {
              void patchChallenge(id, { lat, lng }, { lat, lng });
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
