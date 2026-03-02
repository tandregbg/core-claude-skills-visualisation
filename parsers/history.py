"""Parse _tasks-history.md for completed tasks archive."""

import re
from datetime import datetime, date


def parse_history_file(history_path):
    """Parse _tasks-history.md and return a list of completed task entries.

    Each entry: {
        'id': int or None,
        'title': str,
        'priority': str or None,
        'project': str or None,
        'source': str or None,
        'created': date or None,
        'completed': date or None,
        'note': str or None,
        'section_date': str,  # e.g. '260225'
    }
    """
    with open(history_path, 'r', encoding='utf-8') as f:
        content = f.read()

    entries = []
    current_section_date = None

    for line in content.split('\n'):
        line = line.strip()

        # Section headers like "### 260225"
        m = re.match(r'^###\s+(\d{6})', line)
        if m:
            current_section_date = m.group(1)
            continue

        # Task entries like "- [x] **#7 Shazia in i utvecklingsmöten som SPOC** (P1)"
        m = re.match(r'^-\s+\[x\]\s+\*\*(?:#(\d+)\s+)?(.+?)\*\*(?:\s+\((\w+)\))?', line)
        if m:
            task_id = int(m.group(1)) if m.group(1) else None
            title = m.group(2).strip()
            priority = m.group(3)
            entries.append({
                'id': task_id,
                'title': title,
                'priority': priority,
                'project': None,
                'source': None,
                'created': None,
                'completed': None,
                'note': None,
                'section_date': current_section_date,
            })
            continue

        # Metadata lines for the most recent entry
        if entries:
            entry = entries[-1]

            # Project line
            m = re.match(r'^-\s+Project:\s+(.+)', line)
            if m:
                entry['project'] = m.group(1).strip()
                continue

            # Source line
            m = re.match(r'^-\s+Source:\s+(.+)', line)
            if m:
                entry['source'] = m.group(1).strip()
                continue

            # Created/Completed line
            m = re.match(r'^-\s+Created:\s+(\d{6})\s*\|\s*Completed:\s+(\d{6})', line)
            if m:
                entry['created'] = _parse_yymmdd(m.group(1))
                entry['completed'] = _parse_yymmdd(m.group(2))
                continue

            # Note line
            m = re.match(r'^-\s+Note:\s+(.+)', line)
            if m:
                entry['note'] = m.group(1).strip()
                continue

    return entries


def _parse_yymmdd(s):
    """Parse YYMMDD string to date."""
    try:
        return datetime.strptime(s, '%y%m%d').date()
    except (ValueError, TypeError):
        return None


def get_history_for_task(entries, task_id):
    """Find history entry for a specific task ID."""
    for entry in entries:
        if entry.get('id') == task_id:
            return entry
    return None


def get_recent_completions(entries, days=30):
    """Get entries completed within the last N days."""
    today = date.today()
    result = []
    for entry in entries:
        if entry.get('completed'):
            delta = (today - entry['completed']).days
            if delta <= days:
                result.append(entry)
    return result
