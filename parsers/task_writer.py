"""Write operations for _tasks.yaml and _tasks-history.md."""

import os
import re
from datetime import datetime

import yaml


def complete_task(yaml_path, task_id, yymmdd):
    """Mark a task as completed in a _tasks.yaml file.

    Args:
        yaml_path: absolute path to _tasks.yaml
        task_id: integer task ID
        yymmdd: completion date as YYMMDD integer (e.g. 260305)

    Returns the updated task dict, or raises ValueError/FileNotFoundError.
    """
    if not os.path.isfile(yaml_path):
        raise FileNotFoundError(f'File not found: {yaml_path}')

    with open(yaml_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)

    if not data or not isinstance(data.get('tasks'), list):
        raise ValueError('No tasks list found in file')

    task = None
    for t in data['tasks']:
        if isinstance(t, dict) and t.get('id') == task_id:
            task = t
            break

    if task is None:
        raise ValueError(f'Task #{task_id} not found in {yaml_path}')

    task['status'] = 'completed'
    task['completed'] = yymmdd

    # Update root-level last_updated
    data['last_updated'] = yymmdd

    with open(yaml_path, 'w', encoding='utf-8') as f:
        yaml.dump(data, f, sort_keys=False, default_flow_style=False, allow_unicode=True)

    return task


def append_to_history(history_path, task, context, yymmdd):
    """Append a completed task entry to _tasks-history.md.

    Finds or creates the correct ## YYYY-MM section and ### YYMMDD subsection.

    Args:
        history_path: absolute path to _tasks-history.md
        task: task dict (must have id, task/title, priority, created, source)
        context: project/context name
        yymmdd: completion date as YYMMDD integer
    """
    yymmdd_str = str(yymmdd)

    # Parse YYMMDD to get month section
    try:
        dt = datetime.strptime(yymmdd_str, '%y%m%d')
    except ValueError:
        raise ValueError(f'Invalid date format: {yymmdd}')

    month_key = dt.strftime('%Y-%m')
    created_str = str(task.get('created', ''))

    # Calculate duration
    duration_text = ''
    if created_str and re.match(r'^\d{6}$', created_str):
        try:
            created_dt = datetime.strptime(created_str, '%y%m%d')
            days = (dt - created_dt).days
            duration_text = f'\n  - Duration: {days} day{"s" if days != 1 else ""}'
        except ValueError:
            pass

    # Build entry
    task_title = task.get('task') or task.get('title', 'Untitled')
    task_id = task.get('id')
    priority = task.get('priority', '')
    priority_str = f' ({priority})' if priority else ''
    id_str = f'#{task_id} ' if task_id else ''

    source = task.get('source', {})
    source_str = ''
    if isinstance(source, dict) and source.get('file'):
        source_str = f'\n  - Source: [[{source["file"]}]]'

    entry = (
        f'- [x] **{id_str}{task_title}**{priority_str}\n'
        f'  - Project: {context}\n'
        f'{source_str}'
        f'\n  - Created: {created_str} | Completed: {yymmdd_str}'
        f'{duration_text}'
    ).strip()

    # Read existing history file
    if os.path.isfile(history_path):
        with open(history_path, 'r', encoding='utf-8') as f:
            content = f.read()
    else:
        content = '# Task History\n\nCompleted tasks archive. Append-only log.\n\n---\n'

    month_header = f'## {month_key}'
    day_header = f'### {yymmdd_str}'

    # Find or create month section
    month_pos = content.find(month_header)
    if month_pos == -1:
        # Insert new month section after the --- separator (or at end)
        separator_pos = content.find('---')
        if separator_pos != -1:
            insert_pos = separator_pos + len('---')
            content = content[:insert_pos] + f'\n\n{month_header}\n\n{day_header}\n\n{entry}\n' + content[insert_pos:]
        else:
            content += f'\n\n{month_header}\n\n{day_header}\n\n{entry}\n'
    else:
        # Month exists -- find or create day subsection
        day_pos = content.find(day_header, month_pos)
        if day_pos == -1:
            # Insert day section right after month header
            after_month = month_pos + len(month_header)
            content = content[:after_month] + f'\n\n{day_header}\n\n{entry}\n' + content[after_month:]
        else:
            # Day section exists -- find the end of the day section and append
            # End is either the next ### or ## or end of file
            after_day = day_pos + len(day_header)
            next_section = len(content)
            for marker in ('### ', '## '):
                pos = content.find(marker, after_day + 1)
                if pos != -1 and pos < next_section:
                    next_section = pos

            # Insert entry before the next section
            insert_at = next_section
            # Back up past trailing whitespace
            while insert_at > after_day and content[insert_at - 1] in ('\n', ' '):
                insert_at -= 1

            content = content[:insert_at] + f'\n\n{entry}\n' + content[insert_at:]

    with open(history_path, 'w', encoding='utf-8') as f:
        f.write(content)
