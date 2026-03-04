# Changelog

## [0.2.1] - 2026-03-04

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
