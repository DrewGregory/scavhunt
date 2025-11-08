import { NextApiRequestCookies } from "next/dist/server/api-utils";
import { TeamModel } from "../models/Team";
import { dbConnect } from "./dbConnect";
import { sha256 } from "./hash";

// Parse comma-separated admin team IDs from environment variable
const parseAdminTeamIds = (): string[] => {
  const adminTeamIds = process.env.ADMIN_TEAM_ID ?? "invalid_team_id";
  return adminTeamIds.split(',').map(id => id.trim()).filter(id => id.length > 0);
};

export const ADMIN_TEAM_IDS = parseAdminTeamIds();

// Helper function to check if a team ID is an admin
export const isAdminTeam = (teamId: string): boolean => {
  return ADMIN_TEAM_IDS.includes(teamId);
};

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

export const verifyAdminTeamCode = async (teamCode: string): Promise<boolean> => {
  await dbConnect();
  const team = await TeamModel.findOne({
    teamCode: sha256(teamCode),
  }).lean().exec();
  
  if (!team) {
    return false;
  }
  
  return isAdminTeam(team._id.toString());
}