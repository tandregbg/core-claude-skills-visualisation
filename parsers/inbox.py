"""Parse _inbox.yaml: load inbox items, read content files, compute stats.

Supports two entry points:
1. Tracked items: created via web UI or /inbox skill, registered in _inbox.yaml
2. Dropped files: any .md or .txt file placed directly in _inbox/ gets
   auto-registered on next load (orphan detection)
"""

import os
import re
from datetime import date

import yaml
import markdown as md


# File extensions that count as inbox content
_CONTENT_EXTENSIONS = {'.md', '.txt'}


def _ensure_inbox(inbox_dir):
    """Create _inbox/ directory and empty _inbox.yaml if missing."""
    os.makedirs(inbox_dir, exist_ok=True)
    os.makedirs(os.path.join(inbox_dir, '.archive'), exist_ok=True)

    yaml_path = os.path.join(inbox_dir, '_inbox.yaml')
    if not os.path.isfile(yaml_path):
        data = {
            'version': 1,
            'last_updated': None,
            'next_id': 1,
            'items': [],
        }
        with open(yaml_path, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, sort_keys=False, default_flow_style=False, allow_unicode=True)


def _title_from_filename(filename):
    """Derive a human-readable title from a filename.

    '260308-quick-note-api-idea.md' -> 'api idea'
    'my random thoughts.txt'        -> 'my random thoughts'
    """
    name = filename
    for ext in _CONTENT_EXTENSIONS:
        if name.endswith(ext):
            name = name[:-len(ext)]
    # Strip leading YYMMDD- date prefix
    name = re.sub(r'^\d{6}-', '', name)
    # Strip leading type prefix (voice-memo-, quick-note-, etc.)
    name = re.sub(r'^(voice-memo|quick-note|email|raw-text|clipboard)-', '', name)
    # Hyphens/underscores to spaces
    name = name.replace('-', ' ').replace('_', ' ').strip()
    return name or filename


def _detect_type_from_content(content):
    """Guess content type from the text itself."""
    if not content:
        return 'raw_text'
    lower = content[:2000].lower()
    # Email signals
    if re.search(r'^(from|to|subject|date):\s', lower, re.MULTILINE):
        return 'email'
    # Voice memo signals: speaker labels, timestamps
    if re.search(r'^\s*\w+:\s', lower, re.MULTILINE) and re.search(r'\d{1,2}:\d{2}', lower):
        return 'voice_memo'
    # Short text = quick note
    if len(content.strip()) < 500:
        return 'quick_note'
    return 'raw_text'


def _register_orphans(inbox_dir, data):
    """Scan _inbox/ for files not tracked in _inbox.yaml and auto-register them.

    Returns True if any orphans were registered (yaml needs saving).
    """
    tracked_files = set()
    for item in (data.get('items') or []):
        f = item.get('file', '')
        if f:
            tracked_files.add(f)

    # Scan directory for content files (skip _inbox.yaml, .archive/, dotfiles)
    orphans = []
    try:
        for entry in os.listdir(inbox_dir):
            if entry.startswith('.') or entry.startswith('_'):
                continue
            _, ext = os.path.splitext(entry)
            if ext.lower() not in _CONTENT_EXTENSIONS:
                continue
            if entry not in tracked_files:
                orphans.append(entry)
    except OSError:
        return False

    if not orphans:
        return False

    # Sort by name (roughly chronological if YYMMDD-prefixed)
    orphans.sort()
    next_id = data.get('next_id', 1)
    yymmdd = date.today().strftime('%y%m%d')

    for filename in orphans:
        # Read file to detect type
        file_path = os.path.join(inbox_dir, filename)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except (OSError, UnicodeDecodeError):
            content = ''

        item_type = _detect_type_from_content(content)
        title = _title_from_filename(filename)

        # Extract date from filename if YYMMDD-prefixed
        date_match = re.match(r'^(\d{6})-', filename)
        created = date_match.group(1) if date_match else yymmdd

        item = {
            'id': next_id,
            'title': title,
            'type': item_type,
            'classification': None,
            'status': 'new',
            'file': filename,
            'created': created,
            'source_method': 'file_drop',
            'routing': {
                'target_skill': None,
                'target_folder': None,
                'confidence': None,
            },
            'processed': {
                'date': None,
                'output_file': None,
            },
            'tags': [],
        }

        if data.get('items') is None:
            data['items'] = []
        data['items'].append(item)
        next_id += 1

    data['next_id'] = next_id
    data['last_updated'] = yymmdd
    return True


def load_inbox(inbox_dir):
    """Parse _inbox.yaml. Returns (metadata_dict, items_list).

    Auto-creates the directory and file if missing.
    Auto-registers any orphan files found in _inbox/ that aren't tracked.
    """
    _ensure_inbox(inbox_dir)
    yaml_path = os.path.join(inbox_dir, '_inbox.yaml')

    with open(yaml_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)

    if not data:
        data = {'version': 1, 'last_updated': None, 'next_id': 1, 'items': []}

    # Auto-register orphan files (dropped directly into _inbox/)
    if _register_orphans(inbox_dir, data):
        with open(yaml_path, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, sort_keys=False, default_flow_style=False, allow_unicode=True)

    items = data.get('items') or []
    metadata = {
        'version': data.get('version', 1),
        'last_updated': data.get('last_updated'),
        'next_id': data.get('next_id', 1),
    }
    return metadata, items


def get_inbox_item(inbox_dir, item_id):
    """Return a single item dict with rendered HTML content, or None."""
    _, items = load_inbox(inbox_dir)

    item = None
    for i in items:
        if i.get('id') == item_id:
            item = i
            break

    if item is None:
        return None

    result = dict(item)

    # Read and render the .md file
    filename = item.get('file', '')
    if filename:
        # Check active directory first, then archive
        file_path = os.path.join(inbox_dir, filename)
        if not os.path.isfile(file_path):
            file_path = os.path.join(inbox_dir, '.archive', filename)

        if os.path.isfile(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                raw = f.read()
            result['content_raw'] = raw
            result['content_html'] = md.markdown(
                raw, extensions=['tables', 'fenced_code', 'nl2br']
            )
        else:
            result['content_raw'] = ''
            result['content_html'] = '<p class="empty-state">File not found</p>'
    else:
        result['content_raw'] = ''
        result['content_html'] = '<p class="empty-state">No content file</p>'

    return result


def get_inbox_stats(items):
    """Compute counts by status and by classification."""
    status_counts = {}
    classification_counts = {}
    type_counts = {}

    for item in items:
        s = item.get('status', 'new')
        status_counts[s] = status_counts.get(s, 0) + 1

        c = item.get('classification') or 'unclassified'
        classification_counts[c] = classification_counts.get(c, 0) + 1

        t = item.get('type') or 'unknown'
        type_counts[t] = type_counts.get(t, 0) + 1

    return {
        'status_counts': status_counts,
        'classification_counts': classification_counts,
        'type_counts': type_counts,
        'total': len(items),
        'active': len([i for i in items if i.get('status') not in ('archived',)]),
    }
