"""core-skills-visualisation -- Flask app for visualizing vault runtime data."""

import os
import time
import json
from datetime import date, datetime

import markdown as md
from flask import Flask, render_template, jsonify, request
import config
from parsers import tasks as task_parser
from parsers import history as history_parser
from parsers import activity as activity_parser
from parsers import insights as insights_parser

app = Flask(__name__)
app.json.ensure_ascii = False

# Cache-busting: use app start time as version query param for static files
_static_version = int(time.time())

@app.context_processor
def inject_version():
    return {'v': _static_version}

# Load persistent settings on startup
_settings = config.load_settings()

# ---------------------------------------------------------------------------
# Cache layer -- mtime-based invalidation
# ---------------------------------------------------------------------------

_cache = {
    'tasks': {'data': None, 'projects': None, 'scan_time': 0},
    'history': {'data': None, 'mtime': 0},
    'activity': {'data': None, 'scan_time': 0},
    'insights': {'data': None, 'scan_time': 0},
}


def _file_mtime(path):
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0


def _get_tasks_cached(today=None):
    """Return (projects, enriched_tasks) with TTL-based cache.

    Uses scan_tasks() to aggregate all _tasks.yaml files across the vault.
    Projects are merged from root registry + auto-discovered ops-structured
    folders.  Settings project overrides (enabled, shared_view) are applied.
    """
    now = time.time()
    if _cache['tasks']['data'] is not None and (now - _cache['tasks'].get('scan_time', 0)) < config.CACHE_TTL:
        return _cache['tasks']['projects'], _cache['tasks']['data']

    # Load registered projects from root file (for registry + discovery seed)
    try:
        root_projects, _, _ = task_parser.load_tasks_file(config.TASKS_FILE)
    except Exception:
        root_projects = {}

    # Auto-discover ops-structured folders and merge
    scan_depth = _settings.get('scan_depth', 2)
    projects = activity_parser.discover_projects(config.VAULT_PATH, root_projects, scan_depth=scan_depth)

    # Scan all _tasks.yaml files across the vault
    _, raw_tasks = task_parser.scan_tasks(config.VAULT_PATH, projects)

    # Apply settings overrides (enabled/shared_view) on top of discovered projects
    settings_projects = _settings.get('projects', {})
    for name, cfg in projects.items():
        if name in settings_projects:
            sp = settings_projects[name]
            if 'enabled' in sp:
                cfg['enabled'] = sp['enabled']
            if 'shared_view' in sp:
                cfg['shared_view'] = sp['shared_view']
        # Default: enabled if not explicitly set
        cfg.setdefault('enabled', True)

    enriched = [task_parser.enrich_task(t, today or date.today()) for t in raw_tasks]
    _cache['tasks']['projects'] = projects
    _cache['tasks']['data'] = enriched
    _cache['tasks']['scan_time'] = now
    return projects, enriched


def _get_history_cached():
    """Return history entries with mtime-based cache."""
    current_mtime = _file_mtime(config.HISTORY_FILE)
    if _cache['history']['data'] is not None and current_mtime == _cache['history']['mtime']:
        return _cache['history']['data']

    entries = history_parser.parse_history_file(config.HISTORY_FILE)
    _cache['history']['data'] = entries
    _cache['history']['mtime'] = current_mtime
    return entries


def _get_activity_cached(projects):
    """Return activity data with time-based cache (TTL)."""
    now = time.time()
    if _cache['activity']['data'] is not None and (now - _cache['activity']['scan_time']) < config.CACHE_TTL:
        return _cache['activity']['data']

    data = activity_parser.scan_all_folders(config.VAULT_PATH, projects, config.VAULT_NAME)
    _cache['activity']['data'] = data
    _cache['activity']['scan_time'] = now
    return data


