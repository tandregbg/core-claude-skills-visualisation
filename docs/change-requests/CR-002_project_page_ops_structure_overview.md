# CR-002: Project page -- ops-structure project overview

| Field | Value |
|-------|-------|
| **CR Number** | CR-002 |
| **Date** | 2026-03-05 |
| **Author** | Claude Code |
| **Status** | Proposed |
| **Priority** | High |
| **Complexity** | Medium-High |
| **Estimated Scope** | Frontend, Backend, API, Parsers |
| **Related CRs** | None |
| **Depends On** | None |
| **Breaking Changes** | No |

---

## Executive Summary

The app currently has no project-centric view. Users can filter by project on Documents and Dashboard pages, but cannot see a project's full ops structure: its README status, CHANGELOG history, meetings index, tasks, and sub-projects in one place. This CR adds a dedicated `/projects` page with a project list and a detail view that surfaces the ops structure (`/ops` skill) for each discovered project.

**Current Problems:**
1. No way to see a project's README, CHANGELOG, meetings, tasks, and sub-projects together
2. Project discovery exists in the backend but has no dedicated frontend representation
3. Ops structure files (README.md, CHANGELOG.md) are only visible as recent file entries, not as project context

---

## Problem Analysis

The `/ops` skill creates projects with a standard structure: `README.md` (status overview), `CHANGELOG.md` (history), `_tasks.yaml` (tasks), `meetings/` (meeting notes), `CLAUDE.md` (project config), and optionally `projects/` (sub-projects). The visualisation app discovers these projects via `activity.py:discover_projects()` and uses them for filtering, but never presents a project-level overview.

Users must jump between Documents (to find files), Tasks (to see project tasks), and Analytics (for activity data) to get a full picture of a project's state. A project page consolidates this.

---

## Proposed Solution

### Route and Template

Add `/projects` page route and `/projects/<name>` detail route. The list view shows all discovered projects as cards. Clicking a card navigates to the detail view.

### Project Detail Layout

Three-panel layout consistent with Documents page:

```
+---------------------------+----------------------------+------------------+
| Project Sidebar           | Content Preview            | Tasks Panel      |
|                           |                            |                  |
| README status summary     | Selected file rendered     | Project tasks    |
| CHANGELOG (last 5)        | (README by default)        | from _tasks.yaml |
| Meetings (recent 10)      |                            |                  |
| Sub-projects list         |                            |                  |
| Ops files                 |                            |                  |
+---------------------------+----------------------------+------------------+
```

**Left column -- Project nav:**
- Project name + vault path
- Ops file links: README.md, CHANGELOG.md, CLAUDE.md (if they exist)
- Recent meetings list (last 10 dated files from meetings/)
- Sub-projects list (from projects/ subfolder, if exists)
- Stats: total files, date range

**Center column -- Content preview:**
- Loads README.md by default when project detail opens
- Click any file in left column to preview it
- Same markdown rendering as Documents page

**Right column -- Tasks:**
- Project-scoped tasks from _tasks.yaml
- Same task panel rendering as Documents page (340px width)

### API Endpoint

New `/api/projects/<name>` endpoint returns:
- Project config (vault path, discovered/registered, enabled)
- Ops files with paths and existence flags
- Recent meetings list
- Sub-projects list
- File counts and date range

---

## Implementation Plan

### Phase 1: Backend -- API endpoint and parser

1. Add `get_project_detail()` function to `parsers/activity.py` that scans a project folder for ops structure
2. Add `/api/projects/<name>` API endpoint in `app.py`
3. Return: ops files (README, CHANGELOG, CLAUDE.md existence + paths), recent meetings, sub-projects, stats

### Phase 2: Frontend -- Template and JS

1. Create `templates/projects.html` with list view and detail view (same page, JS-driven)
2. Create `static/js/projects.js` with project list rendering, detail loading, file preview
3. Add nav item to `base.html` sidebar
4. Add CSS for project cards and detail layout to `static/css/main.css`

### Phase 3: Navigation integration

1. Add `/projects` and `/projects/<name>` routes to `app.py`
2. Wire up project badges/links from other pages to link to project detail

---

## Files to Modify/Create

| File | Action | Changes |
|------|--------|---------|
| `parsers/activity.py` | Modify | Add `get_project_detail()` function |
| `app.py` | Modify | Add `/projects` route, `/projects/<name>` route, `/api/projects/<name>` endpoint |
| `templates/projects.html` | **CREATE** | Project list + detail template |
| `templates/base.html` | Modify | Add "Projects" nav item to sidebar |
| `static/js/projects.js` | **CREATE** | Project list and detail JS |
| `static/css/main.css` | Modify | Project card and detail layout styles |

---

## Testing Plan

### Test Case 1: Project list loads

- Navigate to `/projects`
- Verify: All discovered projects shown as cards with name, file count, last activity

### Test Case 2: Project detail -- full ops structure

- Click a project card that has full ops structure
- Verify: README.md loads in preview, CHANGELOG visible in sidebar, meetings listed, tasks shown in right panel, sub-projects listed

### Test Case 3: Project detail -- minimal structure

- Click a project card with minimal structure
- Verify: No README/CHANGELOG/meetings but files still listed, graceful empty states

### Test Case 4: Project detail -- contacts (combined folder)

- Click contacts project card
- Verify: Shows aggregated view of all contact subfolders

### Test Case 5: File preview from project detail

- In project detail, click a meeting file
- Verify: Content renders in center panel, tasks update to folder context

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Large projects slow to scan | Medium | Low | Reuse cached activity data, lazy-load meetings list |
| Sub-project detection false positives | Low | Low | Only list directories under `projects/` subfolder |
| Contacts project too large | Medium | Medium | Group contact subfolders as sections within the detail view |

---

## Rollback

1. Remove `/projects` and `/projects/<name>` routes from `app.py`
2. Remove `templates/projects.html` and `static/js/projects.js`
3. Remove nav item from `base.html`
4. Remove CSS additions from `main.css`
5. Remove `get_project_detail()` from `parsers/activity.py`

---

## Success Criteria

1. `/projects` page lists all discovered projects with name, file count, and last activity date
2. Clicking a project shows its ops structure: README, CHANGELOG, meetings, tasks, sub-projects
3. README.md loads by default in the content preview
4. Tasks panel shows project-scoped tasks
5. Projects without full ops structure show graceful empty states
6. Navigation from project detail to Documents page preserves project filter

---

## References

- `parsers/activity.py` -- `discover_projects()`, `scan_vault_folder()`, `scan_ops_files()`
- `templates/documents.html` -- Three-column layout pattern
- `static/js/documents.js` -- File preview and task panel logic
- `/ops` skill -- Defines the ops structure convention
