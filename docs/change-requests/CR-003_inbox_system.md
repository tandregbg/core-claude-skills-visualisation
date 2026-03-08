# CR-003: Inbox system -- universal entry point for unstructured content

| Field | Value |
|-------|-------|
| **CR Number** | CR-003 |
| **Date** | 2026-03-08 |
| **Author** | Claude Code |
| **Status** | Proposed |
| **Priority** | High |
| **Complexity** | Medium-High |
| **Estimated Scope** | core-skills skill, visualiser parsers, API, templates, JS, CSS |
| **Related CRs** | None |
| **Depends On** | None |
| **Breaking Changes** | No |

---

## Executive Summary

There is no universal entry point for unstructured content (voice memos, quick notes, raw text, forwarded emails). Today, the user must decide upfront which skill to run (`/transcript`, `/ops`, `/tasks`) before content is even classified. This creates friction and means quick captures often get lost.

This CR creates a two-part inbox system: (1) an `/inbox` skill in core-skills that accepts raw content, auto-classifies it, stores it in `_inbox/`, and hands off to the appropriate downstream skill; and (2) an inbox page in the visualiser where items can be viewed, triaged, classified, quick-captured, and archived from the browser.

**Current Problems:**
1. No universal capture mechanism -- the user must choose the right skill before content is even understood
2. Quick captures (voice memos, pasted text) have no consistent storage location
3. No visibility into what has been captured but not yet processed

---

## Problem Analysis

The current workflow requires the user to mentally classify content before acting on it:

- Voice memo about a meeting -> must know to run `/transcript`
- Email from a team member about ops -> must know to run `/ops`
- Quick idea or TODO -> must know to run `/tasks add`
- Raw text that doesn't fit neatly -> nowhere to put it

This pre-classification step is the main source of friction. Content gets lost in chat history, clipboard, or is never captured at all. There is also no way to see "what's pending" across all content types.

The solution uses a file-first approach: each inbox item is a standalone `.md` file in `_inbox/` at the vault root, with a `_inbox.yaml` index tracking metadata and lifecycle state. This is consistent with existing vault patterns (`_tasks.yaml`, `_Dashboard.md`).

---

## Proposed Solution

### Data Model

**Location:** `vault/_inbox/`

```
_inbox/
  _inbox.yaml                              # Index: metadata + lifecycle state
  260308-voice-memo-morning-thoughts.md    # Active item
  260309-quick-note-api-idea.md            # Active item
  .archive/                                # Processed items
    260307-email-client-proposal.md        # Done, moved here
```

**`_inbox.yaml` structure:**

```yaml
version: 1
last_updated: 260308
next_id: 4
items:
  - id: 1
    title: "Morning thoughts on mobile strategy"
    type: voice_memo          # voice_memo | quick_note | email | raw_text | clipboard
    classification: transcript # null | transcript | ops | task | note | idea
    status: new               # new | classified | done | archived
    file: "260308-voice-memo-morning-thoughts.md"
    created: 260308
    source_method: skill       # skill | web_ui
    routing:
      target_skill: null       # null | transcript | ops | tasks
      target_folder: null      # vault-relative path
      confidence: null         # null | high | medium | low
    processed:
      date: null
      output_file: null        # vault-relative path to result file
    tags: []
```

**Content files:** `YYMMDD-type-description.md` -- standard markdown, self-contained, renderable in Obsidian and the visualiser.

### Part 1: `/inbox` Skill (core-skills)

New skill at `skills/inbox/SKILL.md` with subcommands:

- `/inbox [content]` -- accept raw content, classify, store, suggest next skill
- `/inbox status` -- show inbox state (counts by status)
- `/inbox process [id]` -- look up stored item and hand off
- `/inbox help` -- usage guide

**Classification flow:**
1. Parse input -- detect content type (voice transcript, email, raw text, file reference)
2. Auto-classify -- keyword/signal detection (speakers/timestamps -> transcript, org names -> ops, TODO/imperatives -> task, short text -> note)
3. Determine routing -- consult CLAUDE.md meeting routing, match participants to `_contacts/`
4. Confirm with user -- present classification + routing suggestion, allow override
5. Store in `_inbox/` -- write .md file + update `_inbox.yaml`
6. Hand off -- tell user which downstream skill to run
7. Mark done -- after user processes, update yaml + move to `.archive/`

### Part 2: Inbox Page (visualiser)

Two-column layout (same pattern as Documents page):

- **Left column (40%):** Item list with status/type filter badges
- **Right column (60%):** Preview of selected item + classification controls + archive action
- **Quick Add:** Modal with title + textarea for pasting content
- **Nav badge:** Non-archived item count shown on all pages