def _get_insights_cached(projects):
    """Return insights from all _insights.yaml files with time-based cache."""
    now = time.time()
    if _cache['insights']['data'] is not None and (now - _cache['insights']['scan_time']) < config.CACHE_TTL:
        return _cache['insights']['data']

    data = insights_parser.scan_insights(config.VAULT_PATH, projects, config.VAULT_NAME)
    _cache['insights']['data'] = data
    _cache['insights']['scan_time'] = now
    return data


def _invalidate_cache():
    """Force cache invalidation."""
    _cache['tasks']['scan_time'] = 0
    _cache['tasks']['data'] = None
    _cache['history']['mtime'] = 0
    _cache['history']['data'] = None
    _cache['activity']['scan_time'] = 0
    _cache['activity']['data'] = None
    _cache['insights']['scan_time'] = 0
    _cache['insights']['data'] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _filter_tasks(tasks, project=None, include_private=False):
    """Filter tasks by project and privacy.  Uses _project (derived) field for matching.

    When a specific project is selected (not 'all'), private tasks within that
    project are always shown -- the user explicitly chose to look at it.
    """
    result = tasks
    explicit_project = project and project != 'all'
    if explicit_project:
        result = [t for t in result if t.get('_project') == project or t.get('project') == project]
    if not include_private and not explicit_project:
        result = [t for t in result if not t.get('private', False)]
    return result


def _filter_tasks_by_folder(tasks, document_path):
    """Filter tasks to those from the nearest ancestor _tasks.yaml of a document.

    Given a document path like '_contacts/prashant/260305-file.md', finds tasks
    whose _source_file directory is the best (deepest) ancestor match.

    When no _tasks.yaml ancestor is found (e.g. contact folders without tasks),
    falls back to searching tasks whose title or tags mention the folder name.
    """
    import posixpath
    doc_dir = posixpath.dirname(document_path.replace(os.sep, '/'))

    # Collect all unique _source_file directories and their tasks
    source_dirs = {}  # dir -> [tasks]
    for t in tasks:
        src = t.get('_source_file', '')
        if src:
            src_dir = posixpath.dirname(src.replace(os.sep, '/'))
        else:
            continue
        source_dirs.setdefault(src_dir, []).append(t)

    # Find the deepest _source_file directory that is an ancestor of (or equal to) doc_dir
    best_match = None
    best_len = -1
    for src_dir in source_dirs:
        if not src_dir:  # skip root _tasks.yaml (empty dirname)
            continue
        if doc_dir == src_dir or doc_dir.startswith(src_dir + '/'):
            if len(src_dir) > best_len:
                best_match = src_dir
                best_len = len(src_dir)

    if best_match is not None:
        return source_dirs[best_match]

    # No _tasks.yaml ancestor found -- search by folder name in task content
    # Extract the context name from path (e.g. 'tim-hansen' from '_contacts/tim-hansen')
    folder_name = posixpath.basename(doc_dir)
    if not folder_name:
        return []

    # Search for tasks mentioning this name in title, tags, or notes
    name_lower = folder_name.lower().replace('-', ' ').replace('_', ' ')
    name_parts = name_lower.split()

    matched = []
    for t in tasks:
        title = (t.get('title') or t.get('task') or '').lower()
        tags = [tag.lower() for tag in (t.get('tags') or [])]
        notes_text = ' '.join(
            (n.get('text', '') if isinstance(n, dict) else str(n))
            for n in (t.get('notes') or [])
        ).lower()

        # Match if all name parts appear in title, tags, or notes
        searchable = f"{title} {' '.join(tags)} {notes_text}"
        if all(part in searchable for part in name_parts):
            matched.append(t)

    return matched


def _filter_activity(activity_data, project=None, include_private_folders=False, projects_config=None):
    """Filter activity files by project selection.

    shared_view filtering only applies in 'all' view -- if a specific folder
    is explicitly selected, always show it.
    """
    all_files = []
    explicit_selection = project and project != 'all'
    for proj_name, files in activity_data.items():
        if explicit_selection and proj_name != project:
            continue
        # Only hide shared_view=false folders in "all" view
        if not explicit_selection and not include_private_folders and projects_config:
            proj_cfg = projects_config.get(proj_name, {})
            if not proj_cfg.get('shared_view', True):
                continue
        all_files.extend(files)
    return all_files


