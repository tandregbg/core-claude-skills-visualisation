# CR-001: Insights page redesign -- type/tag pivot with toggle badges

| Field | Value |
|-------|-------|
| **CR Number** | CR-001 |
| **Date** | 2026-03-05 |
| **Author** | Claude Code |
| **Status** | Proposed |
| **Priority** | High |
| **Complexity** | Medium |
| **Estimated Scope** | insights page, API, parser, JS, CSS |
| **Related CRs** | None |
| **Depends On** | None (builds on existing insights implementation v0.3.0) |
| **Breaking Changes** | No |

---

## Executive Summary

The current insights page shows a flat table of insights with a dropdown type filter, a doughnut chart, and a timeline. This makes it hard to see patterns across types and tags -- the two most important dimensions for understanding where knowledge is accumulating.

This CR replaces the dropdown-based filtering with interactive toggle badges for types, adds a tag cloud with multi-select filtering, and introduces a type-by-tag pivot heatmap that shows insight density at the intersection of these dimensions.

**Current Problems:**
1. The dropdown filter only allows one type at a time -- no way to compare e.g. decisions vs learnings
2. Tags are shown per-insight but there's no aggregate view of which tags are growing
3. No way to see the relationship between types and tags (e.g. "lots of decisions about pricing but no learnings")

---

## Problem Analysis

The existing insights page has these components:
- **4 stat cards**: Total, Decisions, Opportunities, This Month
- **Filter bar**: type dropdown, status dropdown, tag text search
- **2 charts**: stacked bar timeline (by type per month), doughnut (type distribution)
- **Table**: type badge, date, summary+rationale, context, tags, source link

The type dropdown (`<select>`) limits the user to viewing one type at a time or all. There is no multi-select capability. The tag search is a text input that does substring matching -- useful for finding a specific tag, but it doesn't show tag frequency or allow discovery.

The API already returns all the data needed (`tags` array per insight, `type_counts`, `monthly` aggregations). The changes are primarily frontend with a small API extension for tag aggregation.

Current files:
- `templates/insights.html` -- stat cards, filter bar, chart canvases, list container
- `static/js/insights.js` -- fetch, render stats/charts/list, client-side tag filter
- `static/css/main.css` -- `.insight-badge`, `.insight-*` type colors, `.tag-badge`
- `parsers/insights.py` -- `scan_insights()`, `filter_insights()`, `aggregate_type_counts()`, `aggregate_monthly_counts()`
- `app.py` -- `/api/insights` endpoint

---

## Proposed Solution

### 1. Type toggle badges (replace dropdown)

Replace the `<select id="type-filter">` with a row of clickable badge buttons, one per type. Each badge shows the type name and count. Multiple badges can be active simultaneously (multi-select). All start as active; clicking toggles off/on. Uses existing `.day-badge` CSS pattern from the tasks page.

Badge colors match existing `INSIGHT_TYPE_COLORS`:
- decision: blue (`#3b82f6`)
- preference: purple (`#8b5cf6`)
- learning: green (`#22c55e`)
- opportunity: amber (`#f59e0b`)
- pattern: gray (`#6b7280`)

### 2. Tag cloud with frequency badges

Below the type badges, show a row of the top N tags (sorted by frequency), each as a clickable pill badge with count. Clicking a tag toggles it as a filter. Multiple tags can be selected (AND logic -- insight must have all selected tags). A "Show all" toggle expands to show all tags beyond the top N.

The tag data comes from a new `tag_counts` field in the API response.

### 3. Type x Tag pivot heatmap

