import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Text,
  Tooltip,
  VStack,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import AdminDataTable, { type AdminColumn } from "./AdminDataTable";
import EmojiInput from "./EmojiInput";

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

type TeamOption = {
  id: string;
  name: string;
  emoji: string;
};

const NeighborhoodMap = dynamic(() => import("./AdminNeighborhoodMap"), {
  ssr: false,
  loading: () => (
    <Text fontSize="sm" color="gray.500">
      Loading map editor…
    </Text>
  ),
});

function NeighborhoodDepositsPanel({
  neighborhood,
  deposits,
  teams,
  onChanged,
}: {
  neighborhood: AdminNeighborhood;
  deposits: DepositRow[];
  teams: TeamOption[];
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [editingDepositId, setEditingDepositId] = useState<string | null>(null);
  const [pointsDraft, setPointsDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addTeamId, setAddTeamId] = useState("");
  const [addPoints, setAddPoints] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DepositRow | null>(null);
  const deleteConfirm = useDisclosure();

  const live = useMemo(
    () => deposits.filter((d) => !d.deletedAt),
    [deposits],
  );

  const byTeam = useMemo(() => {
    const map = new Map<
      string,
      { team: DepositRow["team"]; deposits: DepositRow[]; total: number }
    >();
    for (const d of live) {
      const prev = map.get(d.team.id);
      if (prev) {
        prev.deposits.push(d);
        prev.total += d.points;
      } else {
        map.set(d.team.id, {
          team: d.team,
          deposits: [d],
          total: d.points,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [live]);

  const startEditDeposit = (d: DepositRow) => {
    setEditingDepositId(d.id);
    setPointsDraft((prev) => ({ ...prev, [d.id]: String(d.points) }));
  };

  const saveDepositPoints = async (d: DepositRow) => {
    const raw = pointsDraft[d.id] ?? String(d.points);
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 1 || !Number.isInteger(next)) {
      toast({ title: "Points must be a positive integer", status: "warning" });
      return;
    }
    if (next === d.points) {
      setEditingDepositId(null);
      return;
    }
    setBusyId(d.id);
    try {
      const res = await fetch("/api/admin/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: d.id, points: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Update failed", status: "error" });
        return;
      }
      toast({ title: "Deposit updated", status: "success" });
      setEditingDepositId(null);
      await onChanged();
    } catch {
      toast({ title: "Update failed", status: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = (d: DepositRow) => {
    setPendingDelete(d);
    deleteConfirm.onOpen();
  };

  const voidDeposit = async () => {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    try {
      const res = await fetch("/api/admin/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void", id: pendingDelete.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Delete failed", status: "error" });
        return;
      }
      toast({ title: "Deposit deleted", status: "success" });
      deleteConfirm.onClose();
      setPendingDelete(null);
      await onChanged();
    } catch {
      toast({ title: "Delete failed", status: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const addDeposit = async () => {
    if (!addTeamId) {
      toast({ title: "Pick a team", status: "warning" });
      return;
    }
    const pts = Number(addPoints);
    if (!Number.isFinite(pts) || pts < 1 || !Number.isInteger(pts)) {
      toast({ title: "Points must be a positive integer", status: "warning" });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          teamId: addTeamId,
          neighborhoodId: neighborhood.id,
          points: pts,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Create failed", status: "error" });
        return;
      }
      toast({ title: "Deposit added", status: "success" });
      setAddPoints("");
      await onChanged();
    } catch {
      toast({ title: "Create failed", status: "error" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <VStack align="stretch" spacing={3} onClick={(e) => e.stopPropagation()}>
      {byTeam.length === 0 ? (
        <Text fontSize="sm" color="gray.500">
          No live deposits in this neighborhood.
        </Text>
      ) : (
        byTeam.map(({ team, deposits: teamDeposits, total }) => (
          <Box
            key={team.id}
            borderWidth="1px"
            borderRadius="md"
            bg="white"
            p={3}
          >
            <HStack justify="space-between" mb={2}>
              <Text fontWeight="semibold" fontSize="sm">
                {team.emoji} {team.name}
              </Text>
              <Badge colorScheme="purple">{total} pts</Badge>
            </HStack>
            <VStack align="stretch" spacing={1.5}>
              {teamDeposits.map((d) => {
                const editing = editingDepositId === d.id;
                return (
                  <HStack
                    key={d.id}
                    justify="space-between"
                    align="center"
                    flexWrap="wrap"
                    gap={2}
                    py={1}
                    borderTopWidth="1px"
                    borderColor="gray.100"
                  >
                    <HStack spacing={3} flex="1" minW="180px">
                      <Text fontSize="xs" color="gray.500" whiteSpace="nowrap">
                        {new Date(d.createdAt).toLocaleString()}
                      </Text>
                      <Text fontSize="xs" color="gray.600">
                        by {d.user.name}
                      </Text>
                    </HStack>
                    {editing ? (
                      <HStack>
                        <Input
                          size="xs"
                          type="number"
                          maxW="72px"
                          value={pointsDraft[d.id] ?? String(d.points)}
                          onChange={(e) =>
                            setPointsDraft((prev) => ({
                              ...prev,
                              [d.id]: e.target.value,
                            }))
                          }
                          autoFocus
                        />
                        <Button
                          size="xs"
                          colorScheme="blue"
                          isLoading={busyId === d.id}
                          onClick={() => void saveDepositPoints(d)}
                        >
                          Save
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setEditingDepositId(null)}
                        >
                          Cancel
                        </Button>
                      </HStack>
                    ) : (
                      <HStack>
                        <Text fontWeight="medium" fontSize="sm" minW="48px">
                          {d.points} pts
                        </Text>
                        <Tooltip label="Edit points">
                          <IconButton
                            aria-label="Edit points"
                            icon={<FiEdit2 />}
                            size="xs"
                            variant="ghost"
                            onClick={() => startEditDeposit(d)}
                          />
                        </Tooltip>
                        <Tooltip label="Delete deposit">
                          <IconButton
                            aria-label="Delete deposit"
                            icon={<FiTrash2 />}
                            size="xs"
                            variant="ghost"
                            colorScheme="red"
                            onClick={() => confirmDelete(d)}
                          />
                        </Tooltip>
                      </HStack>
                    )}
                  </HStack>
                );
              })}
            </VStack>
          </Box>
        ))
      )}

      <Box borderWidth="1px" borderRadius="md" borderStyle="dashed" p={3} bg="white">
        <Text fontSize="xs" fontWeight="semibold" color="gray.600" mb={2}>
          Add deposit on behalf of a team
        </Text>
        <HStack flexWrap="wrap" gap={2} align="flex-end">
          <Box minW="160px">
            <Select
              size="sm"
              placeholder="Team…"
              value={addTeamId}
              onChange={(e) => setAddTeamId(e.target.value)}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.emoji} {t.name}
                </option>
              ))}
            </Select>
          </Box>
          <Input
            size="sm"
            type="number"
            placeholder="Points"
            maxW="100px"
            value={addPoints}
            onChange={(e) => setAddPoints(e.target.value)}
          />
          <Button
            size="sm"
            colorScheme="blue"
            isLoading={adding}
            onClick={() => void addDeposit()}
          >
            Add
          </Button>
        </HStack>
      </Box>

      <Modal
        isOpen={deleteConfirm.isOpen}
        onClose={() => {
          deleteConfirm.onClose();
          setPendingDelete(null);
        }}
        isCentered
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete deposit?</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {pendingDelete ? (
              <Text fontSize="sm">
                Soft-delete{" "}
                <strong>
                  {pendingDelete.points} pts
                </strong>{" "}
                from{" "}
                <strong>
                  {pendingDelete.team.emoji} {pendingDelete.team.name}
                </strong>{" "}
                in {neighborhood.displayEmoji} {neighborhood.name}? Those points
                return to the team&apos;s score.
              </Text>
            ) : null}
          </ModalBody>
          <ModalFooter gap={2}>
            <Button
              variant="ghost"
              onClick={() => {
                deleteConfirm.onClose();
                setPendingDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              colorScheme="red"
              isLoading={busyId === pendingDelete?.id}
              onClick={() => void voidDeposit()}
            >
              Delete deposit
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
}

export default function AdminMapPanel({
  neighborhoods,
  onReload,
}: {
  neighborhoods: AdminNeighborhood[];
  onReload: () => Promise<void>;
}) {
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [creating, setCreating] = useState(false);

  const [importing, setImporting] = useState<"topology" | "neighborhoods" | null>(
    null,
  );
  const topologyConfirm = useDisclosure();
  const neighborhoodsConfirm = useDisclosure();

  const selectedNeighborhoods = useMemo(
    () => neighborhoods.filter((n) => selectedIds.includes(n.id)),
    [neighborhoods, selectedIds],
  );

  const liveDepositCount = useMemo(
    () => deposits.filter((d) => !d.deletedAt).length,
    [deposits],
  );
  const canResetNeighborhoods = liveDepositCount === 0;

  const depositsByNeighborhood = useMemo(() => {
    const map = new Map<string, DepositRow[]>();
    for (const d of deposits) {
      const list = map.get(d.neighborhood.id) ?? [];
      list.push(d);
      map.set(d.neighborhood.id, list);
    }
    return map;
  }, [deposits]);

  const loadDeposits = useCallback(async () => {
    const res = await fetch("/api/admin/deposits?includeDeleted=1");
    if (!res.ok) return;
    const data = await res.json();
    setDeposits(data.deposits ?? []);
  }, []);

  const loadTeams = useCallback(async () => {
    const res = await fetch("/api/admin/teams");
    if (!res.ok) return;
    const data = await res.json();
    setTeams(
      (data.teams ?? []).map((t: TeamOption) => ({
        id: t.id,
        name: t.name,
        emoji: t.emoji,
      })),
    );
  }, []);

  useEffect(() => {
    void loadDeposits();
    void loadTeams();
  }, [loadDeposits, loadTeams]);

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => neighborhoods.some((n) => n.id === id)),
    );
    if (editingMapId && !neighborhoods.some((n) => n.id === editingMapId)) {
      setEditingMapId(null);
    }
    if (editingRowId && !neighborhoods.some((n) => n.id === editingRowId)) {
      setEditingRowId(null);
    }
  }, [neighborhoods, editingMapId, editingRowId]);

  const handleEditorSaved = useCallback(async () => {
    await onReload();
    await loadDeposits();
  }, [onReload, loadDeposits]);

  const runReset = async (action: "reset-topology" | "reset-neighborhoods") => {
    setImporting(action === "reset-topology" ? "topology" : "neighborhoods");
    try {
      const res = await fetch("/api/admin/import-boundaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Reset failed", status: "error" });
        return;
      }
      if (action === "reset-topology") {
        toast({
          title: `Topology reset (${data.matched} neighborhoods matched by name)`,
          description:
            data.missingInDb > 0
              ? `${data.missingInDb} seed zone(s) had no matching neighborhood`
              : undefined,
          status: "success",
        });
      } else {
        toast({
          title: `Neighborhoods reset (${data.zoneCount} zones)`,
          status: "success",
        });
      }
      setSelectedIds([]);
      setEditingMapId(null);
      setEditingRowId(null);
      await onReload();
      await loadDeposits();
    } catch {
      toast({ title: "Reset failed", status: "error" });
    } finally {
      setImporting(null);
      topologyConfirm.onClose();
      neighborhoodsConfirm.onClose();
    }
  };

  const patchNeighborhood = async (
    id: string,
    patch: Record<string, unknown>,
  ) => {
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

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const neighborhoodColumns: AdminColumn<AdminNeighborhood>[] = useMemo(
    () => [
      {
        id: "emoji",
        header: "",
        minW: "44px",
        maxW: "52px",
        getSortValue: (n) => n.emoji ?? n.displayEmoji,
        cell: (n) => {
          const editing = editingRowId === n.id;
          if (!editing) {
            return (
              <Text fontSize="lg" lineHeight={1} textAlign="center">
                {n.emoji ?? n.displayEmoji}
              </Text>
            );
          }
          return (
            <Box onClick={(e) => e.stopPropagation()}>
              <EmojiInput
                size="xs"
                value={n.emoji ?? ""}
                placeholder={n.displayEmoji}
                onChange={(next) => {
                  const normalized = next.trim() === "" ? null : next;
                  if (normalized !== (n.emoji ?? null)) {
                    void patchNeighborhood(n.id, { emoji: normalized });
                  }
                }}
              />
            </Box>
          );
        },
      },
      {
        id: "name",
        header: "Name",
        getSortValue: (n) => n.name,
        cell: (n) => {
          const editing = editingRowId === n.id;
          if (!editing) {
            return (
              <Text fontWeight="medium" fontSize="sm">
                {n.name}
              </Text>
            );
          }
          return (
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
          );
        },
      },
      {
        id: "deposits",
        header: "Deposits",
        getSortValue: (n) => {
          const list = depositsByNeighborhood.get(n.id) ?? [];
          return list
            .filter((d) => !d.deletedAt)
            .reduce((s, d) => s + d.points, 0);
        },
        getFilterValue: (n) => {
          const list = (depositsByNeighborhood.get(n.id) ?? []).filter(
            (d) => !d.deletedAt,
          );
          return list
            .map((d) => `${d.team.name} ${d.points}`)
            .join(" ");
        },
        cell: (n) => {
          const list = (depositsByNeighborhood.get(n.id) ?? []).filter(
            (d) => !d.deletedAt,
          );
          if (list.length === 0) {
            return (
              <Text fontSize="sm" color="gray.400">
                —
              </Text>
            );
          }
          const pts = list.reduce((s, d) => s + d.points, 0);
          return (
            <Text fontSize="sm">
              {pts} pts · {list.length}
            </Text>
          );
        },
      },
      {
        id: "actions",
        header: "",
        disableSort: true,
        cell: (n) => {
          const editing = editingRowId === n.id;
          return (
            <HStack spacing={1} onClick={(e) => e.stopPropagation()}>
              {editing ? (
                <Button
                  size="xs"
                  colorScheme="blue"
                  onClick={() => setEditingRowId(null)}
                >
                  Done
                </Button>
              ) : (
                <Tooltip label="Edit neighborhood">
                  <IconButton
                    aria-label="Edit"
                    icon={<FiEdit2 />}
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setSelectedIds([n.id]);
                      setEditingMapId(null);
                      setEditingRowId(n.id);
                    }}
                  />
                </Tooltip>
              )}
            </HStack>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingRowId, depositsByNeighborhood],
  );

  return (
    <VStack align="stretch" spacing={6}>
      <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
        <HStack justify="space-between" mb={3} flexWrap="wrap" gap={2}>
          <Box>
            <Heading size="md">Map neighborhoods</Heading>
            <Text fontSize="sm" color="gray.600">
              Click a row to select it on the map. Expand to manage deposits.
              Pencil edits name / emoji. Use Edit borders on the map for shared
              edges.
            </Text>
          </Box>
          <HStack flexWrap="wrap" gap={2}>
            <Button
              size="sm"
              variant="outline"
              onClick={topologyConfirm.onOpen}
              isLoading={importing === "topology"}
              isDisabled={importing !== null}
            >
              Reset topology
            </Button>
            <Button
              size="sm"
              colorScheme="red"
              variant="outline"
              onClick={neighborhoodsConfirm.onOpen}
              isLoading={importing === "neighborhoods"}
              isDisabled={!canResetNeighborhoods || importing !== null}
              title={
                canResetNeighborhoods
                  ? "Full curated neighborhood reseed"
                  : `Blocked: ${liveDepositCount} live deposit(s)`
              }
            >
              Reset neighborhoods
            </Button>
          </HStack>
        </HStack>

        <Box mb={4}>
          <NeighborhoodMap
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            editingId={editingMapId}
            onEditingIdChange={setEditingMapId}
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
                  setEditingMapId(null);
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
              <EmojiInput
                size="xs"
                value={newEmoji}
                placeholder="🗺️"
                onChange={setNewEmoji}
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
            setEditingMapId(null);
          }}
          isRowSelected={(n) => selectedIds.includes(n.id)}
          isRowExpanded={(n) => expandedIds.has(n.id)}
          onToggleExpand={(n) => toggleExpand(n.id)}
          renderExpandedRow={(n) => (
            <NeighborhoodDepositsPanel
              neighborhood={n}
              deposits={depositsByNeighborhood.get(n.id) ?? []}
              teams={teams}
              onChanged={loadDeposits}
            />
          )}
        />
      </Box>

      <Modal
        isOpen={topologyConfirm.isOpen}
        onClose={topologyConfirm.onClose}
        isCentered
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Reset topology?</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm">
              Re-applies the bundled gap-free shared-border topology to
              neighborhoods that <strong>already exist</strong>, matched by{" "}
              <strong>unique name</strong>. Updates their boundaries and the
              shared-arc map. Does <strong>not</strong> create, delete, or
              demote neighborhoods, and does not touch deposits.
            </Text>
            <Text fontSize="sm" mt={3} color="gray.600">
              Custom / renamed / split zones that aren&apos;t in the seed will
              keep their rows but may drop out of shared-edge editing until you
              rebuild.
            </Text>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={topologyConfirm.onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              isLoading={importing === "topology"}
              onClick={() => void runReset("reset-topology")}
            >
              Reset topology
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={neighborhoodsConfirm.isOpen}
        onClose={neighborhoodsConfirm.onClose}
        isCentered
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Reset neighborhoods?</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm">
              Fully reseeds the curated gap-free SF neighborhood set: creates
              missing zones, updates matching names, and demotes other on-map
              neighborhoods.{" "}
              <strong>Only allowed when there are no live deposits.</strong>
            </Text>
            {!canResetNeighborhoods && (
              <Text fontSize="sm" mt={3} color="red.500">
                Currently blocked — {liveDepositCount} live deposit(s). Soft-delete
                them first.
              </Text>
            )}
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={neighborhoodsConfirm.onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="red"
              isDisabled={!canResetNeighborhoods}
              isLoading={importing === "neighborhoods"}
              onClick={() => void runReset("reset-neighborhoods")}
            >
              Reset neighborhoods
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
}
