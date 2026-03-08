# Changelog

## [0.5.3] - 2026-03-08

### Added
- **Global "Add to Inbox" button:** `+ Add to Inbox` button in sidebar, accessible from every page. Opens modal with title, type, project, tags, content textarea, and file drop zone. No longer limited to the `/inbox` page.

## [0.5.2] - 2026-03-08

### Changed
- **Inbox Add modal redesigned:** Two-column form layout with project selector (populated from `/api/projects`), comma-separated tags field, and file drop zone. Dropped files auto-fill title from filename and content into textarea. Project and tags are stored on the item and shown in the item list.
- **Item list enriched:** Project badge and tags now visible on each inbox item in the list view.
- **API `POST /api/inbox/add`:** Now accepts `project` and `tags` (comma-separated string) fields.

## [0.5.1] - 2026-03-08

### Added
- **File drop auto-registration:** Any `.md` or `.txt` file placed directly in `_inbox/` is automatically detected and registered in `_inbox.yaml` on next load. Title derived from filename, content type detected from file contents. Source method tracked as `file_drop`. No duplicates on repeated loads.

## [0.5.0] - 2026-03-08

### Added
- **Inbox page (`/inbox`):** Two-column layout for viewing, triaging, classifying, and archiving inbox items. Status and type filter badges, item preview with rendered markdown, classification panel with routing fields and confidence selector.
- **Quick Add modal:** Create inbox items directly from the browser with title, type, and content fields.
- **Nav badge:** Inbox count badge in sidebar navigation, visible on all pages, auto-updates on changes.
- **`parsers/inbox.py`:** Parse `_inbox.yaml`, load items, read and render content files, compute stats by status/classification/type.
- **`parsers/inbox_writer.py`:** Write operations -- create item (writes .md file + updates yaml), update classification and routing, archive (moves file to `.archive/`).
- **6 API endpoints:** `GET /api/inbox` (list/filter), `GET /api/inbox/<id>` (detail + rendered content), `GET /api/inbox/count` (nav badge), `POST /api/inbox/add` (create), `POST /api/inbox/<id>/classify` (update classification), `POST /api/inbox/<id>/archive` (archive).
- **Inbox cache slot:** TTL-based caching with targeted invalidation on write operations.
- **`INBOX_DIR`, `INBOX_FILE` constants** in `config.py`.

## [0.4.4] - 2026-03-06

### Changed
- **Document threading visibility:** Prep+conversation threads now use accent-colored left border, light background, dashed separator, and colored "PREP" badge instead of barely-visible gray styling.
- **Daily dashboard skill:** Updated `skill.md` to write `_Dashboard.md` to vault root instead of vault parent directory.

## [0.4.3] - 2026-03-05

### Added
- **Dashboard files in Documents page:** `_Dashboard*.md` files from the vault root now appear in the recent files list on the Documents page, viewable like any other file.
- **`scan_dashboard_files()` in `parsers/activity.py`:** Scans vault root for `_Dashboard*.md` files modified within the given time window.

### Changed
- **Dashboard page layout:** Moved tasks panel from right-side column to below the document preview (2-column layout with content-stack), matching the Projects and Documents pages.
- **Dashboard task table:** Replaced grouped card-style task list with inline table including done button, priority badges, status, due date, and tags columns.

## [0.4.2] - 2026-03-05

### Fixed
- **Ollama API:** Switched from OpenAI-compatible `/v1/chat/completions` to native `/api/chat` with `think: false` and `stream: false`. Avoids reasoning token bloat and timeout issues.
- **Default model:** Changed from `qwen3.5:35b` (cold start timeout on 24GB model swap) to `qwen3:30b` (already loaded, 178 tok/s).

## [0.4.1] - 2026-03-05

### Added
- **Task completion from UI:** "Mark as Done" button on task detail page and checkmark button on kanban cards. Writes back to `_tasks.yaml` (sets `status: completed`, `completed: YYMMDD`) and appends entry to `_tasks-history.md`.
- **`POST /api/tasks/<id>/complete` endpoint:** Resolves source file from cached task data, updates YAML, writes history, invalidates cache.
- **`parsers/task_writer.py`:** New module with `complete_task()` and `append_to_history()` -- keeps write logic separate from read-only parsers.
- **Insight synthesis via LLM:** New `/synthesis` page runs cross-folder pattern analysis on accumulated insights using Ollama (local), Anthropic, or OpenAI.
- **`parsers/synthesis.py`:** Provider abstraction (`_call_ollama`, `_call_anthropic`, `_call_openai`), `call_llm()` dispatcher, `test_connection()`, `build_synthesis_prompt()`, `run_synthesis()`, JSON extraction, save/load syntheses.
- **Synthesis API:** `GET /api/synthesis` (list), `GET /api/synthesis/<id>` (detail), `POST /api/synthesis/run` (trigger), `POST /api/llm/test` (test connection).
- **LLM settings in Settings page:** Provider dropdown (Ollama/Anthropic/OpenAI), endpoint URL, model name, API key field, "Test Connection" button with provider-dependent field visibility.
- **Synthesis nav link** in sidebar between Insights and Settings.
- **`data/syntheses/`** directory for saved synthesis results (gitignored).

### Changed
- **`requirements.txt`:** Added `requests` for LLM API calls.
- **`config.py`:** Added `llm` defaults (Ollama at `localhost:11434`, `qwen3.5:35b`) and `SYNTHESIS_DIR` constant. Default LLM timeout set to 600s for large model cold starts.

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
