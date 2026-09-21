import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Box,
  Button,
  Heading,
  HStack,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  useToast,
} from "@chakra-ui/react";

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
  voidedAt: string | null;
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

  const selected = neighborhoods.find((n) => n.id === selectedId) ?? null;

  const loadDeposits = useCallback(async () => {
    const res = await fetch("/api/admin/deposits?includeVoided=1");
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

  const voidDeposit = async (id: string) => {
    if (!confirm("Void this deposit? Points return to the team's score.")) {
      return;
    }
    const res = await fetch("/api/admin/deposits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "void", id }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast({ title: data.error || "Void failed", status: "error" });
      return;
    }
    toast({ title: "Deposit voided", status: "success" });
    await loadDeposits();
  };

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

        {/* Persistent overview + edit map — never remount on selection */}
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

        <Box overflowX="auto">
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>On map</Th>
                <Th>Boundary</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {neighborhoods.map((n) => (
                <Tr
                  key={n.id}
                  bg={n.id === selectedId ? "blue.50" : undefined}
                  cursor="pointer"
                  onClick={() => setSelectedId(n.id)}
                >
                  <Td>
                    {n.displayEmoji} {n.name}
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <Switch
                      isChecked={n.onMap}
                      isDisabled={busyId === n.id}
                      onChange={(e) =>
                        void patchNeighborhood(n.id, {
                          onMap: e.target.checked,
                        })
                      }
                      colorScheme="blue"
                    />
                  </Td>
                  <Td>{n.hasBoundary ? "Yes" : "—"}</Td>
                  <Td>
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
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      </Box>

      <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
        <Heading size="md" mb={2}>
          Recent deposits
        </Heading>
        <Text fontSize="sm" color="gray.600" mb={3}>
          Void a bad deposit to return those points to the team&apos;s score.
        </Text>
        <Box overflowX="auto">
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>When</Th>
                <Th>Team</Th>
                <Th>Neighborhood</Th>
                <Th>Pts</Th>
                <Th>By</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {deposits.length === 0 ? (
                <Tr>
                  <Td colSpan={6}>
                    <Text color="gray.500">No deposits yet</Text>
                  </Td>
                </Tr>
              ) : (
                deposits.map((d) => (
                  <Tr key={d.id} opacity={d.voidedAt ? 0.5 : 1}>
                    <Td fontSize="xs">
                      {new Date(d.createdAt).toLocaleString()}
                    </Td>
                    <Td>
                      {d.team.emoji} {d.team.name}
                    </Td>
                    <Td>{d.neighborhood.name}</Td>
                    <Td>{d.points}</Td>
                    <Td fontSize="xs">{d.user.name}</Td>
                    <Td>
                      {d.voidedAt ? (
                        <Text fontSize="xs" color="gray.500">
                          voided
                        </Text>
                      ) : (
                        <Button
                          size="xs"
                          colorScheme="red"
                          variant="outline"
                          onClick={() => void voidDeposit(d.id)}
                        >
                          Void
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        </Box>
      </Box>
    </VStack>
  );
}
