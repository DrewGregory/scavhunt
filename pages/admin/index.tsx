import { useEffect, useMemo, useRef, useState } from "react";
import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import Link from "next/link";
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
  Text,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import NavContainer from "../../components/NavContainer";
import { publicUser, requireAdminSSP } from "../../lib/auth";
import type { SerializedChallenge, SerializedTeam } from "../../lib/types";
import AdminMapPanel from "../../components/AdminMapPanel";
import AdminDataTable, { type AdminColumn } from "../../components/AdminDataTable";
import dynamic from "next/dynamic";

// react-leaflet touches `window` — must load client-side only.
const AdminLocationMap = dynamic(
  () => import("../../components/AdminLocationMap"),
  {
    ssr: false,
    loading: () => (
      <Text fontSize="sm" color="gray.500">
        Loading map…
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
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamEmoji, setNewTeamEmoji] = useState("");
  const [pointDrafts, setPointDrafts] = useState<Record<string, string>>({});
  const [pointsBusyId, setPointsBusyId] = useState<string | null>(null);

  const noticeTimer = useRef<number | null>(null);
  const [locationChallenge, setLocationChallenge] = useState<Challenge | null>(
    null,
  );
  const [locationDraft, setLocationDraft] = useState<{
    lat: number | null;
    lng: number | null;
  }>({ lat: null, lng: null });
  const [locationBusy, setLocationBusy] = useState(false);
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

  const showNotice = (
    type: "success" | "error",
    message: string,
  ) => {
    setNotice({ type, message });
    window.clearTimeout(noticeTimer.current ?? undefined);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000);
  };

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
      showNotice("error", data.error || "Failed to update user");
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
        showNotice("error", data.error || "Failed to create team");
        return;
      }
      setNewTeamName("");
      setNewTeamEmoji("");
      await loadTeams();
      showNotice("success", "Team created successfully!");
    } catch {
      showNotice("error", "Failed to create team");
    }
  };

  const patchChallenge = async (
    id: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> => {
    const res = await fetch("/api/admin/update-challenge", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showNotice("error", data.error || "Failed to update challenge");
      return false;
    }
    const data = await res.json();
    if (data.challenge) {
      setChallenges((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...data.challenge } : c)),
      );
      setLocationChallenge((prev) =>
        prev && prev.id === id ? { ...prev, ...data.challenge } : prev,
      );
    }
    return true;
  };

  const handleCreateChallenge = async () => {
    const base = "New challenge";
    let title = base;
    let n = 2;
    const titles = new Set(challenges.map((c) => c.title));
    while (titles.has(title)) {
      title = `${base} ${n++}`;
    }
    try {
      const res = await fetch("/api/admin/update-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          prompt: " ",
          pts: 10,
          lat: null,
          lng: null,
          numWinners: 1,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        showNotice("error", data.error || "Failed to create challenge");
        return;
      }
      await loadChallenges();
    } catch {
      showNotice("error", "Failed to create challenge");
    }
  };

  const openLocationEditor = (challenge: Challenge) => {
    setLocationChallenge(challenge);
    setLocationDraft({ lat: challenge.lat, lng: challenge.lng });
  };

  const saveLocationEditor = async () => {
    if (!locationChallenge) return;
    setLocationBusy(true);
    try {
      const ok = await patchChallenge(locationChallenge.id, {
        lat: locationDraft.lat,
        lng: locationDraft.lng,
      });
      if (ok) setLocationChallenge(null);
    } finally {
      setLocationBusy(false);
    }
  };

  const handleImportCSV = async () => {
    if (!csvFile) {
      showNotice("error", "Please select a CSV file");
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
        showNotice("error", data.error || "Failed to import challenges");
        return;
      }
      const data = await res.json();
      setCsvFile(null);
      await loadChallenges();
      showNotice("success", data.message || "Challenges imported successfully!");
    } catch {
      showNotice("error", "Failed to import challenges");
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
        showNotice("error", data.error || "Failed to delete challenge");
        return;
      }
      await loadChallenges();
      showNotice("success", "Challenge deleted successfully!");
    } catch {
      showNotice("error", "Failed to delete challenge");
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
        showNotice("error", data.error || "Failed to update neighborhood");
        return false;
      }
      setNeighborhoods((prev) =>
        prev.map((n) => (n.id === id ? data.neighborhood : n)),
      );
      return true;
    } catch {
      showNotice("error", "Failed to update neighborhood");
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
        showNotice("error", data.error || "Seed failed");
        return;
      }
      await Promise.all([loadUsers(), loadTeams()]);
      showNotice(
        "success",
        `Demo data ready. Teams created ${data.teamsCreated}, updated ${data.teamsUpdated}. Users created ${data.usersCreated}, updated ${data.usersUpdated}.`,
      );
    } catch {
      showNotice("error", "Seed failed");
    } finally {
      setSeedBusy(false);
    }
  };

  const handleSaveHuntSettings = async () => {
    if (!huntStartsAt || !huntEndsAt) {
      showNotice("error", "Both start and end times are required");
      return;
    }
    const startsAt = new Date(huntStartsAt);
    const endsAt = new Date(huntEndsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      showNotice("error", "Invalid datetime");
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
        showNotice("error", data.error || "Failed to save settings");
        return;
      }
      setHuntStartsAt(toLocalInputValue(data.startsAt));
      setHuntEndsAt(toLocalInputValue(data.endsAt));
      setTerritoryEnabled(Boolean(data.territoryEnabled));
      showNotice("success", "Settings saved");
    } catch {
      showNotice("error", "Failed to save settings");
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
        showNotice("error", data.error || "Failed to update team");
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
      showNotice("error", "Failed to update team");
    }
  };

  const handleTeamColorChange = async (teamId: string, color: string) => {
    await handleTeamPatch(teamId, { color });
  };

  const handleAdjustPoints = async (teamId: string, sign: 1 | -1) => {
    const raw = pointDrafts[teamId] ?? "";
    const amount = Math.floor(Number(raw));
    if (!Number.isFinite(amount) || amount <= 0) {
      showNotice("error", "Enter a positive number of points");
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
        showNotice("error", data.error || "Failed to adjust points");
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
      showNotice("error", "Failed to adjust points");
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

  const userColumns: AdminColumn<AdminUser>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Name",
        minW: "120px",
        getSortValue: (u) => u.name,
        cell: (u) => (
          <Input
            size="sm"
            key={`name-${u.id}-${u.name}`}
            defaultValue={u.name}
            onBlur={async (e) => {
              const next = e.target.value.trim();
              if (next && next !== u.name) {
                await patchUser(u.id, { name: next });
              }
            }}
          />
        ),
      },
      {
        id: "email",
        header: "Email",
        minW: "160px",
        getSortValue: (u) => u.email,
        cell: (u) => (
          <Input
            size="sm"
            key={`email-${u.id}-${u.email}`}
            defaultValue={u.email}
            onBlur={async (e) => {
              const next = e.target.value.trim();
              if (next && next !== u.email) {
                await patchUser(u.id, { email: next });
              }
            }}
          />
        ),
      },
      {
        id: "phone",
        header: "Phone",
        minW: "130px",
        getSortValue: (u) => u.phoneE164,
        cell: (u) => (
          <Input
            size="sm"
            key={`phone-${u.id}-${u.phoneE164}`}
            defaultValue={u.phoneE164}
            onBlur={async (e) => {
              const next = e.target.value.trim();
              if (next && next !== u.phoneE164) {
                await patchUser(u.id, { phone: next });
              }
            }}
          />
        ),
      },
      {
        id: "team",
        header: "Team",
        minW: "140px",
        getSortValue: (u) => u.team?.name ?? "",
        getFilterValue: (u) =>
          u.team ? `${u.team.emoji} ${u.team.name}` : "No team",
        cell: (u) => (
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
        ),
      },
      {
        id: "intent",
        header: "Intent",
        minW: "110px",
        getSortValue: (u) => u.intent ?? "",
        cell: (u) => (
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
        ),
      },
      {
        id: "teamPreferences",
        header: "Team prefs",
        defaultVisible: false,
        minW: "160px",
        getSortValue: (u) => u.teamPreferences ?? "",
        cell: (u) => (
          <Input
            size="sm"
            key={`prefs-${u.id}-${u.teamPreferences ?? ""}`}
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
        ),
      },
      {
        id: "competitiveness",
        header: "Compete",
        defaultVisible: false,
        minW: "120px",
        getSortValue: (u) => u.competitiveness ?? "",
        cell: (u) => (
          <Input
            size="sm"
            key={`compete-${u.id}-${u.competitiveness ?? ""}`}
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
        ),
      },
      {
        id: "timeCommitment",
        header: "Time",
        defaultVisible: false,
        minW: "140px",
        getSortValue: (u) => u.timeCommitment ?? "",
        cell: (u) => (
          <Input
            size="sm"
            key={`time-${u.id}-${u.timeCommitment ?? ""}`}
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
        ),
      },
      {
        id: "isActive",
        header: "Active",
        getSortValue: (u) => u.isActive,
        cell: (u) => (
          <Switch
            isChecked={u.isActive}
            colorScheme="green"
            onChange={async (e) => {
              await patchUser(u.id, {
                isActive: e.target.checked,
              });
            }}
          />
        ),
      },
      {
        id: "isAdmin",
        header: "Admin",
        getSortValue: (u) => u.isAdmin,
        cell: (u) => (
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
        ),
      },
      {
        id: "createdAt",
        header: "Created",
        defaultVisible: false,
        getSortValue: (u) => u.createdAt,
        cell: (u) => formatDate(u.createdAt),
        whiteSpace: "nowrap",
      },
      {
        id: "lastSeenAt",
        header: "Last seen",
        defaultVisible: false,
        getSortValue: (u) => u.lastSeenAt,
        cell: (u) => formatDate(u.lastSeenAt),
        whiteSpace: "nowrap",
      },
      {
        id: "subs",
        header: "Subs",
        getSortValue: (u) => u._count.submissions,
        cell: (u) => u._count.submissions,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers are stable enough for admin page
    [teams, user.id],
  );

  const teamColumns: AdminColumn<AdminTeam>[] = useMemo(
    () => [
      {
        id: "team",
        header: "Team",
        minW: "180px",
        getSortValue: (t) => t.name,
        getFilterValue: (t) => `${t.emoji} ${t.name}`,
        cell: (team) => (
          <HStack spacing={1}>
            <Input
              size="sm"
              maxW="52px"
              key={`emoji-${team.id}-${team.emoji}`}
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
              key={`name-${team.id}-${team.name}`}
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
        ),
      },
      {
        id: "color",
        header: "Color",
        getSortValue: (t) => t.color || "",
        cell: (team) => (
          <HStack>
            <input
              type="color"
              value={team.color || "#3182CE"}
              onChange={(e) =>
                void handleTeamColorChange(team.id, e.target.value)
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
        ),
      },
      {
        id: "score",
        header: "Points",
        getSortValue: (t) => t.score ?? 0,
        getFilterValue: (t) =>
          `${t.score ?? 0} earned ${t.earned ?? 0} bonus ${t.bonusPoints ?? 0}`,
        cell: (team) => (
          <>
            <Text fontWeight="semibold">{team.score ?? "—"}</Text>
            <Text fontSize="xs" color="gray.500">
              earned {team.earned ?? 0}
              {(team.bonusPoints ?? 0) !== 0
                ? ` · bonus ${team.bonusPoints}`
                : ""}
              {(team.deposited ?? 0) > 0
                ? ` · deposited ${team.deposited}`
                : ""}
            </Text>
          </>
        ),
      },
      {
        id: "adjust",
        header: "Adjust",
        disableSort: true,
        cell: (team) => (
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
              onClick={() => void handleAdjustPoints(team.id, -1)}
            >
              Take
            </Button>
          </HStack>
        ),
      },
      {
        id: "members",
        header: "Members",
        getSortValue: (t) => (t.users ?? []).length,
        getFilterValue: (t) =>
          (t.users ?? []).map((m) => `${m.name} ${m.email}`).join(" "),
        cell: (team) =>
          (team.users ?? []).length === 0 ? (
            <Text color="gray.500">No members</Text>
          ) : (
            (team.users ?? []).map((m) => (
              <Text key={m.id} fontSize="sm">
                {m.name} ({m.email})
              </Text>
            ))
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pointDrafts, pointsBusyId],
  );

  const challengeColumns: AdminColumn<Challenge>[] = useMemo(
    () => [
      {
        id: "title",
        header: "Title",
        minW: "160px",
        getSortValue: (c) => c.title,
        cell: (c) => (
          <Input
            size="sm"
            key={`title-${c.id}-${c.title}`}
            defaultValue={c.title}
            onBlur={async (e) => {
              const next = e.target.value.trim();
              if (next && next !== c.title) {
                await patchChallenge(c.id, { title: next });
              }
            }}
          />
        ),
      },
      {
        id: "prompt",
        header: "Prompt",
        minW: "200px",
        getSortValue: (c) => c.prompt,
        cell: (c) => (
          <Input
            size="sm"
            key={`prompt-${c.id}-${c.prompt}`}
            defaultValue={c.prompt}
            onBlur={async (e) => {
              const next = e.target.value;
              if (next !== c.prompt) {
                await patchChallenge(c.id, { prompt: next });
              }
            }}
          />
        ),
      },
      {
        id: "pts",
        header: "Points",
        getSortValue: (c) => c.pts,
        cell: (c) => (
          <Input
            size="sm"
            type="number"
            maxW="80px"
            key={`pts-${c.id}-${c.pts}`}
            defaultValue={c.pts}
            onBlur={async (e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next) && next > 0 && next !== c.pts) {
                await patchChallenge(c.id, { pts: next });
              }
            }}
          />
        ),
      },
      {
        id: "location",
        header: "Location",
        minW: "140px",
        getSortValue: (c) => c.lat ?? -999,
        getFilterValue: (c) =>
          c.lat != null && c.lng != null
            ? `${c.lat} ${c.lng}`
            : "unplaced",
        cell: (c) => (
          <Button
            size="xs"
            variant="outline"
            onClick={() => openLocationEditor(c)}
          >
            {c.lat != null && c.lng != null
              ? `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`
              : "Set location…"}
          </Button>
        ),
      },
      {
        id: "lat",
        header: "Lat",
        defaultVisible: false,
        getSortValue: (c) => c.lat,
        cell: (c) => (c.lat != null ? c.lat.toFixed(4) : "—"),
      },
      {
        id: "lng",
        header: "Lng",
        defaultVisible: false,
        getSortValue: (c) => c.lng,
        cell: (c) => (c.lng != null ? c.lng.toFixed(4) : "—"),
      },
      {
        id: "numWinners",
        header: "Winners",
        getSortValue: (c) => c.numWinners,
        cell: (c) => (
          <Input
            size="sm"
            type="number"
            maxW="72px"
            key={`winners-${c.id}-${c.numWinners}`}
            defaultValue={c.numWinners}
            onBlur={async (e) => {
              const next = Number(e.target.value);
              if (
                Number.isFinite(next) &&
                next >= 1 &&
                next !== c.numWinners
              ) {
                await patchChallenge(c.id, { numWinners: next });
              }
            }}
          />
        ),
      },
      {
        id: "actions",
        header: "",
        disableSort: true,
        cell: (challenge) => (
          <Button
            size="xs"
            colorScheme="red"
            variant="outline"
            onClick={() =>
              handleDeleteChallenge(challenge.id, challenge.title)
            }
          >
            Delete
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [challenges],
  );

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
        <HStack justify="space-between" flexWrap="wrap" gap={2}>
          <Heading size="lg">Admin</Heading>
          <HStack>
            <Button as={Link} href="/admin/challenges" size="sm" colorScheme="purple" variant="outline">
              Draft challenges
            </Button>
            <Button as={Link} href="/admin/assign" size="sm" colorScheme="purple">
              Assign teams
            </Button>
          </HStack>
        </HStack>

        {notice && (
          <Flex
            align="center"
            justify="space-between"
            gap={3}
            px={4}
            py={3}
            borderRadius="md"
            bg={notice.type === "error" ? "red.50" : "green.50"}
            border="1px"
            borderColor={notice.type === "error" ? "red.200" : "green.200"}
          >
            <Text
              fontSize="sm"
              color={notice.type === "error" ? "red.700" : "green.700"}
              whiteSpace="pre-line"
            >
              {notice.message}
            </Text>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
            >
              ✕
            </Button>
          </Flex>
        )}

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
          <AdminDataTable
            tableId="admin-users"
            rows={users}
            columns={userColumns}
            getRowId={(u) => u.id}
            emptyMessage="No users yet"
            toolbarLeft={
              <Button
                as={Link}
                href="/admin/assign"
                size="sm"
                colorScheme="purple"
                flexShrink={0}
              >
                Assign board
              </Button>
            }
          />
        )}

        {activeTab === "teams" && (
          <VStack align="stretch" spacing={6}>
            <Box>
              <Heading size="md" mb={3}>
                All Teams
              </Heading>
              <AdminDataTable
                tableId="admin-teams"
                rows={teams}
                columns={teamColumns}
                getRowId={(t) => t.id}
                emptyMessage="No teams yet"
              />
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
            <Box>
              <HStack justify="space-between" mb={3} flexWrap="wrap" gap={2}>
                <Heading size="md">All Challenges</Heading>
                <HStack>
                  <Button
                    as={Link}
                    href="/admin/challenges"
                    size="sm"
                    colorScheme="purple"
                  >
                    Draft board
                  </Button>
                  <Button
                    size="sm"
                    colorScheme="green"
                    onClick={() => void handleCreateChallenge()}
                  >
                    New Challenge
                  </Button>
                </HStack>
              </HStack>
              <AdminDataTable
                tableId="admin-challenges"
                rows={challenges}
                columns={challengeColumns}
                getRowId={(c) => c.id}
                emptyMessage="No challenges yet"
              />
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
        isOpen={!!locationChallenge}
        onClose={() => setLocationChallenge(null)}
        size="4xl"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            Location
            {locationChallenge ? ` — ${locationChallenge.title}` : ""}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={2}>
            {locationChallenge && (
              <AdminLocationMap
                lat={locationDraft.lat}
                lng={locationDraft.lng}
                onChange={(lat, lng) => setLocationDraft({ lat, lng })}
                height={420}
                activeChallengeId={locationChallenge.id}
                challenges={challenges}
                neighborhoods={neighborhoods.map((n) => ({
                  id: n.id,
                  name: n.name,
                  emoji: n.emoji,
                  boundary: n.boundary,
                  onMap: n.onMap,
                }))}
              />
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="ghost"
              mr={3}
              onClick={() => setLocationChallenge(null)}
            >
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              isLoading={locationBusy}
              onClick={() => void saveLocationEditor()}
            >
              Save location
            </Button>
          </ModalFooter>
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
