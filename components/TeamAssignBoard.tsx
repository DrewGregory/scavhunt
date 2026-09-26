import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  useToast,
  VStack,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import PlayerSurveyCard, {
  type PlayerSurveyCardUser,
} from "./PlayerSurveyCard";

type AssignUser = PlayerSurveyCardUser & {
  teamId: string | null;
  isActive: boolean;
  phoneE164?: string;
};

type AssignTeam = {
  id: string;
  name: string;
  emoji: string;
  color: string;
};

type DropTarget = { kind: "unassigned" } | { kind: "team"; teamId: string } | { kind: "new" };

const DRAG_MIME = "application/x-scavhunt-user-id";

type FilterChip = "all" | "playing" | "browsing" | "incomplete";

export default function TeamAssignBoard() {
  const toast = useToast();
  const [users, setUsers] = useState<AssignUser[]>([]);
  const [teams, setTeams] = useState<AssignTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [chip, setChip] = useState<FilterChip>("all");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pendingNew, setPendingNew] = useState<{
    userId: string;
  } | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("🚀");

  const load = useCallback(async () => {
    const [uRes, tRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/teams"),
    ]);
    if (!uRes.ok || !tRes.ok) throw new Error("Failed to load");
    const uData = await uRes.json();
    const tData = await tRes.json();
    setUsers(uData.users as AssignUser[]);
    setTeams(
      (tData.teams as AssignTeam[]).map((t) => ({
        id: t.id,
        name: t.name,
        emoji: t.emoji,
        color: t.color,
      })),
    );
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch {
        toast({ title: "Failed to load assign board", status: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [load, toast]);

  const assignUser = async (userId: string, teamId: string | null) => {
    const prev = users;
    setUsers((list) =>
      list.map((u) => (u.id === userId ? { ...u, teamId } : u)),
    );
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, teamId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUsers(prev);
        toast({
          title: data.error || "Failed to assign",
          status: "error",
        });
        return false;
      }
      const data = await res.json();
      if (data.user) {
        setUsers((list) =>
          list.map((u) => (u.id === userId ? { ...u, ...data.user } : u)),
        );
      }
      return true;
    } catch {
      setUsers(prev);
      toast({ title: "Failed to assign", status: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createTeamAndAssign = async () => {
    if (!pendingNew) return;
    const name = newName.trim();
    const emoji = newEmoji.trim();
    if (!name || !emoji) {
      toast({ title: "Name and emoji required", status: "warning" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/create-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, emoji }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Failed to create team", status: "error" });
        return;
      }
      const team = data.team as AssignTeam;
      setTeams((prev) =>
        [...prev, team].sort((a, b) => a.name.localeCompare(b.name)),
      );
      const userId = pendingNew.userId;
      setPendingNew(null);
      setNewName("");
      setNewEmoji("🚀");
      await assignUser(userId, team.id);
    } catch {
      toast({ title: "Failed to create team", status: "error" });
    } finally {
      setBusy(false);
    }
  };

  const patchTeamField = async (
    teamId: string,
    patch: { name?: string; emoji?: string },
  ) => {
    const res = await fetch("/api/admin/teams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: teamId, ...patch }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({ title: data.error || "Failed to update team", status: "error" });
      return;
    }
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, ...patch } : t)),
    );
  };

  const onCardDragStart = (userId: string) => (e: DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, userId);
    e.dataTransfer.setData("text/plain", userId);
    e.dataTransfer.effectAllowed = "move";
  };

  const dropTargetKey = (t: DropTarget) =>
    t.kind === "team" ? `team:${t.teamId}` : t.kind;

  const makeDropHandlers = (target: DropTarget) => {
    const key = dropTargetKey(target);
    return {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(key);
      },
      onDragLeave: (e: DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver((cur) => (cur === key ? null : cur));
      },
      onDrop: async (e: DragEvent) => {
        e.preventDefault();
        setDragOver(null);
        const userId =
          e.dataTransfer.getData(DRAG_MIME) ||
          e.dataTransfer.getData("text/plain");
        if (!userId) return;
        if (target.kind === "unassigned") {
          await assignUser(userId, null);
        } else if (target.kind === "team") {
          await assignUser(userId, target.teamId);
        } else {
          setPendingNew({ userId });
          const user = users.find((u) => u.id === userId);
          if (user && !newName) {
            // mild default from first name
            setNewName(`${user.name.split(" ")[0]}'s team`);
          }
        }
      },
    };
  };

  const q = filter.trim().toLowerCase();

  const matchesFilters = (u: AssignUser) => {
    if (chip === "playing" && u.intent !== "playing") return false;
    if (chip === "browsing" && u.intent !== "browsing") return false;
    if (chip === "incomplete" && u.surveyCompletedAt) return false;
    if (!q) return true;
    const hay = [
      u.name,
      u.email,
      u.intent,
      u.teamPreferences,
      u.competitiveness,
      u.timeCommitment,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  };

  const unassigned = useMemo(
    () =>
      users
        .filter((u) => !u.teamId)
        .filter(matchesFilters)
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, filter, chip],
  );

  const membersByTeam = useMemo(() => {
    const map = new Map<string, AssignUser[]>();
    for (const t of teams) map.set(t.id, []);
    for (const u of users) {
      if (!u.teamId) continue;
      const list = map.get(u.teamId);
      if (list) list.push(u);
      else map.set(u.teamId, [u]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [users, teams]);

  if (loading) {
    return <Text>Loading assign board…</Text>;
  }

  const unassignedHandlers = makeDropHandlers({ kind: "unassigned" });
  const newGroupHandlers = makeDropHandlers({ kind: "new" });

  return (
    <Box
      display="grid"
      gridTemplateColumns={{ base: "1fr", lg: "320px 1fr" }}
      gap={4}
      height={{ base: "auto", lg: "calc(100dvh - 140px)" }}
      minH="480px"
    >
      {/* Left: unassigned */}
      <Box
        bg="gray.50"
        borderRadius="md"
        borderWidth="1px"
        display="flex"
        flexDirection="column"
        minH={0}
        overflow="hidden"
        outline={dragOver === "unassigned" ? "2px solid" : undefined}
        outlineColor={dragOver === "unassigned" ? "blue.400" : undefined}
        {...unassignedHandlers}
      >
        <Box px={3} py={3} borderBottomWidth="1px" bg="white">
          <Heading size="sm" mb={2}>
            Unassigned{" "}
            <Text as="span" color="gray.500" fontWeight="normal">
              ({unassigned.length})
            </Text>
          </Heading>
          <Input
            size="sm"
            placeholder="Filter players…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            mb={2}
            bg="white"
          />
          <Wrap spacing={1}>
            {(
              [
                ["all", "All"],
                ["playing", "Playing"],
                ["browsing", "Browsing"],
                ["incomplete", "No survey"],
              ] as Array<[FilterChip, string]>
            ).map(([id, label]) => (
              <WrapItem key={id}>
                <Button
                  size="xs"
                  variant={chip === id ? "solid" : "outline"}
                  colorScheme="blue"
                  onClick={() => setChip(id)}
                >
                  {label}
                </Button>
              </WrapItem>
            ))}
          </Wrap>
        </Box>
        <VStack
          align="stretch"
          spacing={2}
          p={3}
          overflowY="auto"
          flex="1"
          minH={0}
        >
          {unassigned.length === 0 ? (
            <Text fontSize="sm" color="gray.500" textAlign="center" py={6}>
              No matching unassigned players
            </Text>
          ) : (
            unassigned.map((u) => (
              <PlayerSurveyCard
                key={u.id}
                user={u}
                draggable={!busy}
                onDragStart={onCardDragStart(u.id)}
              />
            ))
          )}
        </VStack>
      </Box>

      {/* Right: new group + 2-col teams */}
      <Box
        display="flex"
        flexDirection="column"
        minH={0}
        overflow="hidden"
        gap={3}
      >
        <Box
          borderWidth="2px"
          borderStyle="dashed"
          borderColor={dragOver === "new" ? "purple.400" : "gray.300"}
          bg={dragOver === "new" ? "purple.50" : "white"}
          borderRadius="md"
          px={4}
          py={4}
          textAlign="center"
          flexShrink={0}
          {...newGroupHandlers}
        >
          <Text fontWeight="semibold" color="gray.700">
            + New group
          </Text>
          <Text fontSize="xs" color="gray.500">
            Drop a player here to create a team and assign them
          </Text>
        </Box>

        <Box
          flex="1"
          minH={0}
          overflowY="auto"
          pr={1}
          display="grid"
          gridTemplateColumns={{ base: "1fr", md: "1fr 1fr" }}
          gap={3}
          alignContent="start"
        >
          {teams.map((team) => {
            const members = membersByTeam.get(team.id) ?? [];
            const key = `team:${team.id}`;
            const handlers = makeDropHandlers({
              kind: "team",
              teamId: team.id,
            });
            return (
              <Box
                key={team.id}
                bg="white"
                borderWidth="1px"
                borderRadius="md"
                boxShadow="sm"
                minH="140px"
                display="flex"
                flexDirection="column"
                outline={dragOver === key ? "2px solid" : undefined}
                outlineColor={dragOver === key ? "blue.400" : undefined}
                borderTopWidth="4px"
                borderTopColor={team.color || "#3182CE"}
                {...handlers}
              >
                <HStack
                  px={3}
                  py={2}
                  borderBottomWidth="1px"
                  spacing={2}
                  align="center"
                >
                  <Input
                    size="sm"
                    maxW="48px"
                    defaultValue={team.emoji}
                    key={`emoji-${team.id}-${team.emoji}`}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== team.emoji) {
                        void patchTeamField(team.id, { emoji: next });
                      }
                    }}
                  />
                  <Input
                    size="sm"
                    defaultValue={team.name}
                    key={`name-${team.id}-${team.name}`}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== team.name) {
                        void patchTeamField(team.id, { name: next });
                      }
                    }}
                  />
                  <Text fontSize="xs" color="gray.500" whiteSpace="nowrap">
                    {members.length}
                  </Text>
                </HStack>
                <VStack align="stretch" spacing={2} p={2} flex="1">
                  {members.length === 0 ? (
                    <Text fontSize="xs" color="gray.400" textAlign="center" py={4}>
                      Drop players here
                    </Text>
                  ) : (
                    members.map((u) => (
                      <PlayerSurveyCard
                        key={u.id}
                        user={u}
                        compact
                        draggable={!busy}
                        onDragStart={onCardDragStart(u.id)}
                      />
                    ))
                  )}
                </VStack>
              </Box>
            );
          })}
        </Box>
      </Box>

      <Modal
        isOpen={!!pendingNew}
        onClose={() => setPendingNew(null)}
        isCentered
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Create team</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <Text fontSize="sm" color="gray.600">
                Creating a team for{" "}
                <Text as="span" fontWeight="semibold">
                  {users.find((u) => u.id === pendingNew?.userId)?.name ??
                    "player"}
                </Text>
              </Text>
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Team name"
                  autoFocus
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Emoji</FormLabel>
                <Input
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  maxW="100px"
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setPendingNew(null)}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              isLoading={busy}
              onClick={() => void createTeamAndAssign()}
            >
              Create &amp; assign
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
