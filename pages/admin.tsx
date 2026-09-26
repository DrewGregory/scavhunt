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
import AdminMapPanel from "../components/AdminMapPanel";
import dynamic from "next/dynamic";

// react-leaflet touches `window` — must load client-side only.
const ChallengeLocationPicker = dynamic(
  () => import("../components/ChallengeLocationPicker"),
  {
    ssr: false,
    loading: () => (
      <Text fontSize="sm" color="gray.500">
        Loading map picker…
      </Text>
    ),
  },
);

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
  timeCommitment: string | null;
  surveyCompletedAt: string | null;
  team: { id: string; name: string; emoji: string } | null;
  _count: { submissions: number };
};

type AdminTeam = SerializedTeam & {
  bonusPoints?: number;
  earned?: number;
  deposited?: number;
  score?: number;
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

type AdminNeighborhood = {
  id: string;
  name: string;
  emoji: string | null;
  displayEmoji: string;
  createdAt: string;
  onMap?: boolean;
  hasBoundary?: boolean;
  boundary?: unknown;
  centerLat?: number | null;
  centerLng?: number | null;
};

type Tab = "users" | "teams" | "challenges" | "map" | "settings";

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
  const [neighborhoods, setNeighborhoods] = useState<AdminNeighborhood[]>([]);
  const [huntStartsAt, setHuntStartsAt] = useState("");
  const [huntEndsAt, setHuntEndsAt] = useState("");
  const [territoryEnabled, setTerritoryEnabled] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [seedBusy, setSeedBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamEmoji, setNewTeamEmoji] = useState("");
  const [pointDrafts, setPointDrafts] = useState<Record<string, string>>({});
  const [pointsBusyId, setPointsBusyId] = useState<string | null>(null);

  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(
    null,
  );
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [newChallenge, setNewChallenge] = useState<Challenge | null>(null);

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
    setTerritoryEnabled(Boolean(data.territoryEnabled));
  };

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([
          loadUsers(),
          loadTeams(),
          loadChallenges(),
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

  const handleCreateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChallenge) return;

    try {
      const res = await fetch("/api/admin/update-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newChallenge.title,
          prompt: newChallenge.prompt,
          pts: newChallenge.pts,
          lat: newChallenge.lat,
          lng: newChallenge.lng,
          numWinners: newChallenge.numWinners,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to create challenge");
        return;
      }
      setNewChallenge(null);
      await loadChallenges();
    } catch {
      alert("Failed to create challenge");
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

  const handleSeedDemoData = async () => {
    if (
      !confirm(
        "Create/update 4 demo teams with 8 fake players (idempotent). Continue?",
      )
    ) {
      return;
    }
    setSeedBusy(true);
    try {
      const res = await fetch("/api/admin/seed-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Seed failed");
        return;
      }
      await Promise.all([loadUsers(), loadTeams()]);
      alert(
        `Demo data ready.\nTeams created ${data.teamsCreated}, updated ${data.teamsUpdated}.\nUsers created ${data.usersCreated}, updated ${data.usersUpdated}.`,
      );
    } catch {
      alert("Seed failed");
    } finally {
      setSeedBusy(false);
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
          territoryEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to save settings");
        return;
      }
      setHuntStartsAt(toLocalInputValue(data.startsAt));
      setHuntEndsAt(toLocalInputValue(data.endsAt));
      setTerritoryEnabled(Boolean(data.territoryEnabled));
      alert("Settings saved");
    } catch {
      alert("Failed to save settings");
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleTeamPatch = async (
    teamId: string,
    patch: { name?: string; emoji?: string; color?: string },
  ) => {
    try {
      const res = await fetch("/api/admin/teams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: teamId, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to update team");
        return;
      }
      setTeams((prev) =>
        prev.map((t) =>
          t.id === teamId
            ? {
                ...t,
                ...(patch.name != null ? { name: patch.name } : {}),
                ...(patch.emoji != null ? { emoji: patch.emoji } : {}),
                ...(patch.color != null ? { color: patch.color } : {}),
              }
            : t,
        ),
      );
    } catch {
      alert("Failed to update team");
    }
  };

  const handleTeamColorChange = async (teamId: string, color: string) => {
    await handleTeamPatch(teamId, { color });
  };

  const handleAdjustPoints = async (teamId: string, sign: 1 | -1) => {
    const raw = pointDrafts[teamId] ?? "";
    const amount = Math.floor(Number(raw));
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Enter a positive number of points");
      return;
    }
    const delta = sign * amount;
    setPointsBusyId(teamId);
    try {
      const res = await fetch("/api/admin/team-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, delta }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to adjust points");
        return;
      }
      setTeams((prev) =>
        prev.map((t) =>
          t.id === teamId
            ? {
                ...t,
                bonusPoints: data.team.bonusPoints,
                score: data.score.score,
                earned: data.score.earned,
                deposited: data.score.deposited,
              }
            : t,
        ),
      );
      setPointDrafts((prev) => ({ ...prev, [teamId]: "" }));
    } catch {
      alert("Failed to adjust points");
    } finally {
      setPointsBusyId(null);
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
    { id: "map", label: "Map" },
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
                  <Th>Time</Th>
                  <Th>Active</Th>
                  <Th>Admin</Th>
                  <Th>Created</Th>
                  <Th>Last seen</Th>
                  <Th>Subs</Th>
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
                    <Td minW="110px">
                      <Select
                        size="sm"
                        value={u.intent ?? ""}
                        onChange={async (e) => {
                          const value = e.target.value;
                          await patchUser(u.id, {
                            intent: value === "" ? null : value,
                          });
                        }}
                      >
                        <option value="">
                          {u.surveyCompletedAt ? "—" : "not done"}
                        </option>
                        <option value="playing">playing</option>
                        <option value="browsing">browsing</option>
                      </Select>
                    </Td>
                    <Td maxW="180px">
                      <Input
                        size="sm"
                        defaultValue={u.teamPreferences || ""}
                        placeholder="—"
                        onBlur={async (e) => {
                          const next = e.target.value.trim();
                          const prev = u.teamPreferences || "";
                          if (next !== prev) {
                            await patchUser(u.id, {
                              teamPreferences: next === "" ? null : next,
                            });
                          }
                        }}
                      />
                    </Td>
                    <Td maxW="120px">
                      <Input
                        size="sm"
                        defaultValue={u.competitiveness || ""}
                        placeholder="—"
                        onBlur={async (e) => {
                          const next = e.target.value.trim();
                          const prev = u.competitiveness || "";
                          if (next !== prev) {
                            await patchUser(u.id, {
                              competitiveness: next === "" ? null : next,
                            });
                          }
                        }}
                      />
                    </Td>
                    <Td maxW="160px">
                      <Input
                        size="sm"
                        defaultValue={u.timeCommitment || ""}
                        placeholder="—"
                        onBlur={async (e) => {
                          const next = e.target.value.trim();
                          const prev = u.timeCommitment || "";
                          if (next !== prev) {
                            await patchUser(u.id, {
                              timeCommitment: next === "" ? null : next,
                            });
                          }
                        }}
                      />
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
                      <Th>Color</Th>
                      <Th>Points</Th>
                      <Th>Adjust</Th>
                      <Th>Members</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {teams.map((team) => (
                      <Tr key={team.id}>
                    <Td>
                      <HStack spacing={1}>
                        <Input
                          size="sm"
                          maxW="52px"
                          defaultValue={team.emoji}
                          aria-label={`Emoji for ${team.name}`}
                          onBlur={async (e) => {
                            const next = e.target.value.trim();
                            if (next && next !== team.emoji) {
                              await handleTeamPatch(team.id, { emoji: next });
                            }
                          }}
                        />
                        <Input
                          size="sm"
                          defaultValue={team.name}
                          aria-label={`Name for ${team.name}`}
                          onBlur={async (e) => {
                            const next = e.target.value.trim();
                            if (next && next !== team.name) {
                              await handleTeamPatch(team.id, { name: next });
                            }
                          }}
                        />
                      </HStack>
                    </Td>
                        <Td>
                          <HStack>
                            <input
                              type="color"
                              value={team.color || "#3182CE"}
                              onChange={(e) =>
                                void handleTeamColorChange(
                                  team.id,
                                  e.target.value,
                                )
                              }
                              style={{
                                width: 36,
                                height: 28,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                              aria-label={`Color for ${team.name}`}
                            />
                            <Text fontSize="xs" color="gray.500">
                              {team.color || "#3182CE"}
                            </Text>
                          </HStack>
                        </Td>
                        <Td>
                          <Text fontWeight="semibold">
                            {team.score ?? "—"}
                          </Text>
                          <Text fontSize="xs" color="gray.500">
                            earned {team.earned ?? 0}
                            {(team.bonusPoints ?? 0) !== 0
                              ? ` · bonus ${team.bonusPoints}`
                              : ""}
                            {(team.deposited ?? 0) > 0
                              ? ` · deposited ${team.deposited}`
                              : ""}
                          </Text>
                        </Td>
                        <Td>
                          <HStack>
                            <Input
                              type="number"
                              min={1}
                              size="sm"
                              maxW="80px"
                              placeholder="pts"
                              value={pointDrafts[team.id] ?? ""}
                              onChange={(e) =>
                                setPointDrafts((prev) => ({
                                  ...prev,
                                  [team.id]: e.target.value,
                                }))
                              }
                            />
                            <Button
                              size="sm"
                              colorScheme="green"
                              isLoading={pointsBusyId === team.id}
                              onClick={() => void handleAdjustPoints(team.id, 1)}
                            >
                              Give
                            </Button>
                            <Button
                              size="sm"
                              colorScheme="red"
                              variant="outline"
                              isLoading={pointsBusyId === team.id}
                              onClick={() =>
                                void handleAdjustPoints(team.id, -1)
                              }
                            >
                              Take
                            </Button>
                          </HStack>
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
              <HStack justify="space-between" mb={4} flexWrap="wrap" gap={2}>
                <Heading size="md">All Challenges</Heading>
                <Button
                  size="sm"
                  colorScheme="green"
                  onClick={() =>
                    setNewChallenge({
                      id: "",
                      title: "",
                      prompt: "",
                      pts: 10,
                      lat: null,
                      lng: null,
                      numWinners: 1,
                    })
                  }
                >
                  New Challenge
                </Button>
              </HStack>
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
                        <Td>
                          {challenge.lat != null
                            ? challenge.lat.toFixed(4)
                            : "—"}
                        </Td>
                        <Td>
                          {challenge.lng != null
                            ? challenge.lng.toFixed(4)
                            : "—"}
                        </Td>
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
                CSV format: title, prompt, pts, lat, lng, numWinners (one
                challenge per line; a legacy 7-column format with an extra
                ignored column is still accepted)
              </Text>
            </Box>
          </VStack>
        )}

        {activeTab === "map" && (
          <AdminMapPanel
            neighborhoods={neighborhoods.map((n) => ({
              id: n.id,
              name: n.name,
              emoji: n.emoji,
              displayEmoji: n.displayEmoji,
              onMap: n.onMap ?? false,
              hasBoundary: n.hasBoundary ?? false,
              boundary: n.boundary ?? null,
              centerLat: n.centerLat ?? null,
              centerLng: n.centerLng ?? null,
            }))}
            onReload={loadNeighborhoods}
          />
        )}

        {activeTab === "settings" && (
          <VStack align="stretch" spacing={6} maxW="520px">
            <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
              <Heading size="md" mb={2}>
                Hunt window
              </Heading>
              <Text fontSize="sm" color="gray.600" mb={4}>
                Controls when the home page switches from pre-hunt countdown to the live hunt.
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
              </VStack>
            </Box>

            <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
              <Heading size="md" mb={2}>
                Territory mode
              </Heading>
              <Text fontSize="sm" color="gray.600" mb={4}>
                When enabled, players immediately see neighborhood polygons on
                the map, can deposit points into them, and get a territory
                leaderboard. Leave this off until you&apos;re ready for the
                mid-hunt switch — admins can still prep boundaries on the Map
                tab.
              </Text>
              <FormControl display="flex" alignItems="center">
                <FormLabel htmlFor="territory-enabled" mb="0">
                  Territory enabled for players
                </FormLabel>
                <Switch
                  id="territory-enabled"
                  isChecked={territoryEnabled}
                  onChange={(e) => setTerritoryEnabled(e.target.checked)}
                  colorScheme="blue"
                />
              </FormControl>
            </Box>

            <Button
              colorScheme="blue"
              onClick={handleSaveHuntSettings}
              isLoading={settingsBusy}
              alignSelf="flex-start"
            >
              Save settings
            </Button>

            <Box bg="white" p={4} borderRadius="md" boxShadow="sm">
              <Heading size="md" mb={2}>
                Demo data
              </Heading>
              <Text fontSize="sm" color="gray.600" mb={4}>
                Upserts 4 fake teams and 8 players with disposable emails /
                phone numbers so you can simulate territory deposits. Safe to
                click again — existing demo rows are updated, not duplicated.
              </Text>
              <Button
                colorScheme="purple"
                variant="outline"
                onClick={handleSeedDemoData}
                isLoading={seedBusy}
              >
                Seed demo teams &amp; users
              </Button>
            </Box>
          </VStack>
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
                  <FormControl>
                    <FormLabel>Latitude (optional)</FormLabel>
                    <Input
                      type="number"
                      step="any"
                      value={editingChallenge.lat ?? ""}
                      placeholder="Leave empty to draft"
                      onChange={(e) =>
                        setEditingChallenge({
                          ...editingChallenge,
                          lat:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Longitude (optional)</FormLabel>
                    <Input
                      type="number"
                      step="any"
                      value={editingChallenge.lng ?? ""}
                      placeholder="Leave empty to draft"
                      onChange={(e) =>
                        setEditingChallenge({
                          ...editingChallenge,
                          lng:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </FormControl>
                  <ChallengeLocationPicker
                    lat={editingChallenge.lat}
                    lng={editingChallenge.lng}
                    onChange={(lat, lng) =>
                      setEditingChallenge({ ...editingChallenge, lat, lng })
                    }
                  />
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
        isOpen={!!newChallenge}
        onClose={() => setNewChallenge(null)}
        size="lg"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>New Challenge</ModalHeader>
          <ModalCloseButton />
          {newChallenge && (
            <form onSubmit={handleCreateChallenge}>
              <ModalBody>
                <VStack spacing={3} align="stretch">
                  <FormControl isRequired>
                    <FormLabel>Title</FormLabel>
                    <Input
                      value={newChallenge.title}
                      onChange={(e) =>
                        setNewChallenge({
                          ...newChallenge,
                          title: e.target.value,
                        })
                      }
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Prompt</FormLabel>
                    <Textarea
                      value={newChallenge.prompt}
                      onChange={(e) =>
                        setNewChallenge({
                          ...newChallenge,
                          prompt: e.target.value,
                        })
                      }
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>Points</FormLabel>
                    <Input
                      type="number"
                      value={newChallenge.pts}
                      onChange={(e) =>
                        setNewChallenge({
                          ...newChallenge,
                          pts: Number(e.target.value),
                        })
                      }
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Latitude (optional)</FormLabel>
                    <Input
                      type="number"
                      step="any"
                      value={newChallenge.lat ?? ""}
                      placeholder="Leave empty to draft"
                      onChange={(e) =>
                        setNewChallenge({
                          ...newChallenge,
                          lat:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Longitude (optional)</FormLabel>
                    <Input
                      type="number"
                      step="any"
                      value={newChallenge.lng ?? ""}
                      placeholder="Leave empty to draft"
                      onChange={(e) =>
                        setNewChallenge({
                          ...newChallenge,
                          lng:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </FormControl>
                  <ChallengeLocationPicker
                    lat={newChallenge.lat}
                    lng={newChallenge.lng}
                    onChange={(lat, lng) =>
                      setNewChallenge({ ...newChallenge, lat, lng })
                    }
                  />
                  <FormControl isRequired>
                    <FormLabel>Number of Winners</FormLabel>
                    <Input
                      type="number"
                      value={newChallenge.numWinners}
                      onChange={(e) =>
                        setNewChallenge({
                          ...newChallenge,
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
                  onClick={() => setNewChallenge(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" colorScheme="green">
                  Create Challenge
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