**API endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/inbox` | List items (filter by status, classification) |
| GET | `/api/inbox/<id>` | Single item metadata + rendered content |
| GET | `/api/inbox/count` | Count of non-archived items (for nav badge) |
| POST | `/api/inbox/add` | Create item from web UI |
| POST | `/api/inbox/<id>/classify` | Update classification + routing |
| POST | `/api/inbox/<id>/archive` | Move to `.archive/`, set status=archived |

---

## Implementation Plan

### Phase 1: Data layer (visualiser)

1. Add `INBOX_DIR`, `INBOX_FILE` constants to `config.py`
2. Create `parsers/inbox.py` -- `load_inbox()`, `get_inbox_item()`, `get_inbox_stats()`, auto-create empty state
3. Create `parsers/inbox_writer.py` -- `create_item()`, `update_classification()`, `archive_item()`

### Phase 2: Backend (visualiser)

4. Add cache slot + `_get_inbox_cached()` helper to `app.py`
5. Add 6 API endpoints to `app.py`
6. Add page route `GET /inbox` to `app.py`

### Phase 3: Frontend (visualiser)

7. Create `templates/inbox.html` -- two-column layout with filter badges
8. Create `static/js/inbox.js` -- list, preview, classify, quick-add, archive
9. Update `templates/base.html` -- add Inbox nav item with badge
10. Update `static/js/main.js` -- fetch `/api/inbox/count` for nav badge
11. Add inbox styles to `static/css/main.css`

### Phase 4: Skill (core-skills)

12. Create `skills/inbox/SKILL.md` with full classification + handoff spec

### Phase 5: Integration

13. Seed `_inbox/` folder in vault with empty `_inbox.yaml` + `.archive/`
14. Update core-skills `README.md` to list inbox skill

---

## Files to Modify/Create

| File | Action | Changes |
|------|--------|---------|
| `config.py` | Modify | Add `INBOX_DIR`, `INBOX_FILE` constants |
| `parsers/inbox.py` | **CREATE** | Parse `_inbox.yaml`, load items, read content files, compute stats |
| `parsers/inbox_writer.py` | **CREATE** | Write operations: create item, classify, archive |
| `app.py` | Modify | Add page route `/inbox`, 6 API endpoints, cache slot |
| `templates/inbox.html` | **CREATE** | Page template extending base.html, two-column layout |
| `static/js/inbox.js` | **CREATE** | Page logic: list, preview, classify, quick-add, archive |
| `templates/base.html` | Modify | Add Inbox nav item with count badge |
| `static/js/main.js` | Modify | Fetch `/api/inbox/count` for nav badge |
| `static/css/main.css` | Modify | Inbox-specific styles |
| `~/repos/core-skills/skills/inbox/SKILL.md` | **CREATE** | Skill definition |
| `~/repos/core-skills/README.md` | Modify | List inbox skill |

---

## Testing Plan

### Test Case 1: Empty state
- Start Flask, navigate to `/inbox`
- Verify: Empty state renders gracefully with "No items" message and Quick Add button

### Test Case 2: Quick Add from browser
- Click Quick Add, enter title + content, submit
- Verify: `.md` file appears in `_inbox/`, `_inbox.yaml` updates with new item, item appears in list

### Test Case 3: List + Preview
- Create 2-3 items, click each in the list
- Verify: Items render in left column, clicking shows rendered markdown content in right column

### Test Case 4: Classification
- Select an item, change classification via dropdown, save
- Verify: `_inbox.yaml` updates with new classification, routing fields, and confidence

### Test Case 5: Archive
- Archive an item via the Archive button
- Verify: File moves to `_inbox/.archive/`, status changes to archived, item disappears from active list

### Test Case 6: Nav badge
- Create items, navigate to other pages
- Verify: Inbox count badge shows on all pages, updates when items are added/archived

### Test Case 7: Skill classification
- Run `/inbox` in Claude Code with voice memo content containing speaker labels
- Verify: File + yaml creation, classification as transcript, correct handoff suggestion

### Test Case 8: Skill handoff
- Run `/inbox` with content containing TODO items
- Verify: Suggests `/tasks add` with the right description

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| YAML corruption on concurrent writes (skill + web UI) | Low | Medium | File-level locking in writer, last-write-wins for web UI |
| Classification accuracy too low | Medium | Low | User always confirms before handoff; classification is a suggestion |
| Inbox becomes a dumping ground | Medium | Low | Nav badge creates visibility; archive pattern keeps active list clean |
| Cross-repo coordination complexity | Low | Low | Skill is standalone .md file; visualiser is the primary implementation |

---

## Rollback

1. Remove inbox routes and API endpoints from `app.py`
2. Remove nav badge code from `base.html` and `main.js`
3. Delete `parsers/inbox.py`, `parsers/inbox_writer.py`, `templates/inbox.html`, `static/js/inbox.js`
4. Remove inbox constants from `config.py`
5. Remove inbox styles from `main.css`
6. Delete `skills/inbox/` directory from core-skills
7. `_inbox/` folder in vault can remain (no harm, just orphaned files)

---

## Success Criteria

1. Items can be created from both the browser (Quick Add) and the CLI (`/inbox`)
2. Classification suggests the correct downstream skill for voice memos, ops content, and tasks
3. Archive flow moves files to `.archive/` and removes them from the active list
4. Nav badge shows accurate non-archived item count on all pages
5. End-to-end flow: capture -> classify -> handoff -> process -> archive works smoothly

---

## References

- `parsers/tasks.py` / `parsers/task_writer.py` -- YAML parsing and writing patterns
- `templates/documents.html` / `static/js/documents.js` -- two-column layout pattern
- `skills/transcript/SKILL.md` -- downstream skill for voice memo handoff
- `skills/ops/SKILL.md` -- downstream skill for ops content handoff
- `skills/tasks/skill.md` -- downstream skill for task handoff
