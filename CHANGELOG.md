# Changelog

## [0.4.0] - 2026-03-05

### Added
- **Project page (CR-002):** New `/projects` page with card-based list view and three-column detail view showing ops structure per project
- **Project detail view:** Left nav with ops files (README, CHANGELOG, CLAUDE.md), meetings list, sub-projects, and contact folders. Center panel renders file content (README by default). Right panel shows project-scoped tasks.
- **`/api/projects/<name>` endpoint:** Returns full project detail with ops files, meetings, sub-projects, contact folders, tasks, and stats
- **YYYY-MM-DD date support:** `parse_filename_date()` now handles both `YYMMDD-` and `YYYY-MM-DD-` filename formats

### Changed
- **Project discovery simplified:** Root-level vault folders use `min_score=1` (any .md file is enough). No more sub-folder scanning -- root folders are the projects, subfolders belong to them.
- **Contacts combined:** All `_contacts/*` subfolders are now a single "contacts" project instead of individual projects per contact
- **Sub-project detection:** Checks both `_projects/` and `projects/` subfolder conventions
- **Meeting folder detection:** Checks both `meetings/` and `moten/` subfolder conventions

## [0.3.3] - 2026-03-05

### Added
- **Documents tasks panel:** Three-column layout with tasks panel showing active tasks from the selected document's folder context. Uses nearest ancestor `_tasks.yaml` matching so contact folders show their own tasks, not the parent project's.
- **Folder-scoped task API:** New `folder` parameter on `/api/tasks` finds the nearest `_tasks.yaml` ancestor to a given document path. Tasks grouped by status (in_progress, blocked, pending) with priority sorting.

### Fixed
- **Contact folders not discovered:** `_contacts/` subfolders with only a CHANGELOG or dated files (score=1) were excluded by the discovery threshold of 2. Lowered threshold to 1 for contact folders and added dated files as a discovery indicator.

## [0.3.2] - 2026-03-05

### Changed
- **Insights page redesign (CR-001):** Replaced stat cards, timeline chart, and type distribution chart with a focused type x tag pivot heatmap
- **Type toggle badges:** Multi-select type filtering replaces single-select dropdown. Color-coded badges show counts per type.
- **Context filter badges:** Toggle badges per contact/project folder. Filters the pivot and detail table by context.
- **Pivot heatmap:** Type (rows) x Tag (columns) matrix with color-coded intensity cells. Equal-width columns. Click a cell to drill down.
- **Detail table on click:** Clicking a pivot cell shows matching insights below. Hidden by default.
- **API extensions:** `tag_counts`, `context_counts`, `type_context_matrix`, `type_tag_matrix` in `/api/insights` response. Multi-type filter support (`type=decision,learning`).
- **Parser:** Added `aggregate_tag_counts()`, `aggregate_context_counts()`, `aggregate_type_context_matrix()`, `aggregate_type_tag_matrix()`. `filter_insights()` supports comma-separated types.
- **Documents page** replaces Recent Updates page (`/documents` replaces `/recent`)
- **Project filter badges:** Toggle by project/context on the Documents page
- **Document type filter badges:** Toggle by type (standup, conversation, board, preparation, etc.)
- Day badges, file list with markdown preview panel preserved
- API: `/api/files/recent` now returns `project_counts` and `type_counts` for badge rendering
- Sidebar nav: "Recent" renamed to "Documents"

## [0.3.0] - 2026-03-04

### Changed
- **Distributed task scanning:** `parsers/tasks.py` now has `scan_tasks()` that walks the vault for all `_tasks.yaml` files, supporting both v1 (per-task `project:`) and v2 (`context`/`scope` at file level). Each task enriched with `_source_file`, `_project`, `_display_id`.
- **TTL-based task cache:** `app.py` `_get_tasks_cached()` switched from single-file mtime to TTL-based cache (like insights), using `scan_tasks()` for aggregation.
- **Filter by derived project:** `_filter_tasks()` uses `_project` field for matching distributed tasks.
- Task serialization includes `_source_file`, `_project`, `_display_id` fields.

### Fixed
- **Private tasks visible when project selected:** When a specific project is explicitly selected (e.g., `personal`), private tasks within that project are now shown. Previously all `private: true` tasks were hidden regardless of project selection, making the personal project appear empty.

## [0.2.3] - 2026-03-04

### Changed
- **Vault folder structure support:** Updated parsers for new `_contacts/`, `_projects/`, `_private/` convention
  - `parsers/insights.py`: Scans `_contacts/*/` and `_projects/*/` instead of `=*/` folders
  - `parsers/activity.py`: Project discovery handles `_projects/`, `_contacts/`, `_private/` as container folders; removed `_templates` from skip list

## [0.2.2] - 2026-03-04

### Added
- **Help page** (`/help`): Tabbed view rendering core-skills README, visualisation README, and merged changelogs directly from markdown files on disk. No content duplication -- reads live from source repos.
- Help nav item in sidebar

### Fixed
- **Insights deduplication:** `scan_insights()` now tracks real paths to prevent scanning the same directory tree twice (e.g., `=privat/` was scanned both as a project folder from `_tasks.yaml` and as a `=*/` contact folder, causing all insights to appear doubled)

## [0.1.0] - 2026-03-02

Initial release.

### Added
- Dashboard with stat cards, priority doughnut chart, project bar chart, overdue tasks list
- Task board with kanban view (pending/in_progress/blocked/completed) and sortable table view
- Task detail page with notes timeline, source links, and obsidian:// URIs
- Activity view with calendar heatmap, domain bar chart, type pie chart, trend line chart
- Recent Updates page with file list grouped by day and markdown preview panel
- Multi-project support auto-discovered from `_tasks.yaml` projects section
- Folder selector scopes all views to a specific project
- Privacy toggle for `private: true` tasks and `shared_view: false` folders
- Filter bar with priority dropdown and tag search
- Auto-refresh toggle (60s interval) and manual refresh button
- Design token system (`--cs-` prefix) with sidebar navigation layout
- In-memory caching with mtime-based invalidation for tasks/history
- Direct vault file reads (no database)
