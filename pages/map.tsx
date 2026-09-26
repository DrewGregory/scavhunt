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
import { isTerritoryEnabled } from "../lib/territoryGate";
import { getStandings } from "../lib/territory";
import { getTeamScore } from "../lib/scoring";
import type { TerritoryNeighborhood } from "../components/leafletMap";

const LeafletMap = dynamic(() => import("../components/leafletMap"), {
  ssr: false,
});

type ChallengeWithSubmissions = SerializedChallenge & {
  submissions: SerializedSubmission[];
};

type Bank = {
  earned: number;
  deposited: number;
  bonus?: number;
  score: number;
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const auth = await requireUserSSP(context);
  if (auth.redirect) return { redirect: auth.redirect };

  const challengesRaw = await prisma.challenge.findMany({
    where: { deletedAt: null, enabled: true },
    include: {
      submissions: {
        where: { rejected: false, deletedAt: null },
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
      where: { deletedAt: null },
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

  const territoryGloballyEnabled = await isTerritoryEnabled();
  const isAdmin = Boolean(auth.user.isAdmin);
  const showTerritory = territoryGloballyEnabled || isAdmin;
  let neighborhoods: TerritoryNeighborhood[] = [];
  let bank: Bank | null = null;

  if (showTerritory) {
    const standings = await getStandings({
      onMapOnly: true,
      includeBoundary: true,
    });
    neighborhoods = standings.map((s) => ({
      id: s.neighborhoodId,
      name: s.name,
      emoji: s.emoji,
      centerLat: s.centerLat,
      centerLng: s.centerLng,
      boundary: s.boundary as TerritoryNeighborhood["boundary"],
      totals: s.totals,
      claimedBy: s.claimedBy,
      contested: s.contested,
      totalDeposited: s.totalDeposited,
    }));
    if (auth.user.teamId) {
      bank = await getTeamScore(auth.user.teamId);
    }
  }

  return {
    props: {
      challenges,
      locations,
      team: auth.user.team ? serializeTeam(auth.user.team) : null,
      territoryEnabled: territoryGloballyEnabled,
      isAdmin,
      neighborhoods: showTerritory ? neighborhoods : [],
      bank: showTerritory ? bank : null,
    },
  };
};

export default function Page({
  locations,
  challenges,
  team,
  territoryEnabled,
  isAdmin,
  neighborhoods,
  bank,
}: {
  locations: Array<LatestTeamLocation>;
  challenges: Array<ChallengeWithSubmissions>;
  team: SerializedTeam | null;
  territoryEnabled: boolean;
  isAdmin: boolean;
  neighborhoods: TerritoryNeighborhood[];
  bank: Bank | null;
}) {
  return (
    <NavContainer title="Map" fullScreen>
      <Flex flex={1} w="100%" h="100%" p={0}>
        <LeafletMap
          challenges={challenges}
          locations={locations}
          team={team}
          territoryEnabled={territoryEnabled}
          isAdmin={isAdmin}
          initialNeighborhoods={neighborhoods}
          initialBank={bank}
        />
      </Flex>
    </NavContainer>
  );
}
