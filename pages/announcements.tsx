import { GetServerSidePropsContext, InferGetServerSidePropsType } from "next";
import { Badge, Box, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import NavContainer from "../components/NavContainer";
import DataList from "../components/dataList/DataList";
import {
  AnnouncementGotItButton,
  AnnouncementPlayerShell,
} from "../components/AnnouncementPlayerShell";
import { requireUserSSP, requireHuntAccessSSP } from "../lib/auth";
import {
  listPublishedAnnouncements,
  serializeAnnouncement,
} from "../lib/announcements";

type AnnouncementListItem = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  pinned: boolean;
};

const columnHelper = createColumnHelper<AnnouncementListItem>();

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const huntRedirect = await requireHuntAccessSSP(auth.user);
  if (huntRedirect) return { redirect: huntRedirect };

  const rows = await listPublishedAnnouncements();
  const announcements: AnnouncementListItem[] = rows.map((row) => {
    const s = serializeAnnouncement(row);
    return {
      id: s.id,
      title: s.title,
      body: s.body,
      publishedAt: s.publishedAt,
      pinned: s.pinned,
    };
  });

  return { props: { announcements } };
};

export default function AnnouncementsPage({
  announcements,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [selected, setSelected] = useState<AnnouncementListItem | null>(null);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "primary",
        header: "Announcement",
        cell: ({ row }) => {
          const a = row.original;
          return (
            <Box minW={0}>
              <Text
                fontWeight="semibold"
                color="gray.800"
                noOfLines={2}
                lineHeight="short"
              >
                {a.pinned ? (
                  <>
                    <Badge colorScheme="blue" mr={2} verticalAlign="middle">
                      Pinned
                    </Badge>
                    {a.title}
                  </>
                ) : (
                  a.title
                )}
              </Text>
              {a.publishedAt && (
                <Text fontSize="sm" color="gray.500" mt={0.5}>
                  Sent {new Date(a.publishedAt).toLocaleString()}
                </Text>
              )}
            </Box>
          );
        },
      }),
    ],
    [],
  );

  return (
    <NavContainer title="Announcements">
      <Text fontSize="sm" color="gray.600" mb={4}>
        Messages from hunt organizers. Tap one to read it again.
      </Text>

      <DataList
        rows={announcements}
        columns={columns}
        getRowId={(a) => a.id}
        expandedId={null}
        onToggle={(id) => {
          const row = announcements.find((a) => a.id === id) ?? null;
          setSelected(row);
        }}
        renderExpanded={() => null}
        emptyMessage="No announcements yet"
      />

      {selected && (
        <AnnouncementPlayerShell
          isOpen
          title={selected.title}
          body={selected.body}
          closeOnOverlayClick
          closeOnEsc
          onClose={() => setSelected(null)}
          footer={
            <AnnouncementGotItButton onClick={() => setSelected(null)} />
          }
        />
      )}
    </NavContainer>
  );
}
