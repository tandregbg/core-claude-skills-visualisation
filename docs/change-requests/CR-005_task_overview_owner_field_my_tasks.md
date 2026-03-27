# CR-005: Task overview redesign -- owner field, "My Tasks", cross-project perspective

| Field | Value |
|-------|-------|
| **CR Number** | CR-005 |
| **Date** | 2026-03-27 |
| **Author** | Tomas + Claude Code |
| **Status** | Proposed |
| **Priority** | High |
| **Complexity** | High |
| **Estimated Scope** | Schema, Parsers, Backend API, Frontend, core-skills (ops/transcript) |
| **Related CRs** | CR-002 (project page -- tasks panel overlaps) |
| **Depends On** | None |
| **Breaking Changes** | No (additive `owner` field, backward compatible) |

---

## Executive Summary

With 615 tasks across 35+ `_tasks.yaml` files and 478 active, the current task view is unusable for getting either a big-picture overview or finding specific responsibilities. Tasks lack a structured `owner` field -- ownership is buried in notes strings. The visualisation has no concept of "my tasks" vs "team tasks", no cross-project summary, and shows completed tasks alongside active ones by default.

**Current Problems:**
1. No structured `owner` field -- ownership detected from notes text patterns (~300 have parseable owners)
2. No "My Tasks" view -- cannot see all of Tomas's tasks across all projects in one place
3. No project summary -- 478 active tasks in a flat kanban/table with no grouping
4. Completed tasks (128) clutter the active view
5. No way to see "all P0s across everything" or "all blocked across everything"
6. No team member filter -- cannot see what Keyur, Lavanya, or Vamshi own

**Data snapshot (2026-03-27):**

| Metric | Count |
|--------|-------|
| Total tasks | 615 |
| Active (pending + in_progress + blocked) | 478 |
| Completed | 128 |
| Cancelled | 9 |
| _tasks.yaml files | 35+ |
| Tasks with explicit `owner` field | 43 |
| Tasks with parseable owner in notes | ~300 |
| Projects with >10 active tasks | 11 |

Top projects by active tasks: sonetel-mobile-v3 (107), new-website (85), sonetel-management (84), sonetel (41), sonetel-marketing (32).

---

## Problem Analysis

### Why the current view fails at scale

The task page was built when there were ~50 tasks across a few projects. At 478 active tasks:

- **Kanban columns** show 300+ pending cards -- unscrollable
- **Table view** is a 478-row flat list -- no hierarchy
- **Filters** only work within one dimension (status OR priority OR tag) -- no combination
- **Project filtering** requires clicking sidebar folders -- no summary of where the work is
- **No person dimension** -- "what am I responsible for?" requires reading every task

### Owner data gap

The `_tasks.yaml` schema (v2) has no `owner` field. Ownership is embedded in the first `notes` entry:
- `"Lavanya. Active -- DID Worldwide provider issue."` -> Lavanya
- `"Keyur + Sai + Lavanya. Race condition suspected."` -> Keyur, Sai, Lavanya
- `"Henrik. Bug #6."` -> Henrik
- `"Team. Before launch."` -> Team (unassigned)
- `"Tomas."` -> Tomas

Pattern: `^([A-Z][a-z]+(?:\s*\+\s*[A-Z][a-z]+)*)\b` at start of first note. Works for ~300 of 615 tasks.

---

## Proposed Solution

Three workstreams, implementable independently:

### Workstream 1: `owner` field in task schema + backfill

**Schema change** (core-skills `ops-config/schema.md`):

```yaml
tasks:
  - id: 1
    task: "Fix something"
    owner: [string]              # NEW: list of owner names (optional)
    tags: [...]
    ...
```

- `owner` is a list (supports multi-owner: `[Keyur, Lavanya]`)
- Optional -- backward compatible. If missing, parser falls back to notes-pattern detection
- `/ops` and `/transcript` task import writes `owner` going forward

**Backfill script** (one-time, in visualisation repo):

```python
# scripts/backfill_owners.py
# Reads all _tasks.yaml, extracts owner from notes[0] pattern, writes owner field
# Dry-run mode by default, --write to apply
```

Detects ~300 owners from notes patterns. Remaining ~170 are marked `owner: []` (unassigned).

**Skill changes** (core-skills):
- `ops/SKILL.md` Step 9 task import: add `owner` field when creating tasks
- `transcript/SKILL.md` Step 4 task import: add `owner` field when creating tasks

### Workstream 2: Visualisation -- Task overview page redesign

Replace the current flat kanban/table with a layered navigation:

**Level 1: Summary dashboard** (default landing on `/tasks`)

```
+------------------------------------------------------------------+
| MY TASKS (Tomas)                              [Switch user: v]   |
|                                                                   |
| P0: 3  |  P1: 12  |  Blocked: 2  |  Overdue: 5                  |
|                                                                   |
| [Card: sonetel-mobile-v3]  [Card: new-website]  [Card: mgmt]    |
| Active: 107 | P0: 16     Active: 85 | P0: 8    Active: 84       |
| Blocked: 3              Blocked: 3             Blocked: 5        |
| My: 8                   My: 4                  My: 12            |
|                                                                   |
| [Card: marketing]  [Card: t1k]  [Card: contacts]  [+6 more]     |
+------------------------------------------------------------------+
```

- Top bar: "My Tasks" count + P0/P1/blocked/overdue summary across ALL projects
- Project cards: active count, blocked count, P0 count, "My" count
- Click card -> drill into project (Level 2)
- "Switch user" dropdown: Tomas (default), All, or any detected team member

**Level 2: Project task view** (click a project card)

