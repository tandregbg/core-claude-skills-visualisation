# CLAUDE.md -- core-skills-visualisation

## Stack
- Python / Flask with Jinja2
- Custom design tokens (tokens.css) + layout system (layout.css)
- Chart.js (CDN)
- Vanilla JavaScript (no React/Vue)
- No database -- reads vault files directly with in-memory caching

## Structure
```
app.py              Flask app, routes, caching
config.py           Vault path, port config
parsers/
  tasks.py          Parse _tasks.yaml
  history.py        Parse _tasks-history.md
  activity.py       Scan vault for YYMMDD-*.md files
  insights.py       Scan vault for _insights.yaml files
static/
  tokens.css        Design tokens (--cs- prefix)
  layout.css        Sidebar layout, cards, tables
  css/main.css      Application-specific styles
  js/               Page-specific JS
templates/          Jinja2 templates
```

## Conventions
- No emojis
- Swedish characters (a, a, o) must be correct
- YYMMDD date format in filenames
- Read-only access to vault files
- All API endpoints return JSON under /api/
- Page routes return HTML templates

<!-- core-skills-init -->
## Project Conventions

### Workflow Principles
- **Plan before building** -- enter plan mode for any non-trivial task (3+ steps or architectural decisions). If something goes sideways, stop and re-plan
- **Verify before done** -- never mark work complete without proving it works. Run `/cr audit` after batch changes
- **Keep it simple** -- one CR per concern, minimal changes, Draft CRs are cheap
- **Fix forward** -- find root causes, no temporary workarounds. Fix the spec, don't skip the check
- **Autonomous execution** -- investigate and resolve. Use subagents for research to keep context clean
- **Interview when unclear** -- if requirements are ambiguous or incomplete, stop and interview the user with specific questions. Do not guess. When you have understood everything needed to proceed, say "I have what I need -- you can step away" so the user knows it is safe to leave
- **Schema first** -- before working with any data structure (API response, database, config file, YAML/JSON), find or create a schema document. Store schemas in the project and reference them from CLAUDE.md. A documented schema eliminates hallucination on data interpretation

### Change Request Discipline
This project uses `/cr` for change tracking. Lifecycle:

    Draft --> Proposed --> Planned --> Implemented --> Archived

- **Draft**: Capture the idea (metadata + summary + open questions)
- **Proposed**: Full spec required, all 9 sections, gets a git branch
- **Implemented**: Add implementation date, prove it works
- **Archived**: State the reason (dead, reverted, superseded)

CR directory: `docs/change-requests/`

### Meeting Routing
| Meeting type | Location |
|-------------|----------|
| Daily standup | `meetings/YYMMDD-participants-daily-standup.md` |
| Sprint review | `meetings/YYMMDD-participants-sprint-review.md` |
| Other | `meetings/YYMMDD-participants-description.md` |

### Documentation Standards
- Swedish output for operational documentation (unless project specifies otherwise)
- Correct Swedish characters (å, ä, ö) -- never substitute
- Filenames: lowercase with hyphens. Only CHANGELOG.md and README.md use uppercase
- Branch names: kebab-case. Dates: YYYY-MM-DD
- Commit messages for CRs: `{type}(CR-{number}): {description}`
