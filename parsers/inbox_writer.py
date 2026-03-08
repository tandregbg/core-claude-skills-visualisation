"""Write operations for _inbox/ -- create items, classify, archive."""

import os
import re
import shutil
from datetime import date

import yaml

from parsers.inbox import _ensure_inbox


def _load_yaml(inbox_dir):
    """Load _inbox.yaml data dict."""
    _ensure_inbox(inbox_dir)
    yaml_path = os.path.join(inbox_dir, '_inbox.yaml')
    with open(yaml_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)
    if not data:
        data = {'version': 1, 'last_updated': None, 'next_id': 1, 'items': []}
    if data.get('items') is None:
        data['items'] = []
    return data


def _save_yaml(inbox_dir, data):
    """Write _inbox.yaml atomically."""
    yaml_path = os.path.join(inbox_dir, '_inbox.yaml')
    with open(yaml_path, 'w', encoding='utf-8') as f:
        yaml.dump(data, f, sort_keys=False, default_flow_style=False, allow_unicode=True)


def _slugify(text, max_len=50):
    """Convert text to a filename-safe slug."""
    s = text.lower().strip()
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'[\s_]+', '-', s)
    s = re.sub(r'-+', '-', s).strip('-')
    return s[:max_len]


def _yymmdd():
    """Return today as YYMMDD string."""
    return date.today().strftime('%y%m%d')


def create_item(inbox_dir, title, content, item_type='quick_note',
                source_method='web_ui', tags=None, project=None):
    """Create a new inbox item: write .md file + update _inbox.yaml.

    Args:
        inbox_dir: path to _inbox/ directory
        title: item title
        content: markdown content body
        item_type: voice_memo | quick_note | email | raw_text | clipboard
        source_method: skill | web_ui | file_drop
        tags: optional list of tag strings
        project: optional project name for routing context

    Returns the new item dict with id.
    """
    _ensure_inbox(inbox_dir)
    data = _load_yaml(inbox_dir)

    item_id = data.get('next_id', 1)
    yymmdd = _yymmdd()
    slug = _slugify(title)
    filename = f'{yymmdd}-{item_type.replace("_", "-")}-{slug}.md'

    # Write content file
    file_path = os.path.join(inbox_dir, filename)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    # Build item entry
    item = {
        'id': item_id,
        'title': title,
        'type': item_type,
        'classification': None,
        'status': 'new',
        'file': filename,
        'created': yymmdd,
        'source_method': source_method,
        'routing': {
            'target_skill': None,
            'target_folder': project,
            'confidence': None,
        },
        'processed': {
            'date': None,
            'output_file': None,
        },
        'tags': tags or [],
        'project': project,
    }

    data['items'].append(item)
    data['next_id'] = item_id + 1
    data['last_updated'] = yymmdd
    _save_yaml(inbox_dir, data)

    return item


def update_classification(inbox_dir, item_id, classification,
                          target_skill=None, target_folder=None, confidence=None):
    """Update classification and routing fields for an item.

    Returns the updated item dict, or raises ValueError.
    """
    data = _load_yaml(inbox_dir)

    item = None
    for i in data['items']:
        if i.get('id') == item_id:
            item = i
            break

    if item is None:
        raise ValueError(f'Item #{item_id} not found')

    item['classification'] = classification
    item['status'] = 'classified'

    if 'routing' not in item or not isinstance(item.get('routing'), dict):
        item['routing'] = {}
    item['routing']['target_skill'] = target_skill
    item['routing']['target_folder'] = target_folder
    item['routing']['confidence'] = confidence

    data['last_updated'] = _yymmdd()
    _save_yaml(inbox_dir, data)

    return item


def archive_item(inbox_dir, item_id):
    """Move .md file to .archive/ and set status to archived.

    Returns the updated item dict, or raises ValueError.
    """
    data = _load_yaml(inbox_dir)

    item = None
    for i in data['items']:
        if i.get('id') == item_id:
            item = i
            break

    if item is None:
        raise ValueError(f'Item #{item_id} not found')

    # Move file to .archive/
    filename = item.get('file', '')
    if filename:
        src = os.path.join(inbox_dir, filename)
        archive_dir = os.path.join(inbox_dir, '.archive')
        os.makedirs(archive_dir, exist_ok=True)
        dst = os.path.join(archive_dir, filename)
        if os.path.isfile(src):
            shutil.move(src, dst)

    item['status'] = 'archived'
    data['last_updated'] = _yymmdd()
    _save_yaml(inbox_dir, data)

    return item
