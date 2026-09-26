# Team assignment board

## Goal

Give admins a dedicated place to form teams by dragging player cards (with survey context) into team groups — better than the cramped Users-tab dropdown.

## Layout

```
┌──────────────────┬────────────────────────────────────────────┐
│ Unassigned       │  ┌──────────────────────────────────────┐  │
│ (filter/search)  │  │         + New group  (full width)    │  │  ← drop target
│                  │  └──────────────────────────────────────┘  │
│ ┌─ card ──────┐  │  ┌────────────────┐ ┌────────────────┐    │
│ │ Name        │  │  │ 🦈 Team A      │ │ 🚀 Team B      │    │
│ │ survey…     │──┼─▶│ [cards…]       │ │ [cards…]       │    │  ← 2-col grid
│ └─────────────┘  │  └────────────────┘ └────────────────┘    │
│ …scroll…         │  ┌────────────────┐ ┌────────────────┐    │
│                  │  │ …              │ │ …              │    │
│                  │  └────────────────┘ └────────────────┘    │
│                  │           ↕ scroll teams pane             │
└──────────────────┴────────────────────────────────────────────┘
```

- **Left pane:** unassigned users (`teamId == null`), filterable. Cards show name + survey (intent, prefs, compete, time). Own scroll if needed.
- **Right pane:**
  - **Top:** full-width **+ New group** strip (always visible, not in the scroll grid). Dropping a card here opens create-team (name + emoji) → assign → team appears in the grid.
  - **Below:** existing teams in a **2-column CSS grid**, pane scrolls vertically as teams grow. Each cell is a droppable column of member cards.
- Dragging between teams / back to Unassigned → `PATCH /api/admin/users` with `teamId`.

## Interactions

| Action | Behavior |
|--------|----------|
| Drag card → team column | Optimistic UI; PATCH `teamId`; toast on failure + revert |
| Drag card → Unassigned | PATCH `teamId: null` |
| Drag card → New group (top strip) | Create team, then assign; cancel leaves card unmoved |
| Rename team inline | Reuse Teams PATCH (`name` / `emoji` / `color`) |
| Filter left list | Text filter + chips: Playing / Browsing / Survey incomplete |

## Technical approach

- **Route:** `/admin/assign` (or Admin **Assign** tab) for screen space.
- **Right pane CSS:** sticky/fixed `New group` header; `grid-template-columns: 1fr 1fr; gap: …; overflow-y: auto` for the teams area.
- **DnD:** HTML5 drag-and-drop first (no new dependency); `@dnd-kit` only if native feels rough.
- **Data:** reuse `GET /api/admin/users` + `GET /api/admin/teams`; no schema changes.
- **Auth:** `requireAdminSSP` / existing admin APIs.
- **Cards:** shared `PlayerSurveyCard`.

## Out of scope (v1)

- Balancing algorithms / auto-suggest
- Cross-team chat or history of moves
- Mobile-first layout (desktop admin tool)

## Implementation steps

1. Add `/admin/assign` with two-pane shell (left list + right: New group strip + 2-col scroll grid).
2. `PlayerSurveyCard` + Unassigned list with filters.
3. Team columns as drop zones; wire PATCH assign.
4. Full-width New group create+assign flow.
5. Link from Admin Users toolbar (“Open assign board”).
