# Changelog

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
