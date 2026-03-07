# core-skills-visualisation

> v0.4.4

Local web app for visualizing runtime data produced by the core-skills framework.
Reads `_tasks.yaml`, `_tasks-history.md`, `_insights.yaml`, and dated markdown files from the Obsidian vault.

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
- **Insights** -- type x tag pivot heatmap with context filtering (see below)
- **Documents** -- browse vault files with project and document type filter badges, day badges, markdown preview panel
- Multi-project support with folder selector
- Privacy toggle for private tasks and folders
- Auto-refresh (60s) and manual refresh

## Insights Page

The Insights page aggregates knowledge extracted from meetings and conversations by core-skills `/ops` and `/transcript`. These skills silently scan meeting summaries for durable insights and write them to per-folder `_insights.yaml` files (alongside `CHANGELOG.md`). The visualisation app is the only consumer of this data -- insights never appear in any skill output.

### What it shows

- **Type toggle badges** -- multi-select filter for insight types (decision/preference/learning/opportunity/pattern). Color-coded with counts. Click to toggle on/off.
- **Context badges** -- toggle badges per contact/project folder. Filter insights by source context.
- **Type x Tag pivot** -- heatmap with types as rows and top tags as columns. Cell color intensity shows insight density. Click a cell to drill down.
- **Detail table** -- appears below the pivot when a cell is clicked. Shows date, summary, rationale, context, tags, and source file link (obsidian:// URI). Hidden by default.
- **Status filter** -- dropdown for active/superseded/archived.

### Insight types

| Type | Badge color | Captures |
|------|-------------|----------|
| `decision` | Blue | Choices with rationale |
| `preference` | Purple | Working style and preferences |
| `learning` | Green | What worked or didn't |
| `opportunity` | Amber | Ideas not yet actioned |
| `pattern` | Gray | Recurring themes |

### How data flows

`_insights.yaml` files are per-folder (placed alongside `CHANGELOG.md`), not a single file at vault root. The parser (`parsers/insights.py`) scans across all project folders, `_contacts/*/` and `_projects/*/` folders to aggregate them.

```
Vault
 ├── project-a/meetings/management/
 │   ├── CHANGELOG.md
 │   └── _insights.yaml          <- 3 insights from management meetings
 ├── project-a/meetings/marketing/
 │   ├── CHANGELOG.md
 │   └── _insights.yaml          <- 2 insights from marketing reviews
 ├── _contacts/david/
 │   ├── CHANGELOG.md
 │   └── _insights.yaml          <- 5 insights from 1:1 conversations
 └── _contacts/noah/
     ├── CHANGELOG.md
     └── _insights.yaml          <- 1 insight from a strategy call
                                    ─────
                                    11 total insights aggregated on /insights page
```

### API

**`GET /api/insights`** -- returns filtered insights with aggregations.

Query parameters:
- `project` -- filter by project name (default: `all`)
- `type` -- filter by insight type, supports comma-separated (e.g. `decision,learning`; default: `all`)
- `status` -- filter by status: `active`, `superseded`, `archived` (default: `active`)

Response:
```json
{
  "insights": [...],
  "type_counts": {"decision": 5, "learning": 3, ...},
  "tag_counts": {"pricing": 4, "api": 2, ...},
  "context_counts": {"david": 5, "noah": 1, ...},
  "type_context_matrix": {"decision": {"david": 3, "noah": 1}, ...},
  "type_tag_matrix": {"decision": {"pricing": 2, "api": 1}, ...},
  "monthly": [{"month": "2026-02", "counts": {"decision": 2, "learning": 1}}, ...],
  "total": 11,
  "this_month": 4
}
```

### `_insights.yaml` format

```yaml
version: 1
last_updated: 260303
context: "contact_or_project_name"

insights:
  - id: 1
    type: decision
    date: 260303
    summary: "One sentence describing the insight"
    rationale: "One sentence with context or reasoning"
    source:
      file: "260303-samtal-Alex-Bob.md"
      section: "Process decisions"
    tags: [sprints, process, team]
    status: active        # active | superseded | archived
    superseded_by: null

next_id: 2
```

### Architecture

```
parsers/insights.py     Scan vault for _insights.yaml, parse, filter, aggregate
app.py                  Cache layer + /api/insights endpoint + /insights route
templates/insights.html Type badges, context badges, pivot container, detail table
static/js/insights.js   Multi-select state, pivot renderer, detail drill-down
static/css/main.css     Insight type badge colors, pivot heatmap styles
```

---

## Documents Page

The Documents page (`/documents`) replaces the former Recent Updates page. It shows dated vault files (`YYMMDD-*.md`) with two filter dimensions:

- **Project badges** -- toggle by project/context (e.g. acme, bravo, fluff). Shows file count per project.
- **Document type badges** -- toggle by type (standup, conversation, board, preparation, management-weekly, etc.). Shows file count per type.
- **Day badges** -- filter by specific day (Today, Yesterday, etc.)

Files are listed grouped by day with a markdown preview panel on the right. Clicking a file renders its content. Both filter badge rows support multi-select (click to toggle).

### Architecture

```
parsers/activity.py       Scan vault for YYMMDD-*.md files, classify by domain/type
app.py                    /api/files/recent endpoint (returns project_counts, type_counts)
templates/documents.html  Filter badges, day badges, file list, preview panel
static/js/documents.js    Project/type toggle state, client-side filtering, preview loading
```

---

## core-skills -- Data Source

This app visualizes data produced by **core-skills**, a set of Claude Code skills for operational documentation, transcript processing, and task tracking.

### What core-skills produces

| Skill | Output | Visualized as |
|-------|--------|---------------|
| `/tasks` | `_tasks.yaml` (active tasks), `_tasks-history.md` (completed log) | Dashboard stats, task board, task detail |
| `/ops` | `YYMMDD-*.md` meeting summaries, CHANGELOGs, `_insights.yaml` | Activity heatmap, domain charts, documents page, insights page |
| `/transcript` | `YYMMDD-samtal-*.md` call summaries, `_insights.yaml` | Activity heatmap, documents page, insights page |
| `/preparation` | `YYMMDD-förberedelse-*.md` meeting prep | Activity heatmap, documents page |
| `/daily-dashboard` | `_Dashboard.md` | (not visualized -- separate workflow) |

### Installing core-skills

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

```bash
# Clone the repo
git clone <core-skills-repo-url> core-skills

# Create the bootstrap symlink
mkdir -p ~/.claude/skills
ln -s "$(pwd)/core-skills/skills/update-skills" ~/.claude/skills/update-skills
```

Then in Claude Code, run `/update-skills update` to create all remaining symlinks.

### Vault structure

core-skills expects an Obsidian vault with project folders. The `_tasks.yaml` file lives at the vault root and defines which project folders exist:

```yaml
projects:
  acme:
    vault: acme/
    shared_view: true
  side-project:
    vault: side-project/
    shared_view: true
  personal:
    vault: personal/
    shared_view: false
```

Each project folder contains dated markdown files (`YYMMDD-*.md`) produced by `/ops`, `/transcript`, and `/preparation`. The app scans these folders recursively and classifies files by domain (based on path) and type (based on filename keywords).

### Generating data

After installing core-skills, use these commands in Claude Code from within a vault folder:

```
/ops [paste meeting transcript]      Process a meeting into structured summary
/transcript [paste recording]        Summarize a call or voice recording
/preparation jane                    Create meeting prep from contact history
/tasks add "Fix login bug"           Add a task manually
/tasks done 5                        Mark task #5 as completed
/daily-dashboard                     Generate daily overview with tasks
```

The visualisation app reads the resulting files in real-time -- no import or sync needed. Point `VAULT_PATH` in `.env` to your vault root and the app picks up everything automatically.
