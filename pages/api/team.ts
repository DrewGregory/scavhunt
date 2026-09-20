import type { NextApiRequest, NextApiResponse } from "next";
import { differenceInMinutes } from "date-fns";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { getUserFromReq, publicUser } from "../../lib/auth";
import { parseJsonBody } from "../../lib/serialize";

const RequestBody = z.object({
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await getUserFromReq(req);
  if (user == null) {
    res.status(200).json({ user: null, team: null });
    return;
  }

  const parsedReq = RequestBody.safeParse(parseJsonBody(req.body) ?? {});
  if (parsedReq.success && user.teamId) {
    const { location } = parsedReq.data;
    const disableTracking = process.env.NEXT_PUBLIC_DISABLE_LOCATION_TRACKING;
    if (
      location != null &&
      disableTracking !== "true" &&
      disableTracking !== "1"
    ) {
      const latestLocation = await prisma.location.findFirst({
        where: { teamId: user.teamId },
        orderBy: { createdAt: "desc" },
      });
      if (
        latestLocation == null ||
        differenceInMinutes(new Date(), latestLocation.createdAt) >= 15
      ) {
        await prisma.location.create({
          data: {
            teamId: user.teamId,
            lat: location.lat,
            lng: location.lng,
          },
        });
      }
    }
  }

  const pub = publicUser(user);
  res.status(200).json({ user: pub, team: pub.team });
}
