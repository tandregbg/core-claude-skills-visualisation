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
