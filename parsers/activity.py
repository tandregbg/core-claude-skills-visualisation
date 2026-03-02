"""Scan vault folders for YYMMDD-*.md files, classify by domain and type, aggregate counts."""

import os
import re
from datetime import datetime, date
from collections import defaultdict
from urllib.parse import quote


# Domain classification based on directory path
DOMAIN_PATTERNS = [
    ('meetings/management/Henrik', 'management-1on1'),
    ('meetings/management/Prashant', 'management-1on1'),
    ('meetings/management', 'management'),
    ('meetings/board/tim', 'board-1on1'),
    ('meetings/board', 'board'),
    ('meetings/marketing/ppc', 'marketing-ppc'),
    ('meetings/marketing/meta', 'marketing-meta'),
    ('meetings/marketing/seo', 'marketing-seo'),
    ('meetings/marketing/strategic', 'marketing-strategic'),
    ('meetings/marketing/technical', 'marketing-technical'),
    ('meetings/marketing', 'marketing'),
    ('meetings/operations', 'operations'),
    ('meetings/monthly', 'monthly'),
    ('meetings/development', 'development'),
    ('meetings/unsorted', 'unsorted'),
    ('meetings/', 'meetings-other'),
    ('projects/sonetel-mobile-v3/meetings', 'mobile-standup'),
    ('projects/', 'project'),
]

# File type classification based on filename keywords
TYPE_KEYWORDS = [
    ('standup', 'standup'),
    ('daily-standup', 'standup'),
    ('forberedelse', 'preparation'),
    ('preparation', 'preparation'),
    ('monthly-part-A', 'monthly-financial'),
    ('monthly-part-B', 'monthly-strategic'),
    ('monthly-part', 'monthly'),
    ('board-meeting', 'board'),
    ('board', 'board'),
    ('samtal', 'conversation'),
    ('Development-Overview', 'development-overview'),
    ('Weekly-Management', 'management-weekly'),
]


def classify_domain(relative_path):
    """Classify a file's domain based on its relative path within the vault folder."""
    for pattern, domain in DOMAIN_PATTERNS:
        if pattern in relative_path:
            return domain
    return 'other'


def classify_type(filename):
    """Classify file type based on filename keywords."""
    for keyword, file_type in TYPE_KEYWORDS:
        if keyword.lower() in filename.lower():
            return file_type
    return 'meeting-summary'


def parse_filename_date(filename):
    """Extract date from YYMMDD-*.md filename."""
    m = re.match(r'^(\d{6})-', filename)
    if m:
        try:
            return datetime.strptime(m.group(1), '%y%m%d').date()
        except ValueError:
            return None
    return None


def scan_vault_folder(vault_path, folder_path, vault_name='Tomas'):
    """Scan a single vault folder for YYMMDD-*.md files.

    Returns a list of file entries: {
        'filename': str,
        'relative_path': str (relative to vault root),
        'folder_relative_path': str (relative to folder),
        'date': date,
        'domain': str,
        'file_type': str,
        'obsidian_link': str,
        'size': int,
        'mtime': float,
    }
    """
    full_folder = os.path.join(vault_path, folder_path)
    if not os.path.isdir(full_folder):
        return []

    files = []
    for root, dirs, filenames in os.walk(full_folder):
        # Skip hidden dirs and .archive
        dirs[:] = [d for d in dirs if not d.startswith('.')]

        for fname in filenames:
            if not fname.endswith('.md'):
                continue

            file_date = parse_filename_date(fname)
            if file_date is None:
                continue

            full_path = os.path.join(root, fname)
            rel_to_vault = os.path.relpath(full_path, vault_path)
            rel_to_folder = os.path.relpath(full_path, full_folder)

            # Build obsidian:// link (without .md extension)
            obsidian_file = rel_to_vault
            if obsidian_file.endswith('.md'):
                obsidian_file = obsidian_file[:-3]
            obsidian_link = f"obsidian://open?vault={quote(vault_name)}&file={quote(obsidian_file)}"

            try:
                stat = os.stat(full_path)
                size = stat.st_size
                mtime = stat.st_mtime
            except OSError:
                size = 0
                mtime = 0

            files.append({
                'filename': fname,
                'relative_path': rel_to_vault,
                'folder_relative_path': rel_to_folder,
                'date': file_date,
                'domain': classify_domain(rel_to_folder),
                'file_type': classify_type(fname),
                'obsidian_link': obsidian_link,
                'size': size,
                'mtime': mtime,
            })

    return files


def scan_all_folders(vault_path, projects, vault_name='Tomas'):
    """Scan all project folders for dated files.

    Returns dict: {project_name: [file_entries]}
    """
    result = {}
    for proj_name, proj_config in projects.items():
        folder = proj_config.get('vault', '')
        entries = scan_vault_folder(vault_path, folder, vault_name)
        # Tag each entry with its project
        for e in entries:
            e['project'] = proj_name
        result[proj_name] = entries
    return result


def aggregate_daily_counts(files):
    """Aggregate file counts per day for heatmap data.

    Returns dict: {'YYYY-MM-DD': count}
    """
    counts = defaultdict(int)
    for f in files:
        if f.get('date'):
            key = f['date'].isoformat()
            counts[key] += 1
    return dict(counts)


def aggregate_domain_counts(files):
    """Aggregate file counts by domain.

    Returns dict: {domain: count}
    """
    counts = defaultdict(int)
    for f in files:
        counts[f.get('domain', 'other')] += 1
    return dict(counts)


def aggregate_type_counts(files):
    """Aggregate file counts by type.

    Returns dict: {file_type: count}
    """
    counts = defaultdict(int)
    for f in files:
        counts[f.get('file_type', 'other')] += 1
    return dict(counts)


def aggregate_weekly_counts(files, weeks=12):
    """Aggregate file counts per ISO week for trend chart.

    Returns list of {week: 'YYYY-WNN', count: int} for the last N weeks.
    """
    today = date.today()
    counts = defaultdict(int)
    for f in files:
        if f.get('date'):
            iso = f['date'].isocalendar()
            week_key = f"{iso[0]}-W{iso[1]:02d}"
            counts[week_key] += 1

    # Get last N weeks
    all_weeks = sorted(counts.keys())
    recent = all_weeks[-weeks:] if len(all_weeks) > weeks else all_weeks
    return [{'week': w, 'count': counts[w]} for w in recent]


def get_recent_files(files, limit=20):
    """Get the most recently created files (by date in filename, then mtime)."""
    sorted_files = sorted(files, key=lambda f: (f.get('date', date.min), f.get('mtime', 0)), reverse=True)
    return sorted_files[:limit]


def get_files_created_today(files, today=None):
    """Count files with today's date in filename."""
    if today is None:
        today = date.today()
    return sum(1 for f in files if f.get('date') == today)
