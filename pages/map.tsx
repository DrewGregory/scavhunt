import dynamic from "next/dynamic";
import { ChallengeModel, serializedChallengeSchema, SerializedChallenge } from "../models/Challenge";
import { GetServerSidePropsContext } from "next";
import { dbConnect } from "../lib/dbConnect";
import { Flex } from "@chakra-ui/react";
import NavContainer from "../components/NavContainer";
import { LocationModel } from "../models/Location";
import { z } from "zod";
import { LatestTeamLocation, latestTeamLocationSchema } from "../lib/types";
import { getTeamFromCookie } from "../lib/team";

// https://nextjs.org/docs/pages/building-your-application/optimizing/lazy-loading#with-no-ssr
const LeafletMap = dynamic(() => import("../components/leafletMap"), {
  ssr: false,
});

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  await dbConnect();

  const challenges = await (async () => {
    const team = await getTeamFromCookie(context.req.cookies)
    if (team == null) {
      return [];
    }
    return ChallengeModel.find({}).lean().exec();
  })();

  const locationsRaw = await LocationModel.aggregate([
    {
      $sort: {
        createdAt: -1
      }
    },
    {
      $group: {
        _id: "$teamId",
        latestLocation: { $first: "$loc" }
      }
    },
    {
      $lookup: {
        from: "teams",
        localField: "_id",
        foreignField: "_id",
        as: "team",
      }
    },
    {
      $set: {
        "emoji": { $first: "$team.emoji" },
      }
    },
    {
      $project: {
        _id: 1,
        latestLocation: 1,
        emoji: 1,
      }
    }
  ]);

  return {
    props: {
      challenges: z.array(serializedChallengeSchema).parse(challenges),
      locations: z.array(latestTeamLocationSchema).parse(locationsRaw),
    }
  }
}

export default function Page({
  locations,
  challenges
}: {
  locations: Array<LatestTeamLocation>,
  challenges: Array<SerializedChallenge>,
}) {
  return (
    <NavContainer title="Map" fullScreen>
      <Flex grow={1} w="100%" h="100%" p={0}>
        <LeafletMap challenges={challenges} locations={locations} />
      </Flex>
    </NavContainer>
  );
}
