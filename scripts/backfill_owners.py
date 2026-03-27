#!/usr/bin/env python3
"""Backfill 'owner' field in _tasks.yaml files across a vault.

Reads all _tasks.yaml files, extracts owner from notes[0] pattern,
and writes the owner field. Tasks that already have an owner field
are left untouched.

Usage:
    python scripts/backfill_owners.py                  # Dry-run (default)
    python scripts/backfill_owners.py --write          # Actually write changes
    python scripts/backfill_owners.py --vault ~/path   # Custom vault path
"""

import argparse
import os
import re
import sys

import yaml


# Same skip list as parsers/tasks.py extract_owners()
SKIP_WORDS = {
    'new', 'done', 'fixed', 'pending', 'active', 'ongoing', 'waiting',
    'released', 'confirmed', 'identified', 'resolved', 'decision',
    'updated', 'planerad', 'projekt', 'ansvariga', 'ansvarig',
    'prio', 'alla', 'alla team',
}


def extract_owner_from_notes(task):
    """Extract owner names from first note entry. Returns list or None."""
    if task.get('owner'):
        return None  # Already has owner field

    notes = task.get('notes', []) or []
    if not notes:
        return None

    first_note = notes[0]
    if isinstance(first_note, dict):
        first_note = first_note.get('note', '')
    if not isinstance(first_note, str):
        return None

    m = re.match(r'^((?:[A-Z][a-z]+)(?:\s*\+\s*[A-Z][a-z]+)*)\b', first_note)
    if not m:
        return None

    raw = m.group(1)
    if raw.lower() in SKIP_WORDS:
        return None

    owners = [n.strip() for n in raw.split('+')]
    return owners


def process_file(yaml_path, write=False):
    """Process a single _tasks.yaml file. Returns (total, updated, skipped)."""
    with open(yaml_path, 'r', encoding='utf-8') as f:
        content = f.read()

    data = yaml.safe_load(content)
    if not data or not isinstance(data.get('tasks'), list):
        return 0, 0, 0

    total = 0
    updated = 0
    skipped = 0

    for task in data['tasks']:
        if not isinstance(task, dict):
            continue
        total += 1

        if task.get('owner'):
            skipped += 1
            continue

        owners = extract_owner_from_notes(task)
        if owners:
            task['owner'] = owners
            updated += 1

    if write and updated > 0:
        with open(yaml_path, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    return total, updated, skipped


def main():
    parser = argparse.ArgumentParser(description='Backfill owner field in _tasks.yaml files')
    parser.add_argument('--write', action='store_true', help='Actually write changes (default: dry-run)')
    parser.add_argument('--vault', default=None, help='Vault path (default: from VAULT_PATH env or config)')
    args = parser.parse_args()

    vault_path = args.vault
    if not vault_path:
        # Try to load from config
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        try:
            import config
            vault_path = config.VAULT_PATH
        except ImportError:
            vault_path = os.path.expanduser('~/Documents/vault')

    if not os.path.isdir(vault_path):
        print(f'Error: Vault path not found: {vault_path}')
        sys.exit(1)

    mode = 'WRITE' if args.write else 'DRY-RUN'
    print(f'Backfill owners [{mode}]')
    print(f'Vault: {vault_path}')
    print()

    grand_total = 0
    grand_updated = 0
    grand_skipped = 0
    files_modified = 0

    for root, dirs, files in os.walk(vault_path):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        if '_tasks.yaml' not in files:
            continue

        yaml_path = os.path.join(root, '_tasks.yaml')
        rel_path = os.path.relpath(yaml_path, vault_path)

        try:
            total, updated, skipped = process_file(yaml_path, write=args.write)
        except yaml.YAMLError as e:
            print(f'  {rel_path}: YAML ERROR -- skipped ({e})')
            continue
        except Exception as e:
            print(f'  {rel_path}: ERROR -- skipped ({e})')
            continue

        grand_total += total
        grand_updated += updated
        grand_skipped += skipped

        if updated > 0:
            files_modified += 1
            print(f'  {rel_path}: {updated}/{total} tasks updated ({skipped} already had owner)')
        elif total > 0:
            print(f'  {rel_path}: {total} tasks, no owners detected')

    print()
    print(f'Summary: {grand_updated}/{grand_total} tasks updated across {files_modified} files')
    print(f'         {grand_skipped} tasks already had owner field')
    print(f'         {grand_total - grand_updated - grand_skipped} tasks with no detectable owner')

    if not args.write and grand_updated > 0:
        print()
        print('This was a dry run. Use --write to apply changes.')


if __name__ == '__main__':
    main()
