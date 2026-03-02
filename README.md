# core-skills-visualisation

> v0.1.0

Local web app for visualizing runtime data produced by the core-skills framework.
Reads `_tasks.yaml`, `_tasks-history.md`, and dated markdown files from the Obsidian vault.

## Setup

```bash
cd ~/Projects/core-skills-visualisation
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open http://localhost:5050

### pm2

```bash
pm2 start "venv/bin/python app.py" --name "core-skills-vis" --cwd ~/Projects/core-skills-visualisation
pm2 save
```

## Configuration

Copy `.env.example` to `.env` and adjust:

- `VAULT_PATH` -- path to the Obsidian vault root
- `FLASK_PORT` -- port to run on (default 5050)

Project folders are auto-discovered from `_tasks.yaml`.

## Features

- **Dashboard** -- stat cards, priority doughnut chart, project bar chart, overdue tasks list
- **Task Board** -- kanban view (4 columns) and sortable table with priority/tag filters
- **Task Detail** -- notes timeline, source links, obsidian:// URIs
- **Activity** -- calendar heatmap, domain/type charts, weekly trend
- **Recent Updates** -- file list grouped by day with markdown preview panel
- Multi-project support with folder selector
- Privacy toggle for private tasks and folders
- Auto-refresh (60s) and manual refresh
