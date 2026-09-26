---
name: scavhunt-admin
description: Administer the scavenger hunt via the agent API key. Use for users, teams, challenges, neighborhoods, deposits, submissions, and hunt settings. Never hard-delete — always soft-delete and restore.
---

# Scavhunt admin (agent API)

Use the HTTP agent admin API documented in [`docs/agent-api.md`](../../../docs/agent-api.md).

## Auth

- Env: `ADMIN_API_KEY`
- Header: `Authorization: Bearer <key>` or `X-Admin-Api-Key: <key>`
- Base: `/api/agent/...`

## Soft-delete rules (mandatory)

- **Never** hard-delete rows in product or agent paths.
- **DELETE** = set `deletedAt` (archive).
- **POST `…/restore`** = clear `deletedAt`.
- Default lists exclude archived rows; pass `?includeDeleted=1` when needed.
- Keep moderation (`accept`/`reject`) separate from archive.
- Keep `User.isActive` separate from archive (deactivate ≠ soft-delete).

## Common tasks

| Task | Call |
|------|------|
| List teams | `GET /api/agent/teams` |
| Create team | `POST /api/agent/teams` `{ name, emoji, color? }` |
| Bonus points | `PATCH /api/agent/teams/:id` `{ bonusDelta }` |
| Create challenge | `POST /api/agent/challenges` `{ title, prompt?, pts, numWinners, lat?, lng?, enabled? }` (`enabled: false` for drafts) |
| Archive challenge | `DELETE /api/agent/challenges/:id` |
| Restore | `POST /api/agent/…/:id/restore` |
| Moderate | `POST /api/agent/submissions/:id/accept` or `/reject` |
| Hunt window / territory | `GET` / `PATCH /api/agent/settings` |
| Soft-delete deposit | `DELETE /api/agent/deposits/:id` |

## Do not use agents for

- Topology / shared-edge boundary editing
- CSV import
- Seed-demo scripts

Prefer the web admin UI (`/admin`) for those.
