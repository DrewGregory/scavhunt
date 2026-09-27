# Agent admin API

Machine-facing admin endpoints for phone/laptop agents. Authenticated with a shared API key — no browser session or CSRF.

## Auth

Set a long random key in the environment:

```bash
ADMIN_API_KEY="$(openssl rand -hex 32)"
```

Send it on every request:

```http
Authorization: Bearer <ADMIN_API_KEY>
```

or:

```http
X-Admin-Api-Key: <ADMIN_API_KEY>
```

Errors are always JSON: `{ "error": "..." }`. Missing/wrong key → `401`. Unconfigured key → `503`.

## Soft-delete

Removable rows use `deletedAt` (nullable datetime):

| `deletedAt` | Meaning |
|-------------|---------|
| `null` | Live — shown in player UI and default list endpoints |
| set | Archived — excluded from player queries and default lists |

- **DELETE** sets `deletedAt = now()` (never hard-deletes in product/agent paths).
- **POST `…/restore`** clears `deletedAt`.
- List endpoints accept `?includeDeleted=1` to include archived rows.

Related flags that are **not** soft-delete:

- `User.isActive` — login/participation gate
- `Submission.accepted` / `rejected` — moderation outcome
- `Neighborhood.onMap` — map participation

## Endpoints

Base path: `/api/agent`

| Method | Path | Behavior |
|--------|------|----------|
| GET/POST | `/users` | List (excl. deleted) / create |
| GET/PATCH/DELETE | `/users/[id]` | Get / update / soft-delete |
| POST | `/users/[id]/restore` | Restore |
| GET/POST | `/teams` | List / create |
| GET/PATCH/DELETE | `/teams/[id]` | Get / update / soft-delete (`bonusDelta` on PATCH) |
| POST | `/teams/[id]/restore` | Restore |
| GET/POST | `/challenges` | List / create (`enabled` optional on create; default true; pass `false` for drafts) |
| GET/PATCH/DELETE | `/challenges/[id]` | Get / update (`enabled` patchable) / soft-delete |
| POST | `/challenges/[id]/restore` | Restore |
| GET/POST | `/neighborhoods` | List / create |
| GET/PATCH/DELETE | `/neighborhoods/[id]` | Get / update / soft-delete |
| POST | `/neighborhoods/[id]/restore` | Restore |
| GET/PATCH | `/settings` | Hunt window + territory |
| GET/POST | `/deposits` | List (`?includeDeleted=1`) / create (`createdAt?` for simulation) |
| DELETE | `/deposits/[id]` | Soft-delete |
| POST | `/deposits/[id]/restore` | Restore |
| GET/POST | `/submissions` | List (`?status=pending\|accepted\|rejected`) / create (`createdAt?`, `accepted?`) |
| GET/PATCH/DELETE | `/submissions/[id]` | Soft-delete via DELETE; PATCH `createdAt` (and note/media/moderation) |
| POST | `/submissions/[id]/accept` | Accept |
| POST | `/submissions/[id]/reject` | Reject |
| POST | `/submissions/[id]/restore` | Restore |
| GET | `/telemetry` | Upload/playback telemetry (`?view=summary\|events`) |

Out of scope for agents: topology/boundary editing, CSV import, seed-demo.

### Hunt simulation (`createdAt`)

Create endpoints accept an optional ISO-8601 `createdAt` so you can backdate rows for leaderboard / claim charts:

- `POST /users`, `/teams`, `/challenges`, `/neighborhoods`, `/submissions`, `/deposits`
- `PATCH /submissions/[id]` can also set `createdAt` on an existing submission

Example — accepted submission at a fake time:

```bash
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"teamId":"…","userId":"…","challengeId":"…","accepted":true,"createdAt":"2026-09-26T18:30:00.000Z"}' \
  "$BASE/api/agent/submissions" | jq .
```

Example — neighborhood deposit earlier in the day:

```bash
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"teamId":"…","userId":"…","neighborhoodId":"…","points":50,"lat":37.77,"lng":-122.42,"createdAt":"2026-09-26T16:00:00.000Z"}' \
  "$BASE/api/agent/deposits" | jq .
```

### Telemetry

`GET /api/agent/telemetry?view=summary|events`

Mirrors the admin telemetry dashboard APIs. Requires the agent API key.

| Param | Notes |
|-------|--------|
| `view` | **Required.** `summary` (cards, timeseries, by-device, top failures) or `events` (paginated log) |
| `range` | `1h` \| `6h` \| `24h` \| `hunt` (hunt start from settings; fallback 24h). Default `24h` |
| `since` | ISO timestamp; overrides `range` |
| `includeSandbox` | `1` to include sandbox runs (excluded by default) |
| `type`, `level`, `userId`, `teamId`, `attemptId` | Event filters (`events` view; `attemptId` returns ascending timeline) |
| `q` | Search `errorMessage` / `type` |
| `cursor`, `limit` | Cursor pagination on `events` (default limit 100, max 500) |

Example:

```bash
curl -s -H "Authorization: Bearer $KEY" \
  "$BASE/api/agent/telemetry?view=summary&range=6h" | jq .
```

## curl examples

```bash
export BASE=http://localhost:3000
export KEY="$ADMIN_API_KEY"

# List live teams
curl -s -H "Authorization: Bearer $KEY" "$BASE/api/agent/teams" | jq .

# Create a challenge
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"Find the fox","prompt":"Photo of a fox mural","pts":50,"numWinners":3}' \
  "$BASE/api/agent/challenges" | jq .

# Create a disabled draft (prior-year import style)
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"Old fox mural","pts":50,"numWinners":3,"enabled":false,"lat":37.77,"lng":-122.42}' \
  "$BASE/api/agent/challenges" | jq .

# Soft-delete a user, then restore
curl -s -X DELETE -H "Authorization: Bearer $KEY" "$BASE/api/agent/users/USER_ID" | jq .
curl -s -X POST -H "Authorization: Bearer $KEY" "$BASE/api/agent/users/USER_ID/restore" | jq .

# Adjust team bonus points
curl -s -X PATCH -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"bonusDelta":25}' "$BASE/api/agent/teams/TEAM_ID" | jq .

# Pending submissions
curl -s -H "Authorization: Bearer $KEY" "$BASE/api/agent/submissions?status=pending" | jq .

# Hunt settings
curl -s -X PATCH -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"territoryEnabled":true}' "$BASE/api/agent/settings" | jq .
```
