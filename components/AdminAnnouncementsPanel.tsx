import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormHelperText,
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
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tooltip,
  Tr,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import { MarkdownBody } from "./MarkdownBody";
import {
  AnnouncementGotItButton,
  AnnouncementPlayerShell,
} from "./AnnouncementPlayerShell";

type Viewer = {
  userId: string;
  name: string;
  email: string;
  teamId: string | null;
  teamName: string | null;
  teamEmoji: string | null;
  dismissedAt: string;
};

type TeamMetric = {
  teamId: string;
  name: string;
  emoji: string;
  memberCount: number;
  seenCount: number;
  covered: boolean;
};

type Metrics = {
  activePlayerCount: number;
  seenCount: number;
  viewers: Viewer[];
  teams: TeamMetric[];
  teamsCovered: number;
  teamsTotal: number;
};

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  pinned: boolean;
  forceShow: boolean;
  createdAt: string;
  status: "draft" | "published" | "archived";
  metrics: Metrics;
};

const PIN_TOOLTIP =
  "Pins a blue banner at the top of the feed. Only one announcement can be pinned — pinning this one unpins any other. Players can browse all announcements from the Announcements page in the sidebar.";

const FORCE_SHOW_TOOLTIP =
  "Shows a blocking popup when players open the app until they tap Got it. Leave off so the announcement only appears on the Announcements page (and as a feed banner if pinned).";

