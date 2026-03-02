# core-skills-visualisation

Local web app for visualizing runtime data produced by the core-skills framework.
Reads `_tasks.yaml`, `_tasks-history.md`, and dated markdown files from the Obsidian vault.

## Setup

```bash
cd ~/Projects/core-skills-visualisation
pip install -r requirements.txt
python app.py
```

Open http://localhost:5050

## Configuration

Copy `.env.example` to `.env` and adjust:

- `VAULT_PATH` -- path to the Obsidian vault root
- `FLASK_PORT` -- port to run on (default 5050)

Project folders are auto-discovered from `_tasks.yaml`.

## Features

- Dashboard with task stats, priority distribution, project breakdown
- Kanban board and sortable table for tasks
- Calendar heatmap and activity charts for vault files
- Task detail with notes timeline and obsidian:// links
- Multi-folder support with folder selector
- Privacy toggle for private tasks and folders
