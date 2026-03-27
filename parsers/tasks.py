"""Parse _tasks.yaml: projects registry, task filtering, grouping, overdue detection.

Supports both v1 (single central file with project: per task) and v2 (distributed
per-folder files with context/scope fields).  scan_tasks() aggregates all files.
"""

import os
import re
from datetime import datetime, date

import yaml


def parse_yymmdd(value):
    """Parse YYMMDD integer or string to a date object. Returns None for non-numeric values."""
    if value is None:
        return None
    s = str(value).strip()
    if not re.match(r'^\d{6}$', s):
        return None
    try:
        return datetime.strptime(s, '%y%m%d').date()
    except ValueError:
        return None


def load_tasks_file(tasks_path):
    """Load and parse _tasks.yaml. Returns (projects, tasks, next_id) or raises."""
    with open(tasks_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)

    if not data:
        return {}, [], 0

    projects = data.get('projects', {})
    tasks = data.get('tasks', []) or []
    next_id = data.get('next_id', 0)
    return projects, tasks, next_id


def _derive_project_from_path(rel_path):
    """Derive a project name from the relative path of a _tasks.yaml file.

    Examples:
        '_projects/acme' -> 'acme'
        '_projects/acme/projects/acme-mobile-v3' -> 'acme-mobile-v3'
        '_projects/bravo/project-x' -> 'project-x'
        '_contacts/jane-doe_company' -> 'jane-doe_company'
        '_private' -> 'personal'
        '.' -> 'root'
    """
    if rel_path in ('.', ''):
        return 'root'
    if rel_path == '_private' or rel_path.startswith('_private/'):
        return 'personal'
    # Use the last path component as project name
    return os.path.basename(rel_path)


def scan_tasks(vault_path, projects, vault_name=None):
    """Walk vault folders looking for _tasks.yaml files, aggregate all tasks.

    Modeled on scan_insights().  Supports both v1 (has project: per task) and
    v2 (has context/scope at file level).

    Returns (projects_registry, all_tasks) where each task is enriched with:
    - '_source_file': relative path to the _tasks.yaml
    - '_project': derived project name
    - '_display_id': 'context#id' for v2 files, '#id' for root
    - 'project': set from file-level context for v2, kept from task for v1
    """
    if vault_name is None:
        vault_name = os.path.basename(vault_path)

    all_tasks = []
    projects_registry = {}
    seen_realpaths = set()

    # 1. Load root _tasks.yaml -- extract projects registry + root tasks
    root_tasks_path = os.path.join(vault_path, '_tasks.yaml')
    if os.path.isfile(root_tasks_path):
        rp = os.path.realpath(root_tasks_path)
        seen_realpaths.add(rp)

        try:
            projects_reg, tasks, _ = load_tasks_file(root_tasks_path)
            projects_registry.update(projects_reg)

            for t in tasks:
                t['_source_file'] = '_tasks.yaml'
                t['_project'] = t.get('project', 'root')
                t['_display_id'] = '#{}'.format(t.get('id', '?'))
        except Exception:
            tasks = []

        all_tasks.extend(tasks)

    # 2. Collect folders to scan
    folders_to_scan = []

    # From registered projects
    for proj_name, proj_config in projects.items():
        folder = proj_config.get('vault', '')
        if folder:
            folders_to_scan.append((proj_name, folder))

    # Track already-queued realpaths to avoid dupes
    queued_realpaths = set()
    for _, folder_path in folders_to_scan:
        rp = os.path.realpath(os.path.join(vault_path, folder_path))
        queued_realpaths.add(rp)

    # Auto-discover from _contacts/, _projects/, _private/
    for container in ('_contacts', '_projects', '_private'):
        container_path = os.path.join(vault_path, container)
        if not os.path.isdir(container_path):
            continue
        if container == '_private':
            # _private itself is a scan target
            rp = os.path.realpath(container_path)
            if rp not in queued_realpaths:
                folders_to_scan.append(('personal', container))
                queued_realpaths.add(rp)
            continue
        try:
            for entry in os.listdir(container_path):
                entry_path = os.path.join(container_path, entry)
                if os.path.isdir(entry_path):
                    rp = os.path.realpath(entry_path)
                    if rp not in queued_realpaths:
                        rel_path = os.path.join(container, entry)
                        folders_to_scan.append((entry, rel_path))
                        queued_realpaths.add(rp)
        except OSError:
            pass

    # 3. Walk each folder for _tasks.yaml files
    for proj_name, folder_path in folders_to_scan:
        full_folder = os.path.join(vault_path, folder_path)
        if not os.path.isdir(full_folder):
            continue

        for root, dirs, files in os.walk(full_folder):
            dirs[:] = [d for d in dirs if not d.startswith('.')]

            if '_tasks.yaml' not in files:
                continue

            yaml_path = os.path.join(root, '_tasks.yaml')
            real = os.path.realpath(yaml_path)
            if real in seen_realpaths:
                continue
            seen_realpaths.add(real)

            rel_folder = os.path.relpath(root, vault_path)
            rel_file = os.path.join(rel_folder, '_tasks.yaml')

            try:
                with open(yaml_path, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f)
            except (OSError, yaml.YAMLError):
                continue

            if not data or not isinstance(data.get('tasks'), list):
                continue

            version = data.get('version', 1)
            context = data.get('context', _derive_project_from_path(rel_folder))
            scope = data.get('scope', 'project')

            for t in data['tasks']:
                if not isinstance(t, dict):
                    continue

                t['_source_file'] = rel_file
                # v2 files derive project from context; v1 keeps per-task project
                if version >= 2:
                    t['_project'] = context
                    t.setdefault('project', context)
                else:
                    t['_project'] = t.get('project', proj_name)

                t['_display_id'] = '{}#{}'.format(context, t.get('id', '?'))

                all_tasks.append(t)

    return projects_registry, all_tasks