def _filter_activity_list(files, project=None, include_private_folders=False, projects_config=None):
    """Filter a flat list of file entries by project selection."""
    explicit_selection = project and project != 'all'
    result = []
    for f in files:
        proj_name = f.get('project', '')
        if explicit_selection and proj_name != project:
            continue
        if not explicit_selection and not include_private_folders and projects_config:
            proj_cfg = projects_config.get(proj_name, {})
            if not proj_cfg.get('shared_view', True):
                continue
        result.append(f)
    return result


def _serialize_date(d):
    """Convert date to ISO string for JSON."""
    if isinstance(d, date):
        return d.isoformat()
    return d


def _serialize_task(t):
    """Make a task JSON-serializable."""
    result = dict(t)
    for key in ('created_date', 'due_date', 'completed_date'):
        if key in result:
            result[key] = _serialize_date(result[key])
    if result.get('date'):
        result['date'] = _serialize_date(result['date'])
    # Serialize note dates
    notes = result.get('notes') or []
    result['notes'] = notes
    # Ensure distributed task fields are present
    result.setdefault('_source_file', '')
    result.setdefault('_project', result.get('project', 'unknown'))
    result.setdefault('_display_id', '#{}'.format(result.get('id', '?')))
    return result


def _serialize_file(f):
    """Make a file entry JSON-serializable."""
    result = dict(f)
    if 'date' in result:
        result['date'] = _serialize_date(result['date'])
    return result


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/tasks')
def tasks_page():
    return render_template('tasks.html')


@app.route('/activity')
def activity_page():
    return render_template('activity.html')


@app.route('/insights')
def insights_page():
    return render_template('insights.html')


@app.route('/documents')
def documents_page():
    return render_template('documents.html')


@app.route('/projects')
def projects_page():
    return render_template('projects.html')


@app.route('/projects/<path:name>')
def project_detail_page(name):
    return render_template('projects.html', project_name=name)


@app.route('/tasks/<int:task_id>')
def task_detail(task_id):
    return render_template('task_detail.html', task_id=task_id, vault_name=config.VAULT_NAME)


@app.route('/help')
def help_page():
    return render_template('help.html')


@app.route('/settings')
def settings_page():
    return render_template('settings.html')


# ---------------------------------------------------------------------------
# API routes -- settings
# ---------------------------------------------------------------------------

def _count_project_files(vault_path, folder_path):
    """Count .md files with YYMMDD- prefix in a project folder."""
    import re
    full = os.path.join(vault_path, folder_path)
    if not os.path.isdir(full):
        return 0
    count = 0
    for root, dirs, files in os.walk(full):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            if f.endswith('.md') and re.match(r'^\d{6}-', f):
                count += 1
    return count


@app.route('/api/settings', methods=['GET'])
def api_settings_get():
    """Return current settings merged with live project discovery."""
    global _settings
    _settings = config.load_settings()

    # Run discovery to get current project list
    projects_reg, _, _ = task_parser.load_tasks_file(config.TASKS_FILE)
    scan_depth = _settings.get('scan_depth', 2)
    all_projects = activity_parser.discover_projects(
        config.VAULT_PATH, projects_reg, scan_depth=scan_depth
    )

    settings_projects = _settings.get('projects', {})
    result_projects = {}

    for name, cfg in all_projects.items():
        sp = settings_projects.get(name, {})
        source = 'discovered' if cfg.get('discovered') else 'registered'
        result_projects[name] = {
            'enabled': sp.get('enabled', True),
            'shared_view': sp.get('shared_view', cfg.get('shared_view', True)),
            'source': source,
            'vault': cfg.get('vault', ''),
            'file_count': _count_project_files(config.VAULT_PATH, cfg.get('vault', '')),
        }

    return jsonify({
        'vault_path': _settings.get('vault_path', config.VAULT_PATH),
        'vault_name': _settings.get('vault_name', config.VAULT_NAME),
        'scan_depth': _settings.get('scan_depth', 2),
        'projects': result_projects,
    })


