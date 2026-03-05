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
    ('förberedelse', 'preparation'),
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

        # Count dated files (YYMMDD-*.md) or any .md files as indicators
        if score < min_score:
            try:
                has_dated = False
                has_md = False
                for f in os.listdir(full):
                    if f.endswith('.md'):
                        has_md = True
                        if len(f) > 7 and f[:6].isdigit() and f[6] == '-':
                            has_dated = True
                            break
                if has_dated:
                    score += 1
                elif has_md:
                    score += 1
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

        # _contacts is treated as a single project (all subfolders combined)
        if entry == '_contacts':
            if os.path.isdir(full_entry) and full_entry.rstrip('/') + '/' not in registered_paths:
                path = entry + '/'
                if path.rstrip('/') not in registered_paths:
                    discovered['contacts'] = {
                        'vault': path,
                        'shared_view': True,
                        'discovered': True,
                    }
            continue

        # Scan inside _projects/ and _private/ as container folders
        if entry in ('_projects', '_private'):
            try:
                sub_entries = os.listdir(full_entry)
            except OSError:
                continue
            for sub in sorted(sub_entries):
                if sub.startswith('.'):
                    continue
                sub_path = os.path.join(entry, sub)
                if os.path.isdir(os.path.join(vault_path, sub_path)):
                    _check_folder(sub_path, sub, min_score=2)
            continue

        # Skip other _ prefixed folders (system files like _tasks.yaml etc.)
        if entry.startswith('_'):
            continue

        # Check top-level folder (lower threshold -- root folders are intentional)
        _check_folder(entry, entry, min_score=1)

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
    """Extract date from YYMMDD-*.md or YYYY-MM-DD-*.md filename."""
    m = re.match(r'^(\d{6})-', filename)
    if m:
        try:
            return datetime.strptime(m.group(1), '%y%m%d').date()
        except ValueError:
            pass
    # Also try YYYY-MM-DD format
    m = re.match(r'^(\d{4}-\d{2}-\d{2})-', filename)
    if m:
        try:
            return datetime.strptime(m.group(1), '%Y-%m-%d').date()
        except ValueError:
            pass
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

        # Skip contact folders -- their CHANGELOGs are auto-generated logs,
        # not meaningful project status updates
        if folder.startswith('_contacts/'):
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


def scan_dashboard_files(vault_path, vault_name=None, days=30):
    """Scan vault root for _Dashboard*.md files modified within the given days.

    Returns list of file entries suitable for the recent files list.
    """
    if vault_name is None:
        vault_name = os.path.basename(vault_path)

    cutoff = datetime.now().timestamp() - (days * 86400)
    files = []

    try:
        for fname in os.listdir(vault_path):
            if not fname.startswith('_Dashboard') or not fname.endswith('.md'):
                continue
            full_path = os.path.join(vault_path, fname)
            if not os.path.isfile(full_path):
                continue
            try:
                stat = os.stat(full_path)
                mtime = stat.st_mtime
                size = stat.st_size
            except OSError:
                continue
            if mtime < cutoff:
                continue

            file_date = datetime.fromtimestamp(mtime).date()
            obsidian_file = fname[:-3] if fname.endswith('.md') else fname
            obsidian_link = f"obsidian://open?vault={quote(vault_name)}&file={quote(obsidian_file)}"

            # Label: _Dashboard.md -> "Dashboard", _Dashboard-sonetel.md -> "Dashboard (Sonetel)"
            if fname == '_Dashboard.md':
                label = 'Dashboard'
            else:
                org = fname.replace('_Dashboard-', '').replace('.md', '').title()
                label = f'Dashboard ({org})'

            files.append({
                'filename': fname,
                'relative_path': fname,
                'folder_relative_path': fname,
                'date': file_date,
                'domain': 'ops',
                'file_type': 'dashboard',
                'obsidian_link': obsidian_link,
                'size': size,
                'mtime': mtime,
                'project': 'dashboard',
                'ops_context': label,
            })
    except OSError:
        pass

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


