"""Scan vault folders for _insights.yaml files, parse and aggregate insights."""

import os
import re
from datetime import datetime, date
from urllib.parse import quote

import yaml


def parse_insight_date(date_str):
    """Parse YYMMDD date string to date object."""
    s = str(date_str).strip()
    if len(s) == 6:
        try:
            return datetime.strptime(s, '%y%m%d').date()
        except ValueError:
            return None
    return None


def scan_insights(vault_path, projects, vault_name=None):
    """Walk project folders, _contacts/*/ and _projects/*/ folders looking for _insights.yaml files.

    Returns list of insight dicts, each enriched with:
    - 'project': which project folder it came from
    - 'context': from the YAML context field
    - 'folder_path': relative path to the folder
    - 'date_obj': parsed date object from YYMMDD
    - 'obsidian_link': link to source file (if source.file exists)
    """
    if vault_name is None:
        vault_name = os.path.basename(vault_path)

    all_insights = []
    seen_yaml_paths = set()

    # Collect folders to scan: project folders + _contacts/ + _projects/ subfolders
    folders_to_scan = []

    for proj_name, proj_config in projects.items():
        folder = proj_config.get('vault', '')
        if folder:
            folders_to_scan.append((proj_name, folder))

    # Also scan _contacts/*/ and _projects/*/ folders at vault root
    # Track real paths to avoid scanning the same directory tree twice
    scanned_realpaths = set()
    for _, folder_path in folders_to_scan:
        rp = os.path.realpath(os.path.join(vault_path, folder_path))
        scanned_realpaths.add(rp)

    for container in ('_contacts', '_projects'):
        container_path = os.path.join(vault_path, container)
        if not os.path.isdir(container_path):
            continue
        try:
            for entry in os.listdir(container_path):
                entry_path = os.path.join(container_path, entry)
                if os.path.isdir(entry_path):
                    rp = os.path.realpath(entry_path)
                    if rp not in scanned_realpaths:
                        rel_path = os.path.join(container, entry)
                        folders_to_scan.append((entry, rel_path))
                        scanned_realpaths.add(rp)
        except OSError:
            pass

    for proj_name, folder_path in folders_to_scan:
        full_folder = os.path.join(vault_path, folder_path)
        if not os.path.isdir(full_folder):
            continue

        # Walk folder tree looking for _insights.yaml
        for root, dirs, files in os.walk(full_folder):
            dirs[:] = [d for d in dirs if not d.startswith('.')]

            if '_insights.yaml' not in files:
                continue

            yaml_path = os.path.join(root, '_insights.yaml')
            rel_folder = os.path.relpath(root, vault_path)

            try:
                with open(yaml_path, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f)
            except (OSError, yaml.YAMLError):
                continue

            if not data or not isinstance(data.get('insights'), list):
                continue

            context = data.get('context', proj_name)

            for insight in data['insights']:
                if not isinstance(insight, dict):
                    continue

                date_obj = parse_insight_date(insight.get('date'))

                # Build obsidian link for source file
                obsidian_link = None
                source = insight.get('source', {})
                if isinstance(source, dict) and source.get('file'):
                    source_file = source['file']
                    # Resolve relative to the folder containing _insights.yaml
                    obsidian_file = os.path.join(rel_folder, source_file)
                    if obsidian_file.endswith('.md'):
                        obsidian_file = obsidian_file[:-3]
                    obsidian_link = (
                        f"obsidian://open?vault={quote(vault_name)}"
                        f"&file={quote(obsidian_file)}"
                    )

                all_insights.append({
                    'id': insight.get('id'),
                    'type': insight.get('type', 'learning'),
                    'date': str(insight.get('date', '')),
                    'date_obj': date_obj,
                    'summary': insight.get('summary', ''),
                    'rationale': insight.get('rationale', ''),
                    'source': source,
                    'tags': insight.get('tags', []),
                    'status': insight.get('status', 'active'),
                    'superseded_by': insight.get('superseded_by'),
                    'project': proj_name,
                    'context': context,
                    'folder_path': rel_folder,
                    'obsidian_link': obsidian_link,
                })

    # Sort by date descending (newest first)
    all_insights.sort(
        key=lambda i: (i['date_obj'] or date.min,),
        reverse=True,
    )

    return all_insights


def filter_insights(insights, project=None, insight_type=None, status='active'):
    """Filter insights by project, type(s), and status.

    insight_type can be a single type, comma-separated types, or 'all'.
    """
    result = insights

    if project and project != 'all':
        result = [i for i in result if i['project'] == project]

    if insight_type and insight_type != 'all':
        types = set(t.strip() for t in insight_type.split(','))
        result = [i for i in result if i['type'] in types]

    if status and status != 'all':
        result = [i for i in result if i['status'] == status]

    return result


def aggregate_type_counts(insights):
    """Count insights by type."""
    counts = {}
    for i in insights:
        t = i.get('type', 'other')
        counts[t] = counts.get(t, 0) + 1
    return counts


def aggregate_monthly_counts(insights):
    """Aggregate insight counts per month for timeline chart.

    Returns list of {'month': 'YYYY-MM', 'counts': {type: count}} sorted chronologically.
    """
    monthly = {}
    for i in insights:
        d = i.get('date_obj')
        if not d:
            continue
        month_key = d.strftime('%Y-%m')
        if month_key not in monthly:
            monthly[month_key] = {}
        t = i.get('type', 'other')
        monthly[month_key][t] = monthly[month_key].get(t, 0) + 1

    return [
        {'month': m, 'counts': monthly[m]}
        for m in sorted(monthly.keys())
    ]


def aggregate_tag_counts(insights):
    """Count insights per tag across all insights."""
    counts = {}
    for i in insights:
        for tag in i.get('tags', []):
            counts[tag] = counts.get(tag, 0) + 1
    return counts


def aggregate_context_counts(insights):
    """Count insights per context (contact/project folder)."""
    counts = {}
    for i in insights:
        ctx = i.get('context', i.get('project', 'unknown'))
        counts[ctx] = counts.get(ctx, 0) + 1
    return counts


def aggregate_type_context_matrix(insights):
    """Build a type x context count matrix.

    Returns {type: {context: count}} for all types and contexts present.
    """
    matrix = {}
    for i in insights:
        t = i.get('type', 'other')
        ctx = i.get('context', i.get('project', 'unknown'))
        if t not in matrix:
            matrix[t] = {}
        matrix[t][ctx] = matrix[t].get(ctx, 0) + 1
    return matrix


def aggregate_type_tag_matrix(insights):
    """Build a type x tag count matrix.

    Returns {type: {tag: count}} for all types and tags present.
    """
    matrix = {}
    for i in insights:
        t = i.get('type', 'other')
        if t not in matrix:
            matrix[t] = {}
        for tag in i.get('tags', []):
            matrix[t][tag] = matrix[t].get(tag, 0) + 1
    return matrix


def serialize_insight(insight):
    """Make an insight JSON-serializable (convert date objects)."""
    result = dict(insight)
    if result.get('date_obj'):
        result['date_obj'] = result['date_obj'].isoformat()
    else:
        result['date_obj'] = None
    return result