@app.route('/api/settings', methods=['POST'])
def api_settings_post():
    """Save settings (partial update -- only sent fields are changed)."""
    global _settings
    data = request.get_json(force=True)

    if 'vault_name' in data:
        _settings['vault_name'] = data['vault_name']
    if 'vault_path' in data:
        _settings['vault_path'] = data['vault_path']
    if 'scan_depth' in data:
        _settings['scan_depth'] = int(data['scan_depth'])

    if 'projects' in data:
        if 'projects' not in _settings:
            _settings['projects'] = {}
        for proj_name, proj_updates in data['projects'].items():
            if proj_name not in _settings['projects']:
                _settings['projects'][proj_name] = {}
            _settings['projects'][proj_name].update(proj_updates)

    config.save_settings(_settings)
    _invalidate_cache()
    return jsonify({'status': 'ok'})


@app.route('/api/settings/rescan', methods=['POST'])
def api_settings_rescan():
    """Force re-discovery and return updated project list."""
    global _settings
    _invalidate_cache()

    projects_reg, _, _ = task_parser.load_tasks_file(config.TASKS_FILE)
    scan_depth = _settings.get('scan_depth', 2)
    all_projects = activity_parser.discover_projects(
        config.VAULT_PATH, projects_reg, scan_depth=scan_depth
    )

    settings_projects = _settings.get('projects', {})
    result_projects = {}

    for name, cfg in all_projects.items():
        sp = settings_projects.get(name, {})
        source = 'discovered' if cfg.get('discovered') else 'registered'
        # Newly discovered projects not yet in settings default to enabled
        enabled = sp.get('enabled', True)
        result_projects[name] = {
            'enabled': enabled,
            'shared_view': sp.get('shared_view', cfg.get('shared_view', True)),
            'source': source,
            'vault': cfg.get('vault', ''),
            'file_count': _count_project_files(config.VAULT_PATH, cfg.get('vault', '')),
        }

    return jsonify({
        'projects': result_projects,
        'scan_depth': scan_depth,
        'total_discovered': sum(1 for p in result_projects.values() if p['source'] == 'discovered'),
    })


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.route('/api/projects')
def api_projects():
    """Return enabled projects (filtered by settings)."""
    projects, _ = _get_tasks_cached()
    enabled = {k: v for k, v in projects.items() if v.get('enabled', True)}
    return jsonify(enabled)


@app.route('/api/projects/<path:name>')
def api_project_detail(name):
    """Return detailed info about a single project's ops structure."""
    projects, all_tasks = _get_tasks_cached()
    if name not in projects:
        return jsonify({'error': 'Project not found'}), 404

    detail = activity_parser.get_project_detail(
        config.VAULT_PATH, name, projects[name], config.VAULT_NAME
    )

    # Serialize dates
    for m in detail['meetings']:
        m['date'] = _serialize_date(m['date'])
    for cf in detail.get('contact_folders', []):
        if cf.get('latest_date'):
            cf['latest_date'] = _serialize_date(cf['latest_date'])
    dr = detail['stats'].get('date_range')
    if dr:
        dr['earliest'] = _serialize_date(dr['earliest'])
        dr['latest'] = _serialize_date(dr['latest'])

    # Add project tasks
    project_tasks = _filter_tasks(all_tasks, name, include_private=False)
    detail['tasks'] = [_serialize_task(t) for t in project_tasks]

    return jsonify(detail)