def get_project_detail(vault_path, project_name, project_config, vault_name=None):
    """Get detailed info about a single project's ops structure.

    Returns dict with:
        name, vault_path, ops_files, meetings, sub_projects, stats
    """
    if vault_name is None:
        vault_name = os.path.basename(vault_path)

    folder = project_config.get('vault', '')
    full_folder = os.path.join(vault_path, folder)

    # Ops files: check existence and build paths
    ops_file_names = ['README.md', 'CHANGELOG.md', 'CLAUDE.md']
    ops_files = []
    for fname in ops_file_names:
        fpath = os.path.join(full_folder, fname)
        rel = os.path.join(folder, fname) if folder else fname
        exists = os.path.isfile(fpath)
        mtime = 0
        size = 0
        if exists:
            try:
                stat = os.stat(fpath)
                mtime = stat.st_mtime
                size = stat.st_size
            except OSError:
                pass
        ops_files.append({
            'filename': fname,
            'relative_path': rel,
            'exists': exists,
            'mtime': mtime,
            'size': size,
        })

    # Meetings: scan meetings/ or moten/ subfolder for dated files
    meetings = []
    meetings_dir = os.path.join(full_folder, 'meetings')
    if not os.path.isdir(meetings_dir):
        meetings_dir = os.path.join(full_folder, 'moten')
    if os.path.isdir(meetings_dir):
        for root, dirs, filenames in os.walk(meetings_dir):
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for fname in filenames:
                if not fname.endswith('.md'):
                    continue
                file_date = parse_filename_date(fname)
                if file_date is None:
                    continue
                full_path = os.path.join(root, fname)
                rel_to_vault = os.path.relpath(full_path, vault_path)
                try:
                    stat = os.stat(full_path)
                    mtime = stat.st_mtime
                    size = stat.st_size
                except OSError:
                    mtime = 0
                    size = 0
                # Subfolder within meetings/
                sub = os.path.relpath(root, meetings_dir)
                category = sub if sub != '.' else ''
                obsidian_file = rel_to_vault
                if obsidian_file.endswith('.md'):
                    obsidian_file = obsidian_file[:-3]
                obsidian_link = f"obsidian://open?vault={quote(vault_name)}&file={quote(obsidian_file)}"
                meetings.append({
                    'filename': fname,
                    'relative_path': rel_to_vault,
                    'date': file_date,
                    'category': category,
                    'file_type': classify_type(fname),
                    'obsidian_link': obsidian_link,
                    'mtime': mtime,
                    'size': size,
                })
    meetings.sort(key=lambda m: (m['date'], m['mtime']), reverse=True)

    # Sub-projects: show all subdirectories except meetings/moten (shown separately)
    sub_projects = []
    skip_dirs = {'meetings', 'moten', '.obsidian', '.git'}
    try:
        for entry in sorted(os.listdir(full_folder)):
            if entry.startswith('.') or entry.startswith('!') or entry in skip_dirs:
                continue
            sub_path = os.path.join(full_folder, entry)
            if not os.path.isdir(sub_path):
                continue
            has_readme = os.path.isfile(os.path.join(sub_path, 'README.md'))
            has_changelog = os.path.isfile(os.path.join(sub_path, 'CHANGELOG.md'))
            has_tasks = os.path.isfile(os.path.join(sub_path, '_tasks.yaml'))
            rel_path = os.path.relpath(sub_path, vault_path)
            sub_projects.append({
                'name': entry,
                'relative_path': rel_path,
                'has_readme': has_readme,
                'has_changelog': has_changelog,
                'has_tasks': has_tasks,
            })
    except OSError:
        pass

    # Contact subfolders (for the combined contacts project)
    contact_folders = []
    if folder.rstrip('/') == '_contacts':
        try:
            for entry in sorted(os.listdir(full_folder)):
                if entry.startswith('.'):
                    continue
                sub_path = os.path.join(full_folder, entry)
                if os.path.isdir(sub_path):
                    # Count dated files
                    file_count = 0
                    latest_date = None
                    for f in os.listdir(sub_path):
                        if f.endswith('.md'):
                            fd = parse_filename_date(f)
                            if fd:
                                file_count += 1
                                if latest_date is None or fd > latest_date:
                                    latest_date = fd
                    if file_count > 0:
                        contact_folders.append({
                            'name': entry,
                            'relative_path': os.path.join(folder, entry),
                            'file_count': file_count,
                            'latest_date': latest_date,
                        })
        except OSError:
            pass
        contact_folders.sort(key=lambda c: c.get('latest_date') or date.min, reverse=True)

    # Stats: count all dated files
    all_files = scan_vault_folder(vault_path, folder, vault_name)
    total_files = len(all_files)
    date_range = None
    if all_files:
        dates = [f['date'] for f in all_files if f.get('date')]
        if dates:
            date_range = {
                'earliest': min(dates),
                'latest': max(dates),
            }

    return {
        'name': project_name,
        'vault': folder,
        'discovered': project_config.get('discovered', False),
        'ops_files': ops_files,
        'meetings': meetings,
        'sub_projects': sub_projects,
        'contact_folders': contact_folders,
        'stats': {
            'total_files': total_files,
            'date_range': date_range,
        },
    }
