"""Scan vault folders for YYMMDD-*.md files, classify by domain and type, aggregate counts."""

import os
import re
from datetime import datetime, date
from collections import defaultdict
from urllib.parse import quote


# Domain classification based on directory path
DOMAIN_PATTERNS = [
    ('meetings/management', 'management'),
    ('meetings/board', 'board'),
    ('meetings/marketing', 'marketing'),
    ('meetings/operations', 'operations'),
    ('meetings/monthly', 'monthly'),
    ('meetings/development', 'development'),
    ('meetings/unsorted', 'unsorted'),
    ('meetings/', 'meetings-other'),
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


OPS_INDICATORS = [
    'CLAUDE.md',
    'CHANGELOG.md',
    'README.md',
    'task-priority-matrix.md',
]

OPS_DIRS = [
    'meetings',
    'ops',
]

# Folders to skip during auto-discovery (system, templates, non-project)
SKIP_FOLDERS = {
    '.obsidian', '.trash', 'clones',
}


def discover_projects(vault_path, registered_projects=None, scan_depth=2):
    """Auto-discover project folders by scanning for ops structure indicators.

    scan_depth controls how deep to look:
      1 = top-level vault folders only
      2 = top-level + one level of nesting (default)

    Returns dict of {name: {vault: path, shared_view: bool, discovered: True}}
    merged with registered_projects (which take precedence).
    """
    if registered_projects is None:
        registered_projects = {}

    # Build set of vault paths already registered
    registered_paths = set()
    for cfg in registered_projects.values():
        registered_paths.add(cfg.get('vault', '').rstrip('/'))

    discovered = {}

    def _check_folder(folder_path, name, min_score=2):
        """Check if a folder has ops structure (>= min_score indicators)."""
        full = os.path.join(vault_path, folder_path)
        if not os.path.isdir(full):
            return

        score = 0
        for indicator in OPS_INDICATORS:
            if os.path.isfile(os.path.join(full, indicator)):
                score += 1
        for d in OPS_DIRS:
            if os.path.isdir(os.path.join(full, d)):
                score += 1

        # Count dated files (YYMMDD-*.md) as an indicator
        if score < min_score:
            try:
                for f in os.listdir(full):
                    if f.endswith('.md') and len(f) > 7 and f[:6].isdigit() and f[6] == '-':
                        score += 1
                        break  # one dated file is enough
            except OSError:
                pass

        if score >= min_score and folder_path.rstrip('/') not in registered_paths:
            discovered[name] = {
                'vault': folder_path if folder_path.endswith('/') else folder_path + '/',
                'shared_view': True,
                'discovered': True,
            }

    try:
        entries = os.listdir(vault_path)
    except OSError:
        return dict(registered_projects)

    for entry in sorted(entries):
        if entry.startswith('.') or entry.startswith('!') or entry in SKIP_FOLDERS:
            continue

        full_entry = os.path.join(vault_path, entry)
        if not os.path.isdir(full_entry):
            continue

        # Scan inside _projects/ and _contacts/ as container folders
        if entry in ('_projects', '_contacts', '_private'):
            # Contact folders need lower threshold -- a CHANGELOG or dated files is enough
            threshold = 1 if entry == '_contacts' else 2
            try:
                sub_entries = os.listdir(full_entry)
            except OSError:
                continue
            for sub in sorted(sub_entries):
                if sub.startswith('.'):
                    continue
                sub_path = os.path.join(entry, sub)
                if os.path.isdir(os.path.join(vault_path, sub_path)):
                    _check_folder(sub_path, sub, min_score=threshold)
            continue

        # Skip other _ prefixed folders (system files like _tasks.yaml etc.)
        if entry.startswith('_'):
            continue

        # Check top-level folder
        _check_folder(entry, entry)

        # Check one level deeper for container folders when scan_depth >= 2
        if scan_depth >= 2:
            try:
                sub_entries = os.listdir(full_entry)
            except OSError:
                continue

            for sub in sorted(sub_entries):
                if sub.startswith(('.', '_', '!')):
                    continue
                sub_path = os.path.join(entry, sub)
                if os.path.isdir(os.path.join(vault_path, sub_path)):
                    _check_folder(sub_path, sub)

    # Merge: registered projects first, then discovered
    merged = dict(registered_projects)
    for name, cfg in discovered.items():
        if name not in merged:
            merged[name] = cfg

    return merged


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


def scan_vault_folder(vault_path, folder_path, vault_name=None):
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

    if vault_name is None:
        vault_name = os.path.basename(vault_path)

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


# Ops structure files to track for recent modifications (human-readable only)
OPS_FILES = {
    'README.md': 'project-update',
    'CHANGELOG.md': 'changelog',
}


def scan_ops_files(vault_path, projects, vault_name=None, days=30):
    """Scan project folders for recently modified ops structure files.

    Returns list of file entries for README.md, CHANGELOG.md, _tasks.yaml,
    _insights.yaml that were modified within the given number of days.
    Uses mtime to determine the date.
    """
    if vault_name is None:
        vault_name = os.path.basename(vault_path)

    cutoff = datetime.now().timestamp() - (days * 86400)
    files = []

    for proj_name, proj_config in projects.items():
        folder = proj_config.get('vault', '')
        full_folder = os.path.join(vault_path, folder)
        if not os.path.isdir(full_folder):
            continue

        # Walk folder tree for ops files
        for root, dirs, filenames in os.walk(full_folder):
            dirs[:] = [d for d in dirs if not d.startswith('.')]

            for fname in filenames:
                if fname not in OPS_FILES:
                    continue

                full_path = os.path.join(root, fname)
                try:
                    stat = os.stat(full_path)
                    mtime = stat.st_mtime
                    size = stat.st_size
                except OSError:
                    continue

                if mtime < cutoff:
                    continue

                rel_to_vault = os.path.relpath(full_path, vault_path)
                rel_to_folder = os.path.relpath(full_path, full_folder)

                # Use mtime as the file date
                file_date = datetime.fromtimestamp(mtime).date()

                obsidian_file = rel_to_vault
                if obsidian_file.endswith('.md'):
                    obsidian_file = obsidian_file[:-3]
                obsidian_link = f"obsidian://open?vault={quote(vault_name)}&file={quote(obsidian_file)}"

                # Derive a subfolder context (e.g. "projects/sonetel-mobile-v3")
                subfolder = os.path.relpath(root, full_folder)
                if subfolder == '.':
                    display_context = proj_name
                else:
                    display_context = subfolder.replace(os.sep, '/')

                files.append({
                    'filename': fname,
                    'relative_path': rel_to_vault,
                    'folder_relative_path': rel_to_folder,
                    'date': file_date,
                    'domain': 'ops',
                    'file_type': OPS_FILES[fname],
                    'obsidian_link': obsidian_link,
                    'size': size,
                    'mtime': mtime,
                    'project': proj_name,
                    'ops_context': display_context,
                })

    return files


def scan_all_folders(vault_path, projects, vault_name=None):
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