@app.route('/api/tasks')
def api_tasks():
    """Return filtered tasks list.

    Optional 'folder' param: a vault-relative file path. When provided,
    returns only tasks from the nearest ancestor _tasks.yaml to that path.
    This scopes tasks to the correct context (e.g. a contact folder rather
    than the entire parent project).
    """
    project = request.args.get('project', 'all')
    include_private = request.args.get('private', 'false') == 'true'
    folder = request.args.get('folder', '')
    today = date.today()

    projects, all_tasks = _get_tasks_cached(today)

    if folder:
        # Find tasks from the nearest _tasks.yaml ancestor of the document path
        filtered = _filter_tasks_by_folder(all_tasks, folder)
    else:
        filtered = _filter_tasks(all_tasks, project, include_private)
    return jsonify([_serialize_task(t) for t in filtered])


@app.route('/api/tasks/stats')
def api_tasks_stats():
    """Return task statistics."""
    project = request.args.get('project', 'all')
    include_private = request.args.get('private', 'false') == 'true'
    today = date.today()

    projects, all_tasks = _get_tasks_cached(today)
    filtered = _filter_tasks(all_tasks, project, include_private)

    stats = task_parser.get_task_stats(filtered, today)

    # Add files created today
    activity_data = _get_activity_cached(projects)
    all_files = _filter_activity(activity_data, project, include_private, projects)
    stats['files_today'] = activity_parser.get_files_created_today(all_files, today)

    return jsonify(stats)


@app.route('/api/tasks/<int:task_id>')
def api_task_detail(task_id):
    """Return a single task with full detail."""
    include_private = request.args.get('private', 'false') == 'true'
    today = date.today()

    _, all_tasks = _get_tasks_cached(today)
    for t in all_tasks:
        if t.get('id') == task_id:
            if t.get('private', False) and not include_private:
                return jsonify({'error': 'Task is private'}), 403
            # Get history entry if exists
            history = _get_history_cached()
            hist_entry = history_parser.get_history_for_task(history, task_id)
            result = _serialize_task(t)
            if hist_entry:
                result['history'] = {
                    'title': hist_entry.get('title'),
                    'completed': _serialize_date(hist_entry.get('completed')),
                    'note': hist_entry.get('note'),
                }
            return jsonify(result)

    return jsonify({'error': 'Task not found'}), 404


@app.route('/api/tasks/overdue')
def api_tasks_overdue():
    """Return overdue tasks sorted by days overdue."""
    project = request.args.get('project', 'all')
    include_private = request.args.get('private', 'false') == 'true'
    today = date.today()

    _, all_tasks = _get_tasks_cached(today)
    filtered = _filter_tasks(all_tasks, project, include_private)
    overdue = task_parser.get_overdue_tasks(filtered)
    return jsonify([_serialize_task(t) for t in overdue])


@app.route('/api/tasks/grouped')
def api_tasks_grouped():
    """Return tasks grouped by status for kanban board."""
    project = request.args.get('project', 'all')
    include_private = request.args.get('private', 'false') == 'true'
    today = date.today()

    _, all_tasks = _get_tasks_cached(today)
    filtered = _filter_tasks(all_tasks, project, include_private)
    groups = task_parser.group_tasks_by_status(filtered)

    # Only include recent completions in kanban (last 7 days)
    week_ago = today.toordinal() - 7
    groups['completed'] = [
        t for t in groups['completed']
        if t.get('completed_date') and t['completed_date'].toordinal() >= week_ago
    ]

    return jsonify({
        status: [_serialize_task(t) for t in tasks_list]
        for status, tasks_list in groups.items()
    })


@app.route('/api/activity')
def api_activity():
    """Return activity aggregations for charts."""
    project = request.args.get('project', 'all')
    include_private = request.args.get('private', 'false') == 'true'

    projects, _ = _get_tasks_cached()
    activity_data = _get_activity_cached(projects)
    files = _filter_activity(activity_data, project, include_private, projects)

    return jsonify({
        'daily_counts': activity_parser.aggregate_daily_counts(files),
        'domain_counts': activity_parser.aggregate_domain_counts(files),
        'type_counts': activity_parser.aggregate_type_counts(files),
        'weekly_counts': activity_parser.aggregate_weekly_counts(files),
        'total_files': len(files),
    })