def extract_owners(task):
    """Extract owner list from explicit field or notes[0] pattern.

    Resolution order:
    1. Explicit 'owner' field (string or list)
    2. First note matching pattern: 'Name.' or 'Name + Name.' at start
    3. Empty list (unassigned)

    Returns list of owner name strings.
    """
    # 1. Explicit owner field
    owner_field = task.get('owner')
    if owner_field:
        if isinstance(owner_field, list):
            return [str(o).strip() for o in owner_field if o]
        return [str(owner_field).strip()]

    # 2. Parse from first note
    notes = task.get('notes', []) or []
    if notes:
        first_note = notes[0]
        # Handle both string notes and dict notes
        if isinstance(first_note, dict):
            first_note = first_note.get('note', '')
        if isinstance(first_note, str):
            # Match: "Name." or "Name + Name." or "Name + Name + Name."
            # Also handles "All team" and "Team"
            m = re.match(r'^((?:[A-Z][a-z]+)(?:\s*\+\s*[A-Z][a-z]+)*)\b', first_note)
            if m:
                raw = m.group(1)
                # Skip generic non-person words
                if raw.lower() in ('new', 'done', 'fixed', 'pending', 'active',
                                   'ongoing', 'waiting', 'released', 'confirmed',
                                   'identified', 'resolved', 'decision', 'updated',
                                   'planerad', 'projekt', 'ansvariga', 'ansvarig',
                                   'prio', 'alla', 'alla team'):
                    return []
                return [n.strip() for n in raw.split('+')]

    return []


def enrich_task(task, today=None):
    """Add computed fields: due_date, is_overdue, days_overdue, due_display, _owners."""
    if today is None:
        today = date.today()

    t = dict(task)

    # Parse dates
    t['created_date'] = parse_yymmdd(t.get('created'))
    t['due_date'] = parse_yymmdd(t.get('due'))
    t['completed_date'] = parse_yymmdd(t.get('completed'))

    # Due display
    due_raw = t.get('due')
    if t['due_date']:
        t['due_display'] = t['due_date'].strftime('%Y-%m-%d')
    elif due_raw:
        t['due_display'] = str(due_raw)
    else:
        t['due_display'] = None

    # Overdue detection (only for active tasks with numeric due dates)
    t['is_overdue'] = False
    t['days_overdue'] = 0
    if t['due_date'] and t.get('status') not in ('completed',) and t['due_date'] < today:
        t['is_overdue'] = True
        t['days_overdue'] = (today - t['due_date']).days

    # Notes count
    t['notes_count'] = len(t.get('notes', []) or [])

    # Owner extraction
    t['_owners'] = extract_owners(t)

    return t


def get_tasks(tasks_path, today=None, project_filter=None, include_private=False):
    """Load and enrich all tasks. Optionally filter by project and privacy."""
    projects, raw_tasks, next_id = load_tasks_file(tasks_path)

    tasks = []
    for t in raw_tasks:
        enriched = enrich_task(t, today)

        # Filter by project
        if project_filter and enriched.get('project') != project_filter:
            continue

        # Filter private tasks
        if not include_private and enriched.get('private', False):
            continue

        tasks.append(enriched)

    return projects, tasks


