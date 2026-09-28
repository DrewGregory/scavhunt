import type { LatestTeamLocation } from "./types";

export type MapReplayDepositEvent = {
  neighborhoodId: string;
  teamId: string;
  teamName: string;
  teamEmoji: string;
  teamColor: string;
  points: number;
  createdAt: string;
};

export type MapReplayLocationSample = {
  id: string;
  teamId: string;
  lat: number;
  lng: number;
  createdAt: string;
};

export type MapReplayTeam = {
  id: string;
  name: string;
  emoji: string;
};

export type MapReplayTimeline = {
  start: string;
  end: string;
  deposits: MapReplayDepositEvent[];
  locations: MapReplayLocationSample[];
  teams: MapReplayTeam[];
};

export type ReplayTeamSlice = {
  teamId: string;
  teamName: string;
  teamEmoji: string;
  teamColor: string;
  points: number;
};

export type ReplayNeighborhoodStanding = {
  id: string;
  totals: ReplayTeamSlice[];
  claimedBy: ReplayTeamSlice | null;
  contested: boolean;
  totalDeposited: number;
};

/**
 * Aggregate deposit (+void) events up to `asOfMs` into per-neighborhood standings.
 * Same claim rule as getStandings: unique strict max; ties = contested.
 */
export function standingsAsOf(
  deposits: MapReplayDepositEvent[],
  asOfMs: number,
): Map<string, ReplayNeighborhoodStanding> {
  const byNbh = new Map<string, Map<string, ReplayTeamSlice>>();

  for (const d of deposits) {
    if (Date.parse(d.createdAt) > asOfMs) continue;
    let byTeam = byNbh.get(d.neighborhoodId);
    if (!byTeam) {
      byTeam = new Map();
      byNbh.set(d.neighborhoodId, byTeam);
    }
    const prev = byTeam.get(d.teamId);
    const points = (prev?.points ?? 0) + d.points;
    if (points <= 0) {
      byTeam.delete(d.teamId);
    } else {
      byTeam.set(d.teamId, {
        teamId: d.teamId,
        teamName: d.teamName,
        teamEmoji: d.teamEmoji,
        teamColor: d.teamColor,
        points,
      });
    }
  }

  const out = new Map<string, ReplayNeighborhoodStanding>();
  for (const [id, byTeam] of byNbh) {
    const totals = [...byTeam.values()].sort((a, b) => b.points - a.points);
    const top = totals[0] ?? null;
    const contested =
      !!top && totals.length > 1 && totals[1]!.points === top.points;
    out.set(id, {
      id,
      totals,
      claimedBy: top && !contested ? top : null,
      contested,
      totalDeposited: totals.reduce((s, t) => s + t.points, 0),
    });
  }
  return out;
}

/** Latest location for each team at or before `asOfMs`. */
export function locationsAsOf(
  samples: MapReplayLocationSample[],
  teams: MapReplayTeam[],
  asOfMs: number,
): LatestTeamLocation[] {
  const latest = new Map<string, MapReplayLocationSample>();
  for (const s of samples) {
    if (Date.parse(s.createdAt) > asOfMs) continue;
    latest.set(s.teamId, s);
  }
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const out: LatestTeamLocation[] = [];
  for (const [teamId, loc] of latest) {
    const team = teamById.get(teamId);
    if (!team) continue;
    out.push({
      id: teamId,
      emoji: team.emoji,
      name: team.name,
      latestLocation: {
        id: loc.id,
        lat: loc.lat,
        lng: loc.lng,
      },
    });
  }
  return out;
}