A new chart/table between the filter bar and the insights list. Rows = insight types (5), columns = top tags (up to 15). Each cell shows the count of insights matching that type+tag combination. Cells are color-coded by intensity (0 = empty/light, higher = darker shade of the type's color). Clicking a cell sets both the type and tag filters simultaneously.

This is rendered as an HTML table (not Chart.js) for simplicity and click handling.

### 4. Updated stat cards

Keep Total and This Month. Replace the fixed "Decisions" and "Opportunities" cards with dynamic cards showing the top 2 types by count (so they adapt as the dataset grows).

### 5. Preserve existing features

- Timeline stacked bar chart stays (responds to active type/tag filters)
- Type doughnut chart stays (responds to active tag filters)
- Insights table stays with all current columns
- Status filter dropdown stays (active/superseded/archived is a different dimension)
- Project folder selector continues to work

---

## Implementation Plan

### Phase 1: API extension + tag aggregation

1. Add `aggregate_tag_counts(insights)` to `parsers/insights.py` -- returns `{tag: count}` dict
2. Add `aggregate_type_tag_matrix(insights)` to `parsers/insights.py` -- returns `{type: {tag: count}}` dict
3. Update `/api/insights` in `app.py` to include `tag_counts` and `type_tag_matrix` in response
4. Change `/api/insights` to accept `type` as comma-separated list (e.g. `type=decision,learning`) for multi-select

### Phase 2: Frontend -- type badges + tag cloud

1. Replace `<select id="type-filter">` in `insights.html` with a `<div class="filter-badges-row">` containing type badge buttons
2. Add tag cloud row below type badges
3. Update `insights.js`: track active types as a Set, active tags as a Set, re-fetch on toggle
4. Add CSS for insight type badge variants (active/inactive states) using existing `.day-badge` pattern with type-specific colors

### Phase 3: Frontend -- pivot heatmap

1. Add `<div id="type-tag-pivot">` container in `insights.html` between filter bar and charts
2. Implement `renderPivotTable(matrix, tagCounts)` in `insights.js` -- generates HTML table
3. Add CSS for heatmap cells (opacity-based intensity using type colors)
4. Wire click handler: clicking a cell activates that type + tag filter

### Phase 4: Stat cards + polish

1. Update stat cards to show dynamic top-2 types
2. Ensure all charts respond to combined type+tag filters
3. Test with empty state (no insights), single insight, many insights

---

## Files to Modify/Create

| File | Action | Changes |
|------|--------|---------|
| `parsers/insights.py` | Modify | Add `aggregate_tag_counts()`, `aggregate_type_tag_matrix()` |
| `app.py` | Modify | Update `/api/insights` to return `tag_counts`, `type_tag_matrix`; support multi-type filter |
| `templates/insights.html` | Modify | Replace type dropdown with badge row, add tag cloud, add pivot container |
| `static/js/insights.js` | Modify | Multi-select type/tag state, pivot table renderer, updated fetch logic |
| `static/css/main.css` | Modify | Add insight toggle badge styles, pivot heatmap styles, tag cloud styles |

---

## Testing Plan

### Test Case 1: Type badge toggling

- Click "decision" badge to deactivate it
- Verify: table hides decision insights, charts update, badge appears inactive (outline style)
- Click "decision" again to reactivate
- Verify: decisions reappear

### Test Case 2: Multi-type filter

- Deactivate all except "decision" and "learning"
- Verify: only decision and learning insights shown in table, charts, and pivot

### Test Case 3: Tag cloud filtering

- Click a tag pill (e.g. "pricing")
- Verify: only insights with that tag shown, pivot and charts update
- Click a second tag
- Verify: AND filter -- only insights with both tags shown

### Test Case 4: Pivot heatmap interaction

- Click a cell at intersection of "decision" row and "pricing" column
- Verify: type filter shows only decision active, tag filter shows only pricing active
- Table shows only decision insights tagged "pricing"

### Test Case 5: Combined filters

- Select project in sidebar, activate 2 types, select a tag
- Verify: all three filters combine correctly
- Change project -- verify filters reset or persist as appropriate

### Test Case 6: Empty state

- Set filters that match 0 insights
- Verify: pivot shows zeros, table shows "No insights found", charts render empty gracefully

### Test Case 7: API multi-type parameter

- Call `/api/insights?type=decision,learning`
- Verify: response contains only decision and learning insights, type_counts reflects filtered set

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Pivot table too wide with many tags | Medium | Low | Cap at 15 columns, horizontal scroll for overflow |
| Performance with large insight datasets | Low | Medium | All filtering stays client-side for responsiveness; API pre-aggregates counts |
| Badge state confusion (which are active?) | Low | Medium | Clear visual distinction: filled = active, outline = inactive. Match existing task page pattern. |

---

## Rollback

1. Revert changes to `insights.html`, `insights.js`, `main.css`
2. Restore the `<select>` dropdown for type filter
3. Remove new parser functions (backwards compatible -- API just returns fewer fields)
4. No database or schema changes to revert

---

## Success Criteria

1. Users can toggle multiple insight types on/off simultaneously using badge buttons
2. Top tags are visible as a ranked cloud with frequency counts
3. The pivot heatmap shows insight density at each type x tag intersection
4. Clicking a pivot cell filters to that specific type + tag combination
5. All existing features (timeline, doughnut, table, project filter, status filter) continue to work
6. Page loads and responds to filter changes without visible delay

---

## References

- Existing insights page: `templates/insights.html`, `static/js/insights.js`
- Task page badge pattern: `templates/tasks.html`, `static/js/tasks.js` (`.day-badge` CSS)
- Insight type colors: `INSIGHT_TYPE_COLORS` in `static/js/insights.js`
- Parser: `parsers/insights.py`
- API endpoint: `/api/insights` in `app.py`
