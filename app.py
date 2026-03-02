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

app = Flask(__name__)
app.json.ensure_ascii = False

# ---------------------------------------------------------------------------
# Cache layer -- mtime-based invalidation
# ---------------------------------------------------------------------------

_cache = {
    'tasks': {'data': None, 'projects': None, 'mtime': 0},
    'history': {'data': None, 'mtime': 0},
    'activity': {'data': None, 'scan_time': 0},
}


def _file_mtime(path):
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0


def _get_tasks_cached(today=None):
    """Return (projects, enriched_tasks) with mtime-based cache."""
    current_mtime = _file_mtime(config.TASKS_FILE)
    if _cache['tasks']['data'] is not None and current_mtime == _cache['tasks']['mtime']:
        return _cache['tasks']['projects'], _cache['tasks']['data']

    projects, raw_tasks, _ = task_parser.load_tasks_file(config.TASKS_FILE)
    enriched = [task_parser.enrich_task(t, today or date.today()) for t in raw_tasks]
    _cache['tasks']['projects'] = projects
    _cache['tasks']['data'] = enriched
    _cache['tasks']['mtime'] = current_mtime
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


def _invalidate_cache():
    """Force cache invalidation."""
    _cache['tasks']['mtime'] = 0
    _cache['tasks']['data'] = None
    _cache['history']['mtime'] = 0
    _cache['history']['data'] = None
    _cache['activity']['scan_time'] = 0
    _cache['activity']['data'] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _filter_tasks(tasks, project=None, include_private=False):
    """Filter tasks by project and privacy."""
    result = tasks
    if project and project != 'all':
        result = [t for t in result if t.get('project') == project]
    if not include_private:
        result = [t for t in result if not t.get('private', False)]
    return result


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


@app.route('/recent')
def recent_page():
    return render_template('recent.html')


@app.route('/tasks/<int:task_id>')
def task_detail(task_id):
    return render_template('task_detail.html', task_id=task_id, vault_name=config.VAULT_NAME)


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.route('/api/projects')
def api_projects():
    """Return project registry from _tasks.yaml."""
    projects, _ = _get_tasks_cached()
    return jsonify(projects)


@app.route('/api/tasks')
def api_tasks():
    """Return filtered tasks list."""
    project = request.args.get('project', 'all')
    include_private = request.args.get('private', 'false') == 'true'
    today = date.today()

    projects, all_tasks = _get_tasks_cached(today)
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
    recent.sort(key=lambda f: (f.get('date', date.min), f.get('mtime', 0)), reverse=True)

    # Group by date
    grouped = {}
    for f in recent:
        day_key = f['date'].isoformat()
        if day_key not in grouped:
            grouped[day_key] = []
        grouped[day_key].append(_serialize_file(f))

    return jsonify({
        'days': grouped,
        'total': len(recent),
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


@app.route('/api/refresh', methods=['POST'])
def api_refresh():
    """Force cache invalidation and re-read all data."""
    _invalidate_cache()
    return jsonify({'status': 'ok', 'message': 'Cache invalidated'})


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    print(f"Vault path: {config.VAULT_PATH}")
    print(f"Tasks file: {config.TASKS_FILE}")
    print(f"Starting on port {config.FLASK_PORT}")
    app.run(host='127.0.0.1', port=config.FLASK_PORT, debug=True)
