"""Parse _tasks.yaml: projects registry, task filtering, grouping, overdue detection."""

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

    projects = data.get('projects', {})
    tasks = data.get('tasks', []) or []
    next_id = data.get('next_id', 0)
    return projects, tasks, next_id


def enrich_task(task, today=None):
    """Add computed fields to a task dict: due_date, is_overdue, days_overdue, due_display."""
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

    # Project distribution (active tasks)
    project_counts = {}
    for t in active:
        proj = t.get('project', 'unknown')
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
