import dynamic from "next/dynamic";
import { GetServerSidePropsContext } from "next";
import { Flex } from "@chakra-ui/react";
import NavContainer from "../components/NavContainer";
import { prisma } from "../lib/prisma";
import { requireUserSSP } from "../lib/auth";
import {
  serializeChallenge,
  serializeSubmission,
  serializeTeam,
} from "../lib/serialize";
import type {
  LatestTeamLocation,
  SerializedChallenge,
  SerializedSubmission,
  SerializedTeam,
} from "../lib/types";

const LeafletMap = dynamic(() => import("../components/leafletMap"), {
  ssr: false,
});

type ChallengeWithSubmissions = SerializedChallenge & {
  submissions: SerializedSubmission[];
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const challengesRaw = await prisma.challenge.findMany({
    include: {
      submissions: {
        where: { rejected: false },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const challenges: ChallengeWithSubmissions[] = challengesRaw.map((c) => ({
    ...serializeChallenge(c),
    submissions: c.submissions.map(serializeSubmission),
  }));

  const disableTracking = process.env.NEXT_PUBLIC_DISABLE_LOCATION_TRACKING;
  let locations: LatestTeamLocation[] = [];
  if (disableTracking !== "true" && disableTracking !== "1") {
    const teamsWithLocations = await prisma.team.findMany({
      include: {
        locations: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    locations = teamsWithLocations
      .filter((t) => t.locations.length > 0)
      .map((t) => ({
        id: t.id,
        emoji: t.emoji,
        name: t.name,
        latestLocation: {
          lat: t.locations[0].lat,
          lng: t.locations[0].lng,
          id: t.locations[0].id,
        },
      }));
  }

  return {
    props: {
      challenges,
      locations,
      team: auth.user.team ? serializeTeam(auth.user.team) : null,
    },
  };
};

export default function Page({
  locations,
  challenges,
  team,
}: {
  locations: Array<LatestTeamLocation>;
  challenges: Array<ChallengeWithSubmissions>;
  team: SerializedTeam | null;
}) {
  return (
    <NavContainer title="Map" fullScreen>
      <Flex flex={1} w="100%" h="100%" p={0}>
        <LeafletMap challenges={challenges} locations={locations} team={team} />
      </Flex>
    </NavContainer>
  );
}