export default function AdminAnnouncementsPanel({
  onNotice,
}: {
  onNotice: (type: "success" | "error", message: string) => void;
}) {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const createModal = useDisclosure();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [forceShowOnCreate, setForceShowOnCreate] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/announcements");
    if (!res.ok) throw new Error("Failed to load announcements");
    const data = await res.json();
    setRows((data.announcements ?? []) as AnnouncementRow[]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch {
        onNotice("error", "Failed to load announcements");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [load]);

  const resetCreateForm = () => {
    setTitle("");
    setBody("");
    setForceShowOnCreate(true);
  };

  const openCreate = () => {
    resetCreateForm();
    setPreviewOpen(false);
    createModal.onOpen();
  };

  const openPreview = () => {
    if (!title.trim() || !body.trim()) {
      onNotice("error", "Title and body are required");
      return;
    }
    setPreviewOpen(true);
  };

  const create = async (publish: boolean) => {
    if (!title.trim() || !body.trim()) {
      onNotice("error", "Title and body are required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          publish,
          forceShow: publish ? forceShowOnCreate : false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotice("error", data.error || "Failed to create");
        return;
      }
      resetCreateForm();
      setPreviewOpen(false);
      createModal.onClose();
      await load();
      onNotice(
        "success",
        publish ? "Announcement published" : "Draft saved",
      );
    } catch {
      onNotice("error", "Failed to create announcement");
    } finally {
      setCreating(false);
    }
  };

  const patch = async (
    id: string,
    payload: Record<string, unknown>,
    okMessage: string,
  ) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotice("error", data.error || "Update failed");
        return;
      }
      await load();
      onNotice("success", okMessage);
    } catch {
      onNotice("error", "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (id: string) => {
    if (
      !confirm(
        "Archive this announcement? Players who have not seen it will stop seeing it.",
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onNotice("error", data.error || "Archive failed");
        return;
      }
      if (expandedId === id) setExpandedId(null);
      await load();
      onNotice("success", "Announcement archived");
    } catch {
      onNotice("error", "Archive failed");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (row: AnnouncementRow) => {
    setExpandedId(row.id);
    setEditTitle(row.title);
    setEditBody(row.body);
  };

  if (loading) {
    return <Text color="gray.500">Loading announcements…</Text>;
  }

  return (
    <VStack align="stretch" spacing={6}>
      <HStack justify="flex-end" align="center" flexWrap="wrap" gap={3}>
        <Button colorScheme="blue" onClick={openCreate}>
          New announcement
        </Button>
      </HStack>

      <Modal
        isOpen={createModal.isOpen && !previewOpen}
        onClose={createModal.onClose}
        size="xl"
        scrollBehavior="inside"
        isCentered
      >
        <ModalOverlay />
        <ModalContent
          mx={4}
          maxH="90dvh"
          display="flex"
          flexDirection="column"
          overflow="hidden"
        >
          <ModalHeader flexShrink={0}>New announcement</ModalHeader>
          <ModalCloseButton />
          <ModalBody flex="1" minH={0} overflowY="auto">
            <VStack align="stretch" spacing={4}>
              <FormControl>
                <FormLabel>Title</FormLabel>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Territory mode is live"
                  maxLength={200}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Body (markdown)</FormLabel>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    "**Territory is live**\n\n- Deposit points on the map\n- Most points wins the neighborhood"
                  }
                  rows={12}
                  maxLength={20_000}
                  fontFamily="mono"
                  fontSize="sm"
                />
                <FormHelperText>
                  Bold, lists, links, and headings.
                </FormHelperText>
              </FormControl>
              <Checkbox
                isChecked={forceShowOnCreate}
                onChange={(e) => setForceShowOnCreate(e.target.checked)}
              >
                Notify on open (blocking popup until Got it)
              </Checkbox>
            </VStack>
          </ModalBody>
          <ModalFooter flexShrink={0} gap={2} flexWrap="wrap">
            <Button variant="ghost" onClick={createModal.onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              variant="outline"
              onClick={() => void create(false)}
              isLoading={creating}
            >
              Save draft
            </Button>
            <Button colorScheme="blue" onClick={openPreview}>
              Preview and send
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <AnnouncementPlayerShell
        isOpen={createModal.isOpen && previewOpen}
        title={title.trim() || "Untitled"}
        body={body.trim() || "_No body_"}
        eyebrow="Preview · as players will see it"
        closeOnOverlayClick={false}
        closeOnEsc={false}
        footer={
          <>
            <Button
              variant="outline"
              size="lg"
              flex={{ base: "1 1 100%", sm: 1 }}
              onClick={() => setPreviewOpen(false)}
              isDisabled={creating}
            >
              Go back to editing
            </Button>
            <AnnouncementGotItButton
              flex={{ base: "1 1 100%", sm: 1 }}
              onClick={() => void create(true)}
              isLoading={creating}
            >
              Confirm
            </AnnouncementGotItButton>
          </>
        }
      />

      <VStack align="stretch" spacing={4}>
        {rows.length === 0 && (
          <Text color="gray.500">No announcements yet.</Text>
        )}
        {rows.map((row) => {
          const m = row.metrics;
          const isExpanded = expandedId === row.id;
          const showDetails = detailsId === row.id;
          return (
            <Box
              key={row.id}
              bg="white"
              p={4}
              borderRadius="md"
              boxShadow="sm"
              borderWidth="1px"
              borderColor={
                row.status === "published" ? "blue.200" : "gray.200"
              }
            >
              <HStack
                justify="space-between"
                align="flex-start"
                flexWrap="wrap"
                gap={2}
                mb={2}
              >
                <VStack align="stretch" spacing={1} flex="1" minW={0}>
                  <HStack flexWrap="wrap" gap={2}>
                    <Heading size="sm">{row.title}</Heading>
                    <Badge
                      colorScheme={
                        row.status === "published"
                          ? "green"
                          : row.status === "draft"
                            ? "yellow"
                            : "gray"
                      }
                    >
                      {row.status}
                    </Badge>
                    {row.pinned && (
                      <Badge colorScheme="blue">pinned</Badge>
                    )}
                    {row.forceShow && (
                      <Badge colorScheme="purple">notify on open</Badge>
                    )}
                  </HStack>
                  <Text fontSize="xs" color="gray.500">
                    {row.publishedAt
                      ? `Published ${new Date(row.publishedAt).toLocaleString()}`
                      : `Created ${new Date(row.createdAt).toLocaleString()}`}
                  </Text>
                </VStack>
                <HStack flexWrap="wrap" gap={2}>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => startEdit(row)}
                  >
                    {isExpanded ? "Editing" : "Edit"}
                  </Button>
                  {row.status === "draft" ? (
                    <Button
                      size="xs"
                      colorScheme="blue"
                      isLoading={busyId === row.id}
                      onClick={() =>
                        void patch(row.id, { publish: true }, "Published")
                      }
                    >
                      Publish
                    </Button>
                  ) : (
                    <>
                      <Tooltip
                        label={PIN_TOOLTIP}
                        hasArrow
                        placement="top"
                        openDelay={300}
                      >
                        <Box as="span" display="inline-block">
                          <Button
                            size="xs"
                            colorScheme={row.pinned ? "blue" : "gray"}
                            variant={row.pinned ? "solid" : "outline"}
                            isLoading={busyId === row.id}
                            onClick={() =>
                              void patch(
                                row.id,
                                { pinned: !row.pinned },
                                row.pinned ? "Unpinned" : "Pinned to feed",
                              )
                            }
                          >
                            {row.pinned ? "Unpin" : "Pin"}
                          </Button>
                        </Box>
                      </Tooltip>
                      <Tooltip
                        label={FORCE_SHOW_TOOLTIP}
                        hasArrow
                        placement="top"
                        openDelay={300}
                      >
                        <Box as="span" display="inline-block">
                          <Button
                            size="xs"
                            colorScheme={row.forceShow ? "purple" : "gray"}
                            variant={row.forceShow ? "solid" : "outline"}
                            isLoading={busyId === row.id}
                            onClick={() =>
                              void patch(
                                row.id,
                                { forceShow: !row.forceShow },
                                row.forceShow
                                  ? "No longer notifies on open"
                                  : "Will notify players on open",
                              )
                            }
                          >
                            {row.forceShow ? "Notifying" : "Notify on open"}
                          </Button>
                        </Box>
                      </Tooltip>
                      <Button
                        size="xs"
                        variant="outline"
                        isLoading={busyId === row.id}
                        onClick={() =>
                          void patch(
                            row.id,
                            { publish: false },
                            "Unpublished to draft",
                          )
                        }
                      >
                        Unpublish
                      </Button>
                    </>
                  )}
                  <Button
                    size="xs"
                    colorScheme="red"
                    variant="ghost"
                    isLoading={busyId === row.id}
                    onClick={() => void archive(row.id)}
                  >
                    Archive
                  </Button>
                </HStack>
              </HStack>

              {!isExpanded && (
                <Box mb={3} maxH="6.5em" overflow="hidden">
                  <MarkdownBody fontSize="sm">{row.body}</MarkdownBody>
                </Box>
              )}

              {isExpanded && (
                <VStack align="stretch" spacing={3} mb={4}>
                  <FormControl>
                    <FormLabel fontSize="sm">Title</FormLabel>
                    <Input
                      size="sm"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </FormControl>
                  <Flex
                    direction={{ base: "column", md: "row" }}
                    gap={3}
                    align="stretch"
                  >
                    <FormControl flex={1}>
                      <FormLabel fontSize="sm">Body (markdown)</FormLabel>
                      <Textarea
                        size="sm"
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={6}
                        fontFamily="mono"
                      />
                    </FormControl>
                    <Box
                      flex={1}
                      borderWidth="1px"
                      borderColor="gray.200"
                      borderRadius="md"
                      p={3}
                      bg="gray.50"
                    >
                      <Text fontSize="xs" color="gray.500" mb={2}>
                        Preview
                      </Text>
                      {editBody.trim() ? (
                        <MarkdownBody fontSize="sm">{editBody}</MarkdownBody>
                      ) : (
                        <Text fontSize="sm" color="gray.400">
                          Markdown preview
                        </Text>
                      )}
                    </Box>
                  </Flex>
                  <HStack>
                    <Button
                      size="sm"
                      colorScheme="blue"
                      isLoading={busyId === row.id}
                      onClick={() =>
                        void patch(
                          row.id,
                          {
                            title: editTitle.trim(),
                            body: editBody.trim(),
                          },
                          "Saved",
                        )
                      }
                    >
                      Save changes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedId(null)}
                    >
                      Close
                    </Button>
                  </HStack>
                </VStack>
              )}

              {row.status === "published" && (
                <Box
                  borderTopWidth="1px"
                  borderColor="gray.100"
                  pt={3}
                  mt={1}
                >
                  <HStack
                    justify="space-between"
                    align="center"
                    flexWrap="wrap"
                    gap={2}
                  >
                    <Text fontSize="sm" fontWeight="medium">
                      Seen by {m.seenCount}/{m.activePlayerCount} players
                      {" · "}
                      {m.teamsCovered}/{m.teamsTotal} teams covered
                    </Text>
                    <Button
                      size="xs"
                      variant="link"
                      colorScheme="blue"
                      onClick={() =>
                        setDetailsId((id) => (id === row.id ? null : row.id))
                      }
                    >
                      {showDetails ? "Hide details" : "View who has seen it"}
                    </Button>
                  </HStack>

                  {showDetails && (
                    <VStack align="stretch" spacing={4} mt={4}>
                      <Box>
                        <Text fontSize="sm" fontWeight="semibold" mb={2}>
                          Teams
                        </Text>
                        <Box overflowX="auto">
                          <Table size="sm" variant="simple">
                            <Thead>
                              <Tr>
                                <Th>Team</Th>
                                <Th isNumeric>Seen</Th>
                                <Th>Covered</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {m.teams
                                .filter((t) => t.memberCount > 0)
                                .map((t) => (
                                  <Tr key={t.teamId}>
                                    <Td>
                                      {t.emoji} {t.name}
                                    </Td>
                                    <Td isNumeric>
                                      {t.seenCount}/{t.memberCount}
                                    </Td>
                                    <Td>
                                      <Badge
                                        colorScheme={
                                          t.covered ? "green" : "red"
                                        }
                                      >
                                        {t.covered ? "yes" : "no"}
                                      </Badge>
                                    </Td>
                                  </Tr>
                                ))}
                            </Tbody>
                          </Table>
                        </Box>
                      </Box>

                      <Box>
                        <Text fontSize="sm" fontWeight="semibold" mb={2}>
                          Players who dismissed
                        </Text>
                        {m.viewers.length === 0 ? (
                          <Text fontSize="sm" color="gray.500">
                            Nobody has dismissed this yet.
                          </Text>
                        ) : (
                          <Box overflowX="auto">
                            <Table size="sm" variant="simple">
                              <Thead>
                                <Tr>
                                  <Th>Player</Th>
                                  <Th>Team</Th>
                                  <Th>Dismissed</Th>
                                </Tr>
                              </Thead>
                              <Tbody>
                                {m.viewers.map((v) => (
                                  <Tr key={v.userId}>
                                    <Td>
                                      <Text fontSize="sm">{v.name}</Text>
                                      <Text fontSize="xs" color="gray.500">
                                        {v.email}
                                      </Text>
                                    </Td>
                                    <Td>
                                      {v.teamName
                                        ? `${v.teamEmoji ?? ""} ${v.teamName}`.trim()
                                        : "—"}
                                    </Td>
                                    <Td whiteSpace="nowrap">
                                      {new Date(
                                        v.dismissedAt,
                                      ).toLocaleString()}
                                    </Td>
                                  </Tr>
                                ))}
                              </Tbody>
                            </Table>
                          </Box>
                        )}
                      </Box>
                    </VStack>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </VStack>
    </VStack>
  );
}
