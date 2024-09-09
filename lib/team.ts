import { NextApiRequestCookies } from "next/dist/server/api-utils";
import { TeamModel } from "../models/Team";
import { dbConnect } from "./dbConnect";
import { sha256 } from "./hash";

export const ADMIN_TEAM_ID = process.env.ADMIN_TEAM_ID ?? "invalid_team_id";

export const TEAM_COOKIE_NAME = "teamCode";

export const getTeamFromCookie = async (cookies: NextApiRequestCookies) => {
  await dbConnect();
  const teamCode = cookies[TEAM_COOKIE_NAME];
  if (teamCode == null) {
    return null;
  }
  const team = await TeamModel.findOne({
    teamCode: sha256(teamCode),
  }).lean().exec();

  return team;
}