"""Parse _inbox.yaml: load inbox items, read content files, compute stats."""

import os

import yaml
import markdown as md


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


def load_inbox(inbox_dir):
    """Parse _inbox.yaml. Returns (metadata_dict, items_list).

    Auto-creates the directory and file if missing.
    """
    _ensure_inbox(inbox_dir)
    yaml_path = os.path.join(inbox_dir, '_inbox.yaml')

    with open(yaml_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)

    if not data:
        data = {'version': 1, 'last_updated': None, 'next_id': 1, 'items': []}

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
