import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Switch,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import AdminDataTable, { type AdminColumn } from "./AdminDataTable";

type AdminNeighborhood = {
  id: string;
  name: string;
  emoji: string | null;
  displayEmoji: string;
  onMap: boolean;
  hasBoundary: boolean;
  boundary: unknown;
  centerLat: number | null;
  centerLng: number | null;
};

type DepositRow = {
  id: string;
  points: number;
  lat: number;
  lng: number;
  accuracy: number | null;
  deletedAt: string | null;
  createdAt: string;
  team: { id: string; name: string; emoji: string; color: string };
  neighborhood: { id: string; name: string; emoji: string | null };
  user: { id: string; name: string; email: string };
};

const BoundaryEditor = dynamic(() => import("./AdminBoundaryEditor"), {
  ssr: false,
  loading: () => (
    <Text fontSize="sm" color="gray.500">
      Loading map editor…
    </Text>
  ),
});

export default function AdminMapPanel({
  neighborhoods,
  onReload,
}: {
  neighborhoods: AdminNeighborhood[];
  onReload: () => Promise<void>;
}) {
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState<"curated" | "datasf" | null>(null);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = neighborhoods.find((n) => n.id === selectedId) ?? null;

  const loadDeposits = useCallback(async () => {
    const res = await fetch("/api/admin/deposits?includeDeleted=1");
    if (!res.ok) return;
    const data = await res.json();
    setDeposits(data.deposits ?? []);
  }, []);

  useEffect(() => {
    void loadDeposits();
  }, [loadDeposits]);

  // Keep selection valid if the list reloads; don't auto-pick so the overview stays browseable
  useEffect(() => {
    if (selectedId && !neighborhoods.some((n) => n.id === selectedId)) {
      setSelectedId(null);
    }
  }, [neighborhoods, selectedId]);

  const handleImport = async (source: "curated" | "datasf") => {
    setImporting(source);
    try {
      const res = await fetch("/api/admin/import-boundaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Import failed", status: "error" });
        return;
      }
      toast({
        title:
          source === "datasf"
            ? `Loaded DataSF map (${data.zoneCount} zones)`
            : `Loaded gap-free map (${data.zoneCount} zones)`,
        description:
          source === "datasf"
            ? "Raw DataSF breakup — shared-border editing is off until you re-import the curated map."
            : undefined,
        status: "success",
        duration: source === "datasf" ? 6000 : 4000,
      });
      await onReload();
    } catch {
      toast({ title: "Import failed", status: "error" });
    } finally {
      setImporting(null);
    }
  };

  const patchNeighborhood = async (
    id: string,
    patch: Record<string, unknown>,
  ) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/neighborhoods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Update failed", status: "error" });
        return;
      }
      await onReload();
    } catch {
      toast({ title: "Update failed", status: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const handleEditorSaved = useCallback(async () => {
    await onReload();
  }, [onReload]);

  const handleCreateNeighborhood = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ title: "Name is required", status: "warning" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/neighborhoods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          emoji: newEmoji.trim() || null,
          onMap: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Create failed", status: "error" });
        return;
      }
      setNewName("");
      setNewEmoji("");
      toast({ title: "Neighborhood created", status: "success" });
      await onReload();
    } catch {
      toast({ title: "Create failed", status: "error" });
    } finally {
      setCreating(false);
    }
  };

  const voidDeposit = async (id: string) => {
    if (!confirm("Soft-delete this deposit? Points return to the team's score.")) {
      return;
    }
    const res = await fetch("/api/admin/deposits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "void", id }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast({ title: data.error || "Delete failed", status: "error" });
      return;
    }
    toast({ title: "Deposit soft-deleted", status: "success" });
    await loadDeposits();
  };

  const neighborhoodColumns: AdminColumn<AdminNeighborhood>[] = useMemo(
    () => [
      {
        id: "emoji",
        header: "Emoji",
        minW: "60px",
        getSortValue: (n) => n.emoji ?? n.displayEmoji,
        cell: (n) => (
          <Input
            size="sm"
            defaultValue={n.emoji ?? ""}
            placeholder={n.displayEmoji}
            key={`emoji-${n.id}-${n.emoji ?? ""}`}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const next = e.target.value.trim();
              const prev = n.emoji ?? "";
              if (next !== prev) {
                void patchNeighborhood(n.id, {
                  emoji: next === "" ? null : next,
                });
              }
            }}
          />
        ),
      },
      {
        id: "name",
        header: "Name",
        getSortValue: (n) => n.name,
        cell: (n) => (
          <Input
            size="sm"
            defaultValue={n.name}
            key={`name-${n.id}-${n.name}`}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== n.name) {
                void patchNeighborhood(n.id, { name: next });
              }
            }}
          />
        ),
      },
      {
        id: "onMap",
        header: "On map",
        getSortValue: (n) => n.onMap,
        cell: (n) => (
          <Switch
            isChecked={n.onMap}
            isDisabled={busyId === n.id}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              void patchNeighborhood(n.id, {
                onMap: e.target.checked,
              })
            }
            colorScheme="blue"
          />
        ),
      },
      {
        id: "boundary",
        header: "Boundary",
        getSortValue: (n) => (n.hasBoundary ? 1 : 0),
        cell: (n) => (n.hasBoundary ? "Yes" : "—"),
      },
      {
        id: "select",
        header: "",
        disableSort: true,
        cell: (n) => (
          <Button
            size="xs"
            variant={n.id === selectedId ? "solid" : "outline"}
            colorScheme={n.id === selectedId ? "blue" : undefined}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(n.id);
            }}
          >
            {n.id === selectedId ? "Editing" : "Select"}
          </Button>
        ),
      },
    ],
    [busyId, selectedId],
  );

  const depositColumns: AdminColumn<DepositRow>[] = useMemo(
    () => [
      {
        id: "when",
        header: "When",
        getSortValue: (d) => d.createdAt,
        cell: (d) => (
          <Text fontSize="xs">{new Date(d.createdAt).toLocaleString()}</Text>
        ),
        whiteSpace: "nowrap",
      },
      {
        id: "team",
        header: "Team",
        getSortValue: (d) => d.team.name,
        getFilterValue: (d) => `${d.team.emoji} ${d.team.name}`,
        cell: (d) => (
          <Text opacity={d.deletedAt ? 0.5 : 1}>
            {d.team.emoji} {d.team.name}
          </Text>
        ),
      },
      {
        id: "neighborhood",
        header: "Neighborhood",
        getSortValue: (d) => d.neighborhood.name,
        cell: (d) => (
          <Text opacity={d.deletedAt ? 0.5 : 1}>{d.neighborhood.name}</Text>
        ),
      },
      {
        id: "points",
        header: "Pts",
        getSortValue: (d) => d.points,
        cell: (d) => <Text opacity={d.deletedAt ? 0.5 : 1}>{d.points}</Text>,
      },
      {
        id: "by",
        header: "By",
        getSortValue: (d) => d.user.name,
        getFilterValue: (d) => `${d.user.name} ${d.user.email}`,
        cell: (d) => (
          <Text fontSize="xs" opacity={d.deletedAt ? 0.5 : 1}>
            {d.user.name}
          </Text>
        ),
      },
      {
        id: "actions",
        header: "",
        disableSort: true,
        cell: (d) =>
          d.deletedAt ? (
            <Text fontSize="xs" color="gray.500">
              deleted
            </Text>
          ) : (
            <Button
              size="xs"
              colorScheme="red"
              variant="outline"
              onClick={() => void voidDeposit(d.id)}
            >
              Delete
            </Button>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <VStack align="stretch" spacing={6}>
      <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
        <HStack justify="space-between" mb={3} flexWrap="wrap" gap={2}>
          <Box>
            <Heading size="md">Map neighborhoods</Heading>
            <Text fontSize="sm" color="gray.600">
              All neighborhoods stay on the map. Click one (or pick from the
              list) to drag its shared borders — neighbors update with it.
              Shoreline edges stay locked. Switch seeds anytime; the other set
              is demoted off the map, not deleted.
            </Text>
          </Box>
          <HStack flexWrap="wrap" gap={2}>
            <Button
              colorScheme="blue"
              onClick={() => void handleImport("curated")}
              isLoading={importing === "curated"}
              isDisabled={importing !== null}
              size="sm"
            >
              Import gap-free SF map
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleImport("datasf")}
              isLoading={importing === "datasf"}
              isDisabled={importing !== null}
              size="sm"
            >
              Import DataSF 117 zones
            </Button>
          </HStack>
        </HStack>

        <Box mb={4}>
          <BoundaryEditor
            selectedId={selectedId}
            onSelect={setSelectedId}
            onSaved={handleEditorSaved}
          />
          {selected ? (
            <HStack mt={2} justify="space-between" flexWrap="wrap" gap={2}>
              <Text fontSize="sm" fontWeight="medium">
                Selected: {selected.displayEmoji} {selected.name}
              </Text>
              <Button size="xs" variant="ghost" onClick={() => setSelectedId(null)}>
                Clear selection
              </Button>
            </HStack>
          ) : null}
        </Box>

        <HStack mb={3} flexWrap="wrap" gap={2} align="flex-end">
          <Box>
            <Text fontSize="xs" color="gray.500" mb={1}>
              New neighborhood
            </Text>
            <HStack>
              <Input
                size="sm"
                maxW="60px"
                placeholder="🗺️"
                value={newEmoji}
                onChange={(e) => setNewEmoji(e.target.value)}
              />
              <Input
                size="sm"
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Button
                size="sm"
                colorScheme="blue"
                isLoading={creating}
                onClick={() => void handleCreateNeighborhood()}
              >
                Add
              </Button>
            </HStack>
          </Box>
        </HStack>

        <AdminDataTable
          tableId="admin-neighborhoods"
          rows={neighborhoods}
          columns={neighborhoodColumns}
          getRowId={(n) => n.id}
          emptyMessage="No neighborhoods yet"
          onRowClick={(n) => setSelectedId(n.id)}
          isRowSelected={(n) => n.id === selectedId}
        />
      </Box>

      <Box>
        <Heading size="md" mb={1}>
          Recent deposits
        </Heading>
        <Text fontSize="sm" color="gray.600" mb={3}>
          Void a bad deposit to return those points to the team&apos;s score.
        </Text>
        <AdminDataTable
          tableId="admin-deposits"
          rows={deposits}
          columns={depositColumns}
          getRowId={(d) => d.id}
          emptyMessage="No deposits yet"
        />
      </Box>
    </VStack>
  );
}