@app.route('/api/files')
def api_files():
    """Return recent files list."""
    project = request.args.get('project', 'all')
    include_private = request.args.get('private', 'false') == 'true'
    limit = int(request.args.get('limit', 20))

    projects, _ = _get_tasks_cached()
    activity_data = _get_activity_cached(projects)
    files = _filter_activity(activity_data, project, include_private, projects)

    recent = activity_parser.get_recent_files(files, limit)
    return jsonify([_serialize_file(f) for f in recent])


@app.route('/api/files/recent')
def api_files_recent():
    """Return recent files grouped by day, with metadata for the updates pane."""
    project = request.args.get('project', 'all')
    include_private = request.args.get('private', 'false') == 'true'
    days = int(request.args.get('days', 7))

    projects, _ = _get_tasks_cached()
    activity_data = _get_activity_cached(projects)
    files = _filter_activity(activity_data, project, include_private, projects)

    today = date.today()
    cutoff = today.toordinal() - days

    recent = [f for f in files if f.get('date') and f['date'].toordinal() >= cutoff]

    # Include recently modified ops files (README, CHANGELOG, _tasks.yaml, _insights.yaml)
    ops_files = activity_parser.scan_ops_files(config.VAULT_PATH, projects, config.VAULT_NAME, days=days)
    ops_filtered = _filter_activity_list(ops_files, project, include_private, projects)
    recent.extend(ops_filtered)

    recent.sort(key=lambda f: (f.get('date', date.min), f.get('mtime', 0)), reverse=True)

    # Group by date
    grouped = {}
    for f in recent:
        day_key = f['date'].isoformat()
        if day_key not in grouped:
            grouped[day_key] = []
        grouped[day_key].append(_serialize_file(f))

    # Aggregate counts for filter badges
    project_counts = {}
    type_counts = {}
    for f in recent:
        p = f.get('project', 'other')
        project_counts[p] = project_counts.get(p, 0) + 1
        t = f.get('file_type', 'other')
        type_counts[t] = type_counts.get(t, 0) + 1

    return jsonify({
        'days': grouped,
        'total': len(recent),
        'project_counts': project_counts,
        'type_counts': type_counts,
    })


