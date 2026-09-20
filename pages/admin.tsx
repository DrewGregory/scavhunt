import { useEffect, useState } from "react";
import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import {
  Box,
  Button,
  Flex,
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
  Select,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import NavContainer from "../components/NavContainer";
import { publicUser, requireAdminSSP } from "../lib/auth";
import type { SerializedChallenge, SerializedTeam } from "../lib/types";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  phoneE164: string;
  isAdmin: boolean;
  isActive: boolean;
  teamId: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  intent: string | null;
  teamPreferences: string | null;
  competitiveness: string | null;
  surveyCompletedAt: string | null;
  team: { id: string; name: string; emoji: string } | null;
  _count: { submissions: number; votes: number };
};

type AdminTeam = SerializedTeam & {
  users?: Array<{
    id: string;
    name: string;
    email: string;
    phoneE164: string;
    isAdmin: boolean;
    isActive: boolean;
  }>;
};

type Challenge = SerializedChallenge;

type TournamentMatchup = {
  id: string;
  round: number;
  isOpen: boolean;
  winnerId: string | null;
  slotA: { id: string; name: string };
  slotB: { id: string; name: string };
  winner: { id: string; name: string } | null;
  votes: Record<string, number>;
  totalVotes: number;
};

type AdminNeighborhood = {
  id: string;
  name: string;
  emoji: string | null;
  displayEmoji: string;
  createdAt: string;
  matchupCount: number;
  voteCount: number;
};

type Tab = "users" | "teams" | "challenges" | "tournament" | "settings";

function toLocalInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireAdminSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  return {
    props: {
      user: publicUser(auth.user!),
    },
  };
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function AdminPage({
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [matchups, setMatchups] = useState<TournamentMatchup[]>([]);
  const [currentRound, setCurrentRound] = useState<number | null>(null);
  const [tournamentComplete, setTournamentComplete] = useState(false);
  const [tournamentNotStarted, setTournamentNotStarted] = useState(false);
  const [roundSchedule, setRoundSchedule] = useState<Record<number, string>>(
    {},
  );
  const [currentRoundEndsAt, setCurrentRoundEndsAt] = useState<string | null>(
    null,
  );
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<number, string>>(
    {},
  );
  const [neighborhoods, setNeighborhoods] = useState<AdminNeighborhood[]>([]);
  const [newNeighborhoodName, setNewNeighborhoodName] = useState("");
  const [newNeighborhoodEmoji, setNewNeighborhoodEmoji] = useState("");
  const [huntStartsAt, setHuntStartsAt] = useState("");
  const [huntEndsAt, setHuntEndsAt] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamEmoji, setNewTeamEmoji] = useState("");

  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(
    null,
  );
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const [pendingAdminToggle, setPendingAdminToggle] = useState<{
    user: AdminUser;
    nextValue: boolean;
  } | null>(null);
  const adminConfirm = useDisclosure();

  const loadUsers = async () => {
    const res = await fetch("/api/admin/users");
    if (!res.ok) throw new Error("Failed to load users");
    const data = await res.json();
    setUsers(data.users);
  };

  const loadTeams = async () => {
    const res = await fetch("/api/admin/teams");
    if (!res.ok) throw new Error("Failed to load teams");
    const data = await res.json();
    setTeams(data.teams);
  };

  const loadChallenges = async () => {
    const res = await fetch("/api/admin/challenges");
    if (!res.ok) throw new Error("Failed to load challenges");
    const data = await res.json();
    setChallenges(data.challenges);
  };

  const loadTournament = async () => {
    const res = await fetch("/api/admin/tournament");
    if (!res.ok) throw new Error("Failed to load tournament");
    const data = await res.json();
    setMatchups(data.matchups);
    setCurrentRound(data.currentRound);
    setTournamentComplete(Boolean(data.complete));
    setTournamentNotStarted(Boolean(data.notStarted));
    const schedule = (data.schedule || {}) as Record<number, string>;
    setRoundSchedule(schedule);
    setCurrentRoundEndsAt(data.currentRoundEndsAt ?? null);
    const drafts: Record<number, string> = {};
    for (const [k, v] of Object.entries(schedule)) {
      drafts[Number(k)] = toLocalInputValue(v);
    }
    setScheduleDrafts(drafts);
  };

  const loadNeighborhoods = async () => {
    const res = await fetch("/api/admin/neighborhoods");
    if (!res.ok) throw new Error("Failed to load neighborhoods");
    const data = await res.json();
    setNeighborhoods(data.neighborhoods);
  };

  const loadSettings = async () => {
    const res = await fetch("/api/admin/settings");
    if (!res.ok) throw new Error("Failed to load settings");
    const data = await res.json();
    setHuntStartsAt(toLocalInputValue(data.startsAt));
    setHuntEndsAt(toLocalInputValue(data.endsAt));
  };

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([
          loadUsers(),
          loadTeams(),
          loadChallenges(),
          loadTournament(),
          loadNeighborhoods(),
          loadSettings(),
        ]);
      } catch {
        setError("Failed to load admin data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const patchUser = async (
    id: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to update user");
      return false;
    }
    const data = await res.json();
    setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
    return true;
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/create-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTeamName,
          emoji: newTeamEmoji,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to create team");
        return;
      }
      setNewTeamName("");
      setNewTeamEmoji("");
      await loadTeams();
      alert("Team created successfully!");
    } catch {
      alert("Failed to create team");
    }
  };

  const handleUpdateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChallenge) return;

    try {
      const res = await fetch("/api/admin/update-challenge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingChallenge.id,
          title: editingChallenge.title,
          prompt: editingChallenge.prompt,
          pts: editingChallenge.pts,
          lat: editingChallenge.lat,
          lng: editingChallenge.lng,
          numWinners: editingChallenge.numWinners,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update challenge");
        return;
      }
      setEditingChallenge(null);
      await loadChallenges();
      alert("Challenge updated successfully!");
    } catch {
      alert("Failed to update challenge");
    }
  };

  const handleImportCSV = async () => {
    if (!csvFile) {
      alert("Please select a CSV file");
      return;
    }
    try {
      const csvContent = await csvFile.text();
      const res = await fetch("/api/admin/import-challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to import challenges");
        return;
      }
      const data = await res.json();
      setCsvFile(null);
      await loadChallenges();
      alert(data.message || "Challenges imported successfully!");
    } catch {
      alert("Failed to import challenges");
    }
  };

  const handleDeleteChallenge = async (
    challengeId: string,
    challengeTitle: string,
  ) => {
    if (
      !confirm(
        `Are you sure you want to delete "${challengeTitle}"? This can only be done if there are no submissions for this challenge.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/api/admin/delete-challenge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to delete challenge");
        return;
      }
      await loadChallenges();
      alert("Challenge deleted successfully!");
    } catch {
      alert("Failed to delete challenge");
    }
  };

  const handleCloseRound = async () => {
    if (
      !confirm(
        "Close the current round and advance winners to the next round?",
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/api/admin/tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "closeRound" }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to close round");
        return;
      }
      await loadTournament();
      if (data.complete) {
        alert("Tournament complete!");
      } else {
        alert("Round closed. Next round matchups created.");
      }
    } catch {
      alert("Failed to close round");
    }
  };

  const handleInitializeTournament = async () => {
    if (
      !confirm(
        "Ensure SF neighborhoods exist and open Round 1 for all of them (any count; odd N gets a bye)?",
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/api/admin/tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "initialize" }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to initialize tournament");
        return;
      }
      await loadTournament();
      alert(
        `Bracket ready — ${data.entrants ?? "?"} entrants, ${data.created} matchups` +
          (data.byes ? `, ${data.byes} bye(s)` : ""),
      );
    } catch {
      alert("Failed to initialize tournament");
    }
  };


  const handleResetTournament = async () => {
    if (
      !confirm(
        "Reset the tournament? This deletes all matchups and votes but keeps neighborhood names/emojis. You can re-initialize afterward.",
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/api/admin/tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to reset tournament");
        return;
      }
      await Promise.all([loadTournament(), loadNeighborhoods()]);
      alert(
        `Reset complete — removed ${data.deletedMatchups ?? 0} matchups and ${data.deletedVotes ?? 0} votes.`,
      );
    } catch {
      alert("Failed to reset tournament");
    }
  };

  const handleCreateNeighborhood = async () => {
    const name = newNeighborhoodName.trim();
    if (!name) {
      alert("Name is required");
      return;
    }
    try {
      const res = await fetch("/api/admin/neighborhoods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          emoji: newNeighborhoodEmoji.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to create neighborhood");
        return;
      }
      setNewNeighborhoodName("");
      setNewNeighborhoodEmoji("");
      await loadNeighborhoods();
    } catch {
      alert("Failed to create neighborhood");
    }
  };

  const handleUpdateNeighborhood = async (
    id: string,
    patch: { name?: string; emoji?: string | null },
  ) => {
    try {
      const res = await fetch("/api/admin/neighborhoods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to update neighborhood");
        return false;
      }
      setNeighborhoods((prev) =>
        prev.map((n) => (n.id === id ? data.neighborhood : n)),
      );
      return true;
    } catch {
      alert("Failed to update neighborhood");
      return false;
    }
  };

  const handleDeleteNeighborhood = async (id: string, name: string) => {
    if (!confirm(`Delete neighborhood “${name}”?`)) return;
    try {
      const res = await fetch(`/api/admin/neighborhoods?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Failed to delete neighborhood");
        return;
      }
      await loadNeighborhoods();
    } catch {
      alert("Failed to delete neighborhood");
    }
  };

  const handleSaveRoundSchedule = async (round: number) => {
    const local = scheduleDrafts[round];
    if (!local) {
      alert("Pick an end date/time first");
      return;
    }
    const endsAt = new Date(local);
    if (Number.isNaN(endsAt.getTime())) {
      alert("Invalid datetime");
      return;
    }
    try {
      const res = await fetch("/api/admin/tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setRoundSchedule",
          round,
          endsAt: endsAt.toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to save schedule");
        return;
      }
      await loadTournament();
      alert(`Round ${round} will auto-close at ${endsAt.toLocaleString()}`);
    } catch {
      alert("Failed to save schedule");
    }
  };

  const handleSaveHuntSettings = async () => {
    if (!huntStartsAt || !huntEndsAt) {
      alert("Both start and end times are required");
      return;
    }
    const startsAt = new Date(huntStartsAt);
    const endsAt = new Date(huntEndsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      alert("Invalid datetime");
      return;
    }
    setSettingsBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to save settings");
        return;
      }
      setHuntStartsAt(toLocalInputValue(data.startsAt));
      setHuntEndsAt(toLocalInputValue(data.endsAt));
      alert("Hunt window saved");
    } catch {
      alert("Failed to save settings");
    } finally {
      setSettingsBusy(false);
    }
  };

  const confirmAdminToggle = async () => {
    if (!pendingAdminToggle) return;
    const { user: target, nextValue } = pendingAdminToggle;
    await patchUser(target.id, { isAdmin: nextValue });
    setPendingAdminToggle(null);
    adminConfirm.onClose();
  };

  if (loading) {
    return (
      <NavContainer title="Admin">
        <Text>Loading...</Text>
      </NavContainer>
    );
  }

  if (error) {
    return (
      <NavContainer title="Admin">
        <Text color="red.600">{error}</Text>
      </NavContainer>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "users", label: "Users" },
    { id: "teams", label: "Teams" },
    { id: "challenges", label: "Challenges" },
    { id: "tournament", label: "Tournament" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <NavContainer title="Admin">
      <VStack align="stretch" spacing={6} width="100%">
        <Heading size="lg">Admin</Heading>

        <HStack spacing={2} flexWrap="wrap">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              size="sm"
              variant={activeTab === tab.id ? "solid" : "outline"}
              colorScheme="blue"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </HStack>

        {activeTab === "users" && (
          <Box
            bg="white"
            borderRadius="md"
            boxShadow="sm"
            overflowX="auto"
            width="100%"
          >
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Phone</Th>
                  <Th>Team</Th>
                  <Th>Intent</Th>
                  <Th>Team prefs</Th>
                  <Th>Compete</Th>
                  <Th>Active</Th>
                  <Th>Admin</Th>
                  <Th>Created</Th>
                  <Th>Last seen</Th>
                  <Th>Subs</Th>
                  <Th>Votes</Th>
                </Tr>
              </Thead>
              <Tbody>
                {users.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <Input
                        size="sm"
                        defaultValue={u.name}
                        onBlur={async (e) => {
                          const next = e.target.value.trim();
                          if (next && next !== u.name) {
                            await patchUser(u.id, { name: next });
                          }
                        }}
                      />
                    </Td>
                    <Td>
                      <Input
                        size="sm"
                        defaultValue={u.email}
                        onBlur={async (e) => {
                          const next = e.target.value.trim();
                          if (next && next !== u.email) {
                            await patchUser(u.id, { email: next });
                          }
                        }}
                      />
                    </Td>
                    <Td>
                      <Input
                        size="sm"
                        defaultValue={u.phoneE164}
                        onBlur={async (e) => {
                          const next = e.target.value.trim();
                          if (next && next !== u.phoneE164) {
                            await patchUser(u.id, { phone: next });
                          }
                        }}
                      />
                    </Td>
                    <Td minW="140px">
                      <Select
                        size="sm"
                        value={u.teamId ?? ""}
                        onChange={async (e) => {
                          const value = e.target.value;
                          await patchUser(u.id, {
                            teamId: value === "" ? null : value,
                          });
                        }}
                      >
                        <option value="">No team</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.emoji} {t.name}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td whiteSpace="nowrap">
                      {u.intent || (u.surveyCompletedAt ? "—" : "not done")}
                    </Td>
                    <Td maxW="180px">
                      <Text fontSize="xs" noOfLines={2} title={u.teamPreferences || ""}>
                        {u.teamPreferences || "—"}
                      </Text>
                    </Td>
                    <Td maxW="120px">
                      <Text fontSize="xs" noOfLines={2} title={u.competitiveness || ""}>
                        {u.competitiveness || "—"}
                      </Text>
                    </Td>
                    <Td>
                      <Switch
                        isChecked={u.isActive}
                        colorScheme="green"
                        onChange={async (e) => {
                          await patchUser(u.id, {
                            isActive: e.target.checked,
                          });
                        }}
                      />
                    </Td>
                    <Td>
                      <Switch
                        isChecked={u.isAdmin}
                        colorScheme="purple"
                        isDisabled={u.id === user.id && u.isAdmin}
                        onChange={(e) => {
                          setPendingAdminToggle({
                            user: u,
                            nextValue: e.target.checked,
                          });
                          adminConfirm.onOpen();
                        }}
                      />
                    </Td>
                    <Td whiteSpace="nowrap">{formatDate(u.createdAt)}</Td>
                    <Td whiteSpace="nowrap">{formatDate(u.lastSeenAt)}</Td>
                    <Td>{u._count.submissions}</Td>
                    <Td>{u._count.votes}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}

        {activeTab === "teams" && (
          <VStack align="stretch" spacing={6}>
            <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
              <Heading size="md" mb={4}>
                All Teams
              </Heading>
              <Box overflowX="auto">
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th>Team</Th>
                      <Th>Members</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {teams.map((team) => (
                      <Tr key={team.id}>
                        <Td>
                          <Text fontWeight="semibold">
                            {team.emoji} {team.name}
                          </Text>
                        </Td>
                        <Td>
                          {(team.users ?? []).length === 0 ? (
                            <Text color="gray.500">No members</Text>
                          ) : (
                            (team.users ?? []).map((m) => (
                              <Text key={m.id} fontSize="sm">
                                {m.name} ({m.email})
                              </Text>
                            ))
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </Box>

            <Box bg="white" p={4} borderRadius="md" boxShadow="sm" maxW="420px">
              <Heading size="md" mb={4}>
                Create Team
              </Heading>
              <form onSubmit={handleCreateTeam}>
                <VStack align="stretch" spacing={3}>
                  <FormControl isRequired>
                    <FormLabel>Name</FormLabel>
                    <Input
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="Team name"
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>Emoji</FormLabel>
                    <Input
                      value={newTeamEmoji}
                      onChange={(e) => setNewTeamEmoji(e.target.value)}
                      placeholder="🚀"
                    />
                  </FormControl>
                  <Button type="submit" colorScheme="blue">
                    Create Team
                  </Button>
                </VStack>
              </form>
            </Box>
          </VStack>
        )}

        {activeTab === "challenges" && (
          <VStack align="stretch" spacing={6}>
            <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
              <Heading size="md" mb={4}>
                All Challenges
              </Heading>
              <Box overflowX="auto">
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th>Title</Th>
                      <Th>Points</Th>
                      <Th>Lat</Th>
                      <Th>Lng</Th>
                      <Th>Winners</Th>
                      <Th>Actions</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {challenges.map((challenge) => (
                      <Tr key={challenge.id}>
                        <Td>{challenge.title}</Td>
                        <Td>{challenge.pts}</Td>
                        <Td>{challenge.lat.toFixed(4)}</Td>
                        <Td>{challenge.lng.toFixed(4)}</Td>
                        <Td>{challenge.numWinners}</Td>
                        <Td>
                          <HStack>
                            <Button
                              size="xs"
                              colorScheme="blue"
                              onClick={() => setEditingChallenge(challenge)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="xs"
                              colorScheme="red"
                              onClick={() =>
                                handleDeleteChallenge(
                                  challenge.id,
                                  challenge.title,
                                )
                              }
                            >
                              Delete
                            </Button>
                          </HStack>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </Box>

            <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
              <Heading size="md" mb={4}>
                Import Challenges from CSV
              </Heading>
              <HStack flexWrap="wrap" spacing={3}>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  maxW="320px"
                  p={1}
                />
                <Button
                  colorScheme="blue"
                  onClick={handleImportCSV}
                  isDisabled={!csvFile}
                >
                  Import CSV
                </Button>
              </HStack>
              <Text mt={2} fontSize="sm" color="gray.600">
                CSV format: title, prompt, pts, (ignored), lat, lng, numWinners
              </Text>
            </Box>
          </VStack>
        )}

        {activeTab === "tournament" && (
          <VStack align="stretch" spacing={4}>
            <Flex
              justify="space-between"
              align="center"
              flexWrap="wrap"
              gap={3}
            >
              <Box>
                <Heading size="md">
                  {tournamentNotStarted
                    ? "Tournament not started"
                    : tournamentComplete
                      ? "Tournament complete"
                      : currentRound != null
                        ? `Round ${currentRound}`
                        : "No open matchups"}
                </Heading>
                <Text fontSize="sm" color="gray.600">
                  {tournamentNotStarted
                    ? "Prod has no matchups yet — initialize Round 1 to show the bracket on the home page."
                    : currentRoundEndsAt
                      ? `Will auto-close at ${new Date(currentRoundEndsAt).toLocaleString()} (lazy on page load / vote).`
                      : "Vote tallies for current open matchups. Set a round end time below for auto-close."}
                </Text>
              </Box>
              <HStack spacing={2} flexWrap="wrap">
                {tournamentNotStarted ? (
                  <Button colorScheme="green" onClick={handleInitializeTournament}>
                    Initialize bracket
                  </Button>
                ) : (
                  <Button
                    colorScheme="orange"
                    onClick={handleCloseRound}
                    isDisabled={matchups.length === 0 || tournamentComplete}
                  >
                    Close round &amp; advance
                  </Button>
                )}
                {!tournamentNotStarted ? (
                  <Button
                    colorScheme="red"
                    variant="outline"
                    onClick={handleResetTournament}
                  >
                    Reset bracket
                  </Button>
                ) : null}
              </HStack>
            </Flex>


            <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
              <Heading size="sm" mb={2}>
                Neighborhoods ({neighborhoods.length})
              </Heading>
              <Text fontSize="sm" color="gray.600" mb={3}>
                Edit names and emojis anytime — changes show up on the live
                bracket. To include newly added neighborhoods in the bracket,
                reset then re-initialize.
              </Text>
              <HStack mb={4} flexWrap="wrap" spacing={3} align="flex-end">
                <FormControl maxW="220px">
                  <FormLabel fontSize="xs">Name</FormLabel>
                  <Input
                    size="sm"
                    value={newNeighborhoodName}
                    onChange={(e) => setNewNeighborhoodName(e.target.value)}
                    placeholder="e.g. Mission"
                  />
                </FormControl>
                <FormControl maxW="100px">
                  <FormLabel fontSize="xs">Emoji</FormLabel>
                  <Input
                    size="sm"
                    value={newNeighborhoodEmoji}
                    onChange={(e) => setNewNeighborhoodEmoji(e.target.value)}
                    placeholder="🌉"
                  />
                </FormControl>
                <Button size="sm" colorScheme="blue" onClick={handleCreateNeighborhood}>
                  Add neighborhood
                </Button>
              </HStack>
              <Box overflowX="auto">
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th>Emoji</Th>
                      <Th>Name</Th>
                      <Th>In bracket</Th>
                      <Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {neighborhoods.map((n) => (
                      <Tr key={n.id}>
                        <Td width="90px">
                          <Input
                            size="sm"
                            defaultValue={n.emoji ?? ""}
                            placeholder={n.displayEmoji}
                            onBlur={async (e) => {
                              const next = e.target.value.trim() || null;
                              if ((n.emoji || null) !== next) {
                                await handleUpdateNeighborhood(n.id, {
                                  emoji: next,
                                });
                              }
                            }}
                          />
                        </Td>
                        <Td minW="180px">
                          <Input
                            size="sm"
                            defaultValue={n.name}
                            onBlur={async (e) => {
                              const next = e.target.value.trim();
                              if (next && next !== n.name) {
                                await handleUpdateNeighborhood(n.id, {
                                  name: next,
                                });
                              }
                            }}
                          />
                        </Td>
                        <Td whiteSpace="nowrap">
                          {n.matchupCount > 0
                            ? `${n.matchupCount} matchup(s)`
                            : "—"}
                        </Td>
                        <Td>
                          <Button
                            size="xs"
                            variant="ghost"
                            colorScheme="red"
                            isDisabled={n.matchupCount > 0}
                            onClick={() =>
                              handleDeleteNeighborhood(n.id, n.name)
                            }
                          >
                            Delete
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </Box>

            <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
              <Heading size="sm" mb={3}>
                Round end schedule
              </Heading>
              <Text fontSize="sm" color="gray.600" mb={3}>
                When a round&apos;s end time passes, the next page load or vote
                closes it and opens the next round. Admin can still close early.
              </Text>
              <VStack align="stretch" spacing={3}>
                {Array.from(
                  {
                    length: Math.max(
                      4,
                      currentRound ?? 1,
                      ...Object.keys(roundSchedule).map(Number),
                      0,
                    ),
                  },
                  (_, i) => i + 1,
                ).map((round) => (
                  <HStack key={round} flexWrap="wrap" spacing={3}>
                    <Text minW="80px" fontWeight="medium">
                      Round {round}
                    </Text>
                    <Input
                      type="datetime-local"
                      size="sm"
                      maxW="240px"
                      value={scheduleDrafts[round] ?? ""}
                      onChange={(e) =>
                        setScheduleDrafts((prev) => ({
                          ...prev,
                          [round]: e.target.value,
                        }))
                      }
                    />
                    <Button
                      size="sm"
                      colorScheme="blue"
                      onClick={() => handleSaveRoundSchedule(round)}
                    >
                      Save
                    </Button>
                    {roundSchedule[round] ? (
                      <Text fontSize="xs" color="gray.500">
                        Saved: {new Date(roundSchedule[round]).toLocaleString()}
                      </Text>
                    ) : (
                      <Text fontSize="xs" color="gray.400">
                        Not scheduled
                      </Text>
                    )}
                  </HStack>
                ))}
              </VStack>
            </Box>

            <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
              {matchups.length === 0 ? (
                <Text color="gray.500">
                  {tournamentNotStarted
                    ? "No matchups yet. Click “Initialize bracket” to seed SF neighborhoods and Round 1."
                    : tournamentComplete
                      ? "No open matchups — tournament is finished."
                      : "No open matchups yet."}
                </Text>
              ) : (
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th>Matchup</Th>
                      <Th>Votes A</Th>
                      <Th>Votes B</Th>
                      <Th>Total</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {matchups.map((m) => (
                      <Tr key={m.id}>
                        <Td>
                          <Text fontWeight="medium">
                            {m.slotA.name} vs {m.slotB.name}
                          </Text>
                        </Td>
                        <Td>
                          {m.slotA.name}: {m.votes[m.slotA.id] ?? 0}
                        </Td>
                        <Td>
                          {m.slotB.name}: {m.votes[m.slotB.id] ?? 0}
                        </Td>
                        <Td>{m.totalVotes}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </Box>
          </VStack>
        )}

        {activeTab === "settings" && (
          <Box bg="white" p={4} borderRadius="md" boxShadow="sm" maxW="520px">
            <Heading size="md" mb={2}>
              Hunt window
            </Heading>
            <Text fontSize="sm" color="gray.600" mb={4}>
              Controls when the home page switches from pre-hunt (tournament)
              to the live hunt. Separate from tournament round deadlines.
            </Text>
            <VStack align="stretch" spacing={4}>
              <FormControl>
                <FormLabel>Hunt starts at</FormLabel>
                <Input
                  type="datetime-local"
                  value={huntStartsAt}
                  onChange={(e) => setHuntStartsAt(e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Hunt ends at</FormLabel>
                <Input
                  type="datetime-local"
                  value={huntEndsAt}
                  onChange={(e) => setHuntEndsAt(e.target.value)}
                />
              </FormControl>
              <Button
                colorScheme="blue"
                onClick={handleSaveHuntSettings}
                isLoading={settingsBusy}
                alignSelf="flex-start"
              >
                Save hunt times
              </Button>
            </VStack>
          </Box>
        )}
      </VStack>

      <Modal
        isOpen={!!editingChallenge}
        onClose={() => setEditingChallenge(null)}
        size="lg"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Edit Challenge</ModalHeader>
          <ModalCloseButton />
          {editingChallenge && (
            <form onSubmit={handleUpdateChallenge}>
              <ModalBody>
                <VStack spacing={3} align="stretch">
                  <FormControl isRequired>
                    <FormLabel>Title</FormLabel>
                    <Input
                      value={editingChallenge.title}
                      onChange={(e) =>
                        setEditingChallenge({
                          ...editingChallenge,
                          title: e.target.value,
                        })
                      }
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>Prompt</FormLabel>
                    <Textarea
                      value={editingChallenge.prompt}
                      onChange={(e) =>
                        setEditingChallenge({
                          ...editingChallenge,
                          prompt: e.target.value,
                        })
                      }
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>Points</FormLabel>
                    <Input
                      type="number"
                      value={editingChallenge.pts}
                      onChange={(e) =>
                        setEditingChallenge({
                          ...editingChallenge,
                          pts: Number(e.target.value),
                        })
                      }
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>Latitude</FormLabel>
                    <Input
                      type="number"
                      step="any"
                      value={editingChallenge.lat}
                      onChange={(e) =>
                        setEditingChallenge({
                          ...editingChallenge,
                          lat: Number(e.target.value),
                        })
                      }
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>Longitude</FormLabel>
                    <Input
                      type="number"
                      step="any"
                      value={editingChallenge.lng}
                      onChange={(e) =>
                        setEditingChallenge({
                          ...editingChallenge,
                          lng: Number(e.target.value),
                        })
                      }
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>Number of Winners</FormLabel>
                    <Input
                      type="number"
                      value={editingChallenge.numWinners}
                      onChange={(e) =>
                        setEditingChallenge({
                          ...editingChallenge,
                          numWinners: Number(e.target.value),
                        })
                      }
                    />
                  </FormControl>
                </VStack>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="ghost"
                  mr={3}
                  onClick={() => setEditingChallenge(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" colorScheme="blue">
                  Save Changes
                </Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>

      <Modal
        isOpen={adminConfirm.isOpen}
        onClose={() => {
          setPendingAdminToggle(null);
          adminConfirm.onClose();
        }}
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {pendingAdminToggle?.nextValue
              ? "Grant admin access?"
              : "Remove admin access?"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>
              {pendingAdminToggle
                ? pendingAdminToggle.nextValue
                  ? `Make ${pendingAdminToggle.user.name} (${pendingAdminToggle.user.email}) an admin?`
                  : `Remove admin privileges from ${pendingAdminToggle.user.name} (${pendingAdminToggle.user.email})?`
                : null}
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="ghost"
              mr={3}
              onClick={() => {
                setPendingAdminToggle(null);
                adminConfirm.onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              colorScheme={pendingAdminToggle?.nextValue ? "purple" : "red"}
              onClick={confirmAdminToggle}
            >
              Confirm
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </NavContainer>
  );
}