The current kanban/table view, but scoped to one project:
- Kanban or table toggle (existing)
- Status/priority/tag badges (existing)
- Owner badge row (NEW): filter by person within the project
- "Back to overview" link

**Level 3: Cross-project smart views** (top-level shortcuts)

Accessible from the summary dashboard:
- "All P0" -- every P0 task across all projects
- "All Blocked" -- every blocked task
- "All Overdue" -- every overdue task
- "My Tasks" -- all tasks where owner includes current user

These are just pre-filtered versions of the table view with project column visible.

### Workstream 3: API changes

**New endpoints:**

```
GET /api/tasks/summary
  Returns per-project summary: {project, active, blocked, p0, p1, overdue, my_count}
  Query params: owner=Tomas (filter "my" counts)

GET /api/tasks/owners
  Returns list of all detected owners with task counts
  [{name: "Tomas", active: 45, completed: 12}, ...]

GET /api/tasks?owner=Tomas
  Existing endpoint, new filter param: filter tasks by owner
```

**Modified endpoints:**

```
GET /api/tasks
  Add `owner` to serialized task output
  Add `owner` query param for filtering
  Add `hide_completed=true` (default) query param

GET /api/tasks/stats
  Add owner_counts to stats output
```

**Parser changes:**

```python
# parsers/tasks.py

def extract_owner(task):
    """Extract owner from explicit field or notes[0] pattern."""
    if task.get('owner'):
        return task['owner'] if isinstance(task['owner'], list) else [task['owner']]
    notes = task.get('notes', []) or []
    if notes and isinstance(notes[0], str):
        m = re.match(r'^([A-Z][a-z]+(?:\s*\+\s*[A-Z][a-z]+)*)\b', notes[0])
        if m:
            return [n.strip() for n in m.group(1).split('+')]
    return []
```

Add to `enrich_task()` so every task gets `_owners` list.

---

## Frontend Design

### Summary dashboard layout

```
[Global filter bar: My Tasks (Tomas) | All Tasks | Team member dropdown]
[Smart views: All P0 | All Blocked | All Overdue]

[Project cards grid -- 2-3 columns]
  Each card:
    Project name
    Active: N | Blocked: N | P0: N
    Owner breakdown (mini bar chart or dots)
    Click -> project detail

[Bottom: Recently completed (last 7 days, collapsed)]
```

### Owner badges (in project detail view)

Similar to existing status/priority badges:

```
[All (85)] [Henrik (23)] [Tomas (4)] [Fluff (18)] [Joe (8)] [Vamshi (6)] [Unassigned (26)]
```

Click to filter. Works alongside status and priority badges (combinable filters).

### "My Tasks" identity

- Default user: configured in `config.py` (e.g., `MY_NAME = "Tomas"`)
- Can be switched via dropdown in the UI
- Persisted in localStorage

---

## Implementation Plan

### Phase 1: Owner field (foundation)

1. Update `ops-config/schema.md` with `owner` field definition
2. Update `parsers/tasks.py`: add `extract_owner()` and integrate into `enrich_task()`
3. Update `/api/tasks` serialization to include `_owners`
4. Add `owner` query param to `/api/tasks`
5. Create `scripts/backfill_owners.py` (dry-run + write mode)
6. Update `ops/SKILL.md` and `transcript/SKILL.md` to write `owner` on task import

### Phase 2: Summary dashboard

1. Add `GET /api/tasks/summary` endpoint
2. Add `GET /api/tasks/owners` endpoint
3. Redesign `templates/tasks.html` with summary dashboard as default
4. Create `static/js/task-summary.js` for dashboard rendering
5. Add `config.MY_NAME` setting
6. Project cards with click-to-drill-in

### Phase 3: Enhanced filtering

1. Add owner badges to project detail view
2. Add `hide_completed` default behavior (toggle to show)
3. Smart views: All P0, All Blocked, All Overdue
4. Combinable filters (status + priority + owner + tag)

### Phase 4: Skill integration

1. Run backfill script across vault
2. Update `/ops` task import to write `owner`
3. Update `/transcript` task import to write `owner`
4. Verify new tasks get `owner` field automatically

---

## Migration Strategy

The `owner` field is **additive and optional**:

1. **No breaking changes** -- tasks without `owner` still work (parser falls back to notes detection)
2. **Backfill is safe** -- script only adds `owner` field, never removes or changes existing fields
3. **Gradual adoption** -- new tasks from `/ops` and `/transcript` get `owner` automatically
4. **Manual tasks** from `/tasks add` can optionally include owner

---

## Testing Plan

1. **Parser**: Unit test `extract_owner()` with all observed patterns (single, multi, Team, unassigned)
2. **API**: Test `/api/tasks?owner=Tomas` returns correct subset
3. **API**: Test `/api/tasks/summary` aggregation
4. **Backfill**: Dry-run on vault, verify detected owners match expectations
5. **Frontend**: Verify summary dashboard renders with real data
6. **Frontend**: Verify owner badge filtering works in combination with status/priority
7. **End-to-end**: Process a meeting via `/ops`, verify task import includes `owner`, verify it shows in visualisation

---

## Open Questions

1. Should `owner` support aliases (e.g., "KU" -> "Keyur")? Probably yes, using org config team aliases.
2. Should the backfill script also normalize names (e.g., "Keyur + Lavanya" -> `[Keyur, Lavanya]`)? Yes.
3. Should completed tasks be archived after N days (e.g., 30 days)? Or just hidden in UI?
4. Should the "My Tasks" default user come from the OS username, config, or first-time setup?

---

*Created: 2026-03-27*
