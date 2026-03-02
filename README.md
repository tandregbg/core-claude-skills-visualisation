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

## core-skills -- Data Source

This app visualizes data produced by **core-skills**, a set of Claude Code skills for operational documentation, transcript processing, and task tracking.

### What core-skills produces

| Skill | Output | Visualized as |
|-------|--------|---------------|
| `/tasks` | `_tasks.yaml` (active tasks), `_tasks-history.md` (completed log) | Dashboard stats, task board, task detail |
| `/ops` | `YYMMDD-*.md` meeting summaries, CHANGELOGs | Activity heatmap, domain charts, recent files |
| `/transcript` | `YYMMDD-samtal-*.md` call summaries | Activity heatmap, recent files |
| `/preparation` | `YYMMDD-förberedelse-*.md` meeting prep | Activity heatmap, recent files |
| `/daily-dashboard` | `_Dashboard.md` | (not visualized -- separate workflow) |

### Installing core-skills

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

```bash
# Clone the repo
git clone https://github.com/tandregbg/core-claude-skills.git core-skills

# Create the bootstrap symlink
mkdir -p ~/.claude/skills
ln -s "$(pwd)/core-skills/skills/update-skills" ~/.claude/skills/update-skills
```

Then in Claude Code, run `/update-skills update` to create all remaining symlinks.

### Vault structure

core-skills expects an Obsidian vault with project folders. The `_tasks.yaml` file lives at the vault root and defines which project folders exist:

```yaml
projects:
  sonetel:
    vault: sonetel/
    shared_view: true
  t1k:
    vault: t1k-projects/
    shared_view: true
  personal:
    vault: "=privat/"
    shared_view: false
```

Each project folder contains dated markdown files (`YYMMDD-*.md`) produced by `/ops`, `/transcript`, and `/preparation`. The app scans these folders recursively and classifies files by domain (based on path) and type (based on filename keywords).

### Generating data

After installing core-skills, use these commands in Claude Code from within a vault folder:

```
/ops [paste meeting transcript]      Process a meeting into structured summary
/transcript [paste recording]        Summarize a call or voice recording
/preparation david                   Create meeting prep from contact history
/tasks add "Fix login bug"           Add a task manually
/tasks done 5                        Mark task #5 as completed
/daily-dashboard                     Generate daily overview with tasks
```

The visualisation app reads the resulting files in real-time -- no import or sync needed. Point `VAULT_PATH` in `.env` to your vault root and the app picks up everything automatically.