@app.route('/api/files/content')
def api_file_content():
    """Read and render a vault markdown file as HTML.

    Takes a relative_path parameter (relative to VAULT_PATH).
    Only serves .md files within the vault for safety.
    """
    rel_path = request.args.get('path', '')
    if not rel_path or not rel_path.endswith('.md'):
        return jsonify({'error': 'Invalid path'}), 400

    # Resolve and verify the path is inside the vault
    full_path = os.path.normpath(os.path.join(config.VAULT_PATH, rel_path))
    if not full_path.startswith(os.path.normpath(config.VAULT_PATH)):
        return jsonify({'error': 'Path outside vault'}), 403

    if not os.path.isfile(full_path):
        return jsonify({'error': 'File not found'}), 404

    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            raw = f.read()

        html = md.markdown(raw, extensions=['tables', 'fenced_code', 'nl2br'])
        return jsonify({
            'path': rel_path,
            'raw_length': len(raw),
            'html': html,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/history')
def api_history():
    """Return completed tasks history."""
    entries = _get_history_cached()
    result = []
    for e in entries:
        item = dict(e)
        item['created'] = _serialize_date(item.get('created'))
        item['completed'] = _serialize_date(item.get('completed'))
        result.append(item)
    return jsonify(result)


@app.route('/api/insights')
def api_insights():
    """Return insights filtered by project, type, and status."""
    project = request.args.get('project', 'all')
    insight_type = request.args.get('type', 'all')
    status = request.args.get('status', 'active')

    projects, _ = _get_tasks_cached()
    all_insights = _get_insights_cached(projects)
    filtered = insights_parser.filter_insights(all_insights, project, insight_type, status)

    type_counts = insights_parser.aggregate_type_counts(filtered)
    monthly = insights_parser.aggregate_monthly_counts(filtered)
    tag_counts = insights_parser.aggregate_tag_counts(filtered)
    context_counts = insights_parser.aggregate_context_counts(filtered)
    type_context_matrix = insights_parser.aggregate_type_context_matrix(filtered)
    type_tag_matrix = insights_parser.aggregate_type_tag_matrix(filtered)

    # Count this month
    today = date.today()
    this_month = today.strftime('%Y-%m')
    this_month_count = sum(
        1 for i in filtered
        if i.get('date_obj') and i['date_obj'].strftime('%Y-%m') == this_month
    )

    return jsonify({
        'insights': [insights_parser.serialize_insight(i) for i in filtered],
        'type_counts': type_counts,
        'tag_counts': tag_counts,
        'context_counts': context_counts,
        'type_context_matrix': type_context_matrix,
        'type_tag_matrix': type_tag_matrix,
        'monthly': monthly,
        'total': len(filtered),
        'this_month': this_month_count,
    })


@app.route('/api/refresh', methods=['POST'])
def api_refresh():
    """Force cache invalidation and re-read all data."""
    _invalidate_cache()
    return jsonify({'status': 'ok', 'message': 'Cache invalidated'})


def _find_core_skills_root():
    """Discover core-skills repo root by following the transcript skill symlink."""
    link = os.path.expanduser('~/.claude/skills/transcript')
    if os.path.islink(link):
        target = os.path.realpath(link)
        # target is .../core-skills/skills/transcript -> go up 2 levels
        return os.path.dirname(os.path.dirname(target))
    return None


def _read_markdown_file(path):
    """Read a markdown file and return (content, mtime) or (None, None)."""
    if path and os.path.isfile(path):
        with open(path, 'r', encoding='utf-8') as f:
            return f.read(), os.path.getmtime(path)
    return None, None


@app.route('/api/help')
def api_help():
    """Return rendered markdown for help tabs."""
    app_root = os.path.dirname(os.path.abspath(__file__))
    cs_root = _find_core_skills_root()

    tabs = {}

    # Tab 1: core-skills README
    content, _ = _read_markdown_file(os.path.join(cs_root, 'README.md') if cs_root else None)
    if content:
        tabs['core_skills'] = md.markdown(content, extensions=['tables', 'fenced_code'])

    # Tab 2: visualisation README
    content, _ = _read_markdown_file(os.path.join(app_root, 'README.md'))
    if content:
        tabs['visualisation'] = md.markdown(content, extensions=['tables', 'fenced_code'])

    # Tab 3: changelogs (both merged, core-skills first)
    parts = []
    content, _ = _read_markdown_file(os.path.join(cs_root, 'CHANGELOG.md') if cs_root else None)
    if content:
        parts.append('# core-skills changelog\n\n' + content.lstrip('# Changelog\n').lstrip())
    content, _ = _read_markdown_file(os.path.join(app_root, 'CHANGELOG.md'))
    if content:
        parts.append('# core-skills-visualisation changelog\n\n' + content.lstrip('# Changelog\n').lstrip())
    if parts:
        tabs['changelog'] = md.markdown('\n\n---\n\n'.join(parts), extensions=['tables', 'fenced_code'])

    return jsonify(tabs)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    print(f"Vault path: {config.VAULT_PATH}")
    print(f"Tasks file: {config.TASKS_FILE}")
    print(f"Starting on port {config.FLASK_PORT}")
    app.run(host='0.0.0.0', port=config.FLASK_PORT, debug=True)