def get_task_stats(tasks, today=None):
    """Compute summary statistics from a list of enriched tasks."""
    if today is None:
        today = date.today()

    active = [t for t in tasks if t.get('status') != 'completed']
    completed = [t for t in tasks if t.get('status') == 'completed']
    overdue = [t for t in active if t.get('is_overdue')]

    # Completed this week (last 7 days)
    week_ago = today.toordinal() - 7
    completed_this_week = [
        t for t in completed
        if t.get('completed_date') and t['completed_date'].toordinal() >= week_ago
    ]

    # Priority distribution (active tasks only)
    priority_counts = {'P0': 0, 'P1': 0, 'P2': 0, 'P3': 0}
    for t in active:
        p = t.get('priority', 'P3')
        if p in priority_counts:
            priority_counts[p] += 1

    # Status distribution
    status_counts = {}
    for t in tasks:
        s = t.get('status', 'pending')
        status_counts[s] = status_counts.get(s, 0) + 1

    # Project distribution (active tasks) -- prefer _project (derived) over project
    project_counts = {}
    for t in active:
        proj = t.get('_project', t.get('project', 'unknown'))
        project_counts[proj] = project_counts.get(proj, 0) + 1

    return {
        'total_active': len(active),
        'total_completed': len(completed),
        'overdue_count': len(overdue),
        'completed_this_week': len(completed_this_week),
        'priority_counts': priority_counts,
        'status_counts': status_counts,
        'project_counts': project_counts,
    }


def group_tasks_by_status(tasks):
    """Group tasks into kanban columns."""
    groups = {
        'pending': [],
        'in_progress': [],
        'blocked': [],
        'completed': [],
    }
    for t in tasks:
        status = t.get('status', 'pending')
        if status in groups:
            groups[status].append(t)
        else:
            groups['pending'].append(t)
    return groups


def get_overdue_tasks(tasks):
    """Return overdue tasks sorted by days overdue (most overdue first)."""
    overdue = [t for t in tasks if t.get('is_overdue')]
    overdue.sort(key=lambda t: t.get('days_overdue', 0), reverse=True)
    return overdue


def get_owner_stats(tasks):
    """Return owner -> {active, completed, blocked, p0} counts from enriched tasks."""
    stats = {}
    for t in tasks:
        owners = t.get('_owners', [])
        if not owners:
            owners = ['Unassigned']
        is_active = t.get('status') not in ('completed', 'cancelled')
        is_completed = t.get('status') == 'completed'
        is_blocked = t.get('status') == 'blocked'
        is_p0 = t.get('priority') == 'P0'

        for owner in owners:
            if owner not in stats:
                stats[owner] = {'active': 0, 'completed': 0, 'blocked': 0, 'p0': 0}
            if is_active:
                stats[owner]['active'] += 1
            if is_completed:
                stats[owner]['completed'] += 1
            if is_blocked:
                stats[owner]['blocked'] += 1
            if is_p0 and is_active:
                stats[owner]['p0'] += 1

    return stats


def get_project_summary(tasks, my_name=None):
    """Return per-project summary for dashboard cards.

    Each entry: {project, active, blocked, p0, p1, overdue, my_count, completed_week}
    """
    today = date.today()
    week_ago = today.toordinal() - 7
    projects = {}

    for t in tasks:
        proj = t.get('_project', t.get('project', 'unknown'))
        if proj not in projects:
            projects[proj] = {
                'project': proj,
                'active': 0,
                'blocked': 0,
                'p0': 0,
                'p1': 0,
                'overdue': 0,
                'my_count': 0,
                'completed_week': 0,
                'total': 0,
            }
        p = projects[proj]
        p['total'] += 1

        status = t.get('status', 'pending')
        is_active = status not in ('completed', 'cancelled')

        if is_active:
            p['active'] += 1
        if status == 'blocked':
            p['blocked'] += 1
        if is_active and t.get('priority') == 'P0':
            p['p0'] += 1
        if is_active and t.get('priority') == 'P1':
            p['p1'] += 1
        if t.get('is_overdue'):
            p['overdue'] += 1
        if status == 'completed':
            cd = t.get('completed_date')
            if cd and cd.toordinal() >= week_ago:
                p['completed_week'] += 1

        if my_name and is_active:
            owners = t.get('_owners', [])
            if my_name in owners:
                p['my_count'] += 1

    # Sort by active count descending
    result = sorted(projects.values(), key=lambda x: x['active'], reverse=True)
    return result
