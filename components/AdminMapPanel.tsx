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

const NeighborhoodMap = dynamic(() => import("./AdminNeighborhoodMap"), {
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [creating, setCreating] = useState(false);

  const selectedNeighborhoods = useMemo(
    () => neighborhoods.filter((n) => selectedIds.includes(n.id)),
    [neighborhoods, selectedIds],
  );

  const loadDeposits = useCallback(async () => {
    const res = await fetch("/api/admin/deposits?includeDeleted=1");
    if (!res.ok) return;
    const data = await res.json();
    setDeposits(data.deposits ?? []);
  }, []);

  useEffect(() => {
    void loadDeposits();
  }, [loadDeposits]);

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => neighborhoods.some((n) => n.id === id)),
    );
    if (editingId && !neighborhoods.some((n) => n.id === editingId)) {
      setEditingId(null);
    }
  }, [neighborhoods, editingId]);

  const handleEditorSaved = useCallback(async () => {
    await onReload();
    await loadDeposits();
  }, [onReload, loadDeposits]);

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
        cell: (n) => {
          const selected = selectedIds.includes(n.id);
          const editing = editingId === n.id;
          return (
            <Button
              size="xs"
              variant={selected ? "solid" : "outline"}
              colorScheme={editing ? "orange" : selected ? "blue" : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey) {
                  setSelectedIds((prev) =>
                    prev.includes(n.id)
                      ? prev.filter((id) => id !== n.id)
                      : [...prev, n.id],
                  );
                } else {
                  setSelectedIds([n.id]);
                  setEditingId(null);
                }
              }}
            >
              {editing ? "Editing" : selected ? "Selected" : "Select"}
            </Button>
          );
        },
      },
    ],
    [busyId, selectedIds, editingId],
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
              Click a neighborhood (or pick from the list) to select it. Use
              Edit to drag shared borders — neighbors update with it. Shoreline
              edges stay locked.
            </Text>
          </Box>
        </HStack>

        <Box mb={4}>
          <NeighborhoodMap
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            editingId={editingId}
            onEditingIdChange={setEditingId}
            deposits={deposits}
            onSaved={handleEditorSaved}
          />
          {selectedNeighborhoods.length > 0 ? (
            <HStack mt={2} justify="space-between" flexWrap="wrap" gap={2}>
              <Text fontSize="sm" fontWeight="medium">
                Selected:{" "}
                {selectedNeighborhoods
                  .map((n) => `${n.displayEmoji} ${n.name}`)
                  .join(", ")}
              </Text>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setSelectedIds([]);
                  setEditingId(null);
                }}
              >
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
          onRowClick={(n) => {
            setSelectedIds([n.id]);
            setEditingId(null);
          }}
          isRowSelected={(n) => selectedIds.includes(n.id)}
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
