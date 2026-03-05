/**
 * documents.js -- Documents page: project badges, type badges, day badges, file list, preview
 */

let selectedFilePath = null;
let selectedDay = 'today'; // default to today
let cachedData = null;
let activeProjects = new Set(); // empty = all
let activeTypes = new Set();    // empty = all

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function getRelativeDayKey(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
}

document.addEventListener('DOMContentLoaded', () => {
    selectedDay = getTodayKey();
    loadDocuments();
    document.getElementById('days-select').addEventListener('change', loadDocuments);
    window.addEventListener('folder-change', loadDocuments);
    window.addEventListener('privacy-change', loadDocuments);
});

async function loadDocuments() {
    const params = getApiParams();
    const days = document.getElementById('days-select').value;

    try {
        const res = await fetch(`/api/files/recent?${params}&days=${days}`);
        const data = await res.json();
        cachedData = data;
        selectedDay = null;

        renderProjectBadges(data.project_counts || {});
        renderDocTypeBadges(data.type_counts || {});
        renderDayBadges(data);
        renderFileList(data, null);
    } catch (err) {
        console.error('Failed to load documents:', err);
    }
}

// -- Project filter badges --

function renderProjectBadges(projectCounts) {
    const container = document.getElementById('project-badges');
    const sorted = Object.entries(projectCounts).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = sorted.map(([proj, count]) => {
        const isActive = activeProjects.has(proj);
        return `<button class="day-badge${isActive ? ' active' : ''}"
                    onclick="toggleProject('${escapeAttr(proj)}')">
                    <span class="day-badge-label">${escapeHtml(proj)}</span>
                    <span class="day-badge-count">${count}</span>
                </button>`;
    }).join('');
}

window.toggleProject = function(proj) {
    if (activeProjects.has(proj)) {
        activeProjects.delete(proj);
    } else {
        activeProjects.add(proj);
    }
    applyFilters();
};

// -- Document type filter badges --

function renderDocTypeBadges(typeCounts) {
    const container = document.getElementById('type-badges');
    const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = sorted.map(([type, count]) => {
        const isActive = activeTypes.has(type);
        return `<button class="day-badge${isActive ? ' active' : ''}"
                    onclick="toggleDocType('${escapeAttr(type)}')">
                    <span class="day-badge-label">${escapeHtml(type)}</span>
                    <span class="day-badge-count">${count}</span>
                </button>`;
    }).join('');
}

window.toggleDocType = function(type) {
    if (activeTypes.has(type)) {
        activeTypes.delete(type);
    } else {
        activeTypes.add(type);
    }
    applyFilters();
};

// -- Apply client-side filters and re-render --

function applyFilters() {
    if (!cachedData) return;
    selectedDay = null;
    renderDayBadges(cachedData);
    renderFileList(cachedData, null);
}

function getFilteredFiles(dayFiles) {
    let files = dayFiles;
    if (activeProjects.size > 0) {
        files = files.filter(f => activeProjects.has(f.project));
    }
    if (activeTypes.size > 0) {
        files = files.filter(f => activeTypes.has(f.file_type));
    }
    return files;
}

function getFilteredData() {
    if (!cachedData) return { days: {}, total: 0 };
    const result = {};
    let total = 0;
    for (const [dayKey, files] of Object.entries(cachedData.days)) {
        const filtered = getFilteredFiles(files);
        if (filtered.length > 0) {
            result[dayKey] = filtered;
            total += filtered.length;
        }
    }
    return { days: result, total };
}

// -- Day badges --

function getDayLabel(dayKey) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dayKey + 'T00:00:00');
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === -1) return 'Yesterday';
    if (diff === 1) return 'Tomorrow';
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return weekdayNames[d.getDay()];
}

function getDayType(dayKey) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dayKey + 'T00:00:00');
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff < 0) return 'past';
    return 'future';
}

function renderDayBadges(rawData) {
    const container = document.getElementById('day-badges');
    const countEl = document.getElementById('file-count');
    const filtered = getFilteredData();
    const days = filtered.days;

    countEl.textContent = `${filtered.total} documents`;

    // Always show Yesterday, Today, Tomorrow as fixed navigation
    const yesterdayKey = getRelativeDayKey(-1);
    const todayKey = getTodayKey();
    const tomorrowKey = getRelativeDayKey(1);
    const fixedDays = [
        { key: yesterdayKey, label: 'Yesterday', type: 'past' },
        { key: todayKey, label: 'Today', type: 'today' },
        { key: tomorrowKey, label: 'Tomorrow', type: 'tomorrow' },
    ];

    // Collect other days that have files but aren't in the fixed set
    const fixedKeys = new Set([yesterdayKey, todayKey, tomorrowKey]);
    const otherDays = Object.keys(days)
        .filter(d => !fixedKeys.has(d))
        .sort()
        .reverse();

    const allBadge = `<button class="day-badge day-badge-all${selectedDay === null ? ' active' : ''}" onclick="filterByDay(null)">All <span class="day-badge-count">${filtered.total}</span></button>`;

    const fixedBadges = fixedDays.map(({ key, label, type }) => {
        const count = (days[key] || []).length;
        const isActive = selectedDay === key;
        return `<button class="day-badge day-badge-${type}${isActive ? ' active' : ''}" onclick="filterByDay('${key}')" data-day="${key}">
            <span class="day-badge-label">${label}</span>
            <span class="day-badge-count">${count}</span>
        </button>`;
    }).join('');

    const otherBadges = otherDays.map(dayKey => {
        const files = days[dayKey];
        const label = getDayLabel(dayKey);
        const type = getDayType(dayKey);
        const dateStr = dayKey.slice(5);
        const isActive = selectedDay === dayKey;

        return `<button class="day-badge day-badge-${type}${isActive ? ' active' : ''}" onclick="filterByDay('${dayKey}')" data-day="${dayKey}">
            <span class="day-badge-label">${label}</span>
            <span class="day-badge-date">${dateStr}</span>
            <span class="day-badge-count">${files.length}</span>
        </button>`;
    }).join('');

    container.innerHTML = allBadge + fixedBadges + (otherDays.length > 0 ? '<span class="badge-separator"></span>' + otherBadges : '');
}

window.filterByDay = function(dayKey) {
    selectedDay = dayKey;
    selectedFilePath = null;

    // Update badge active state
    document.querySelectorAll('#day-badges .day-badge').forEach(el => {
        el.classList.remove('active');
    });
    if (dayKey === null) {
        const allBtn = document.querySelector('.day-badge-all');
        if (allBtn) allBtn.classList.add('active');
    } else {
        const badge = document.querySelector(`#day-badges .day-badge[data-day="${dayKey}"]`);
        if (badge) badge.classList.add('active');
    }

    renderFileList(cachedData, dayKey);
};

// -- File list --

function renderFileList(rawData, filterDay) {
    const container = document.getElementById('file-list');
    const filtered = getFilteredData();
    const days = filtered.days;
    let sortedDays = Object.keys(days).sort().reverse();

    if (filterDay) {
        sortedDays = sortedDays.filter(d => d === filterDay);
    }

    if (sortedDays.length === 0) {
        const label = filterDay ? getDayLabel(filterDay) : '';
        const msg = filterDay
            ? `No documents for ${label} (${filterDay})`
            : 'No documents found';
        container.innerHTML = `<p class="empty-state">${msg}</p>`;
        resetPreview();
        return;
    }

    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    container.innerHTML = sortedDays.map(dayKey => {
        const files = days[dayKey];
        const label = getDayLabel(dayKey);
        const fullLabel = (label === 'Today' || label === 'Yesterday' || label === 'Tomorrow')
            ? label
            : weekdayNames[new Date(dayKey + 'T00:00:00').getDay()];

        return `
            <div class="day-group">
                <div class="day-group-header">
                    <div class="day-group-label">
                        ${fullLabel}<span class="day-group-date">${dayKey}</span>
                    </div>
                    <span class="day-group-count">${files.length}</span>
                </div>
                ${files.map(f => renderFileItem(f)).join('')}
            </div>
        `;
    }).join('');

    // Auto-select first file
    if (sortedDays.length > 0) {
        const firstFile = days[sortedDays[0]][0];
        if (firstFile) {
            selectFile(firstFile.relative_path, firstFile.obsidian_link);
        }
    }
}

function resetPreview() {
    const headerEl = document.getElementById('preview-header');
    headerEl.innerHTML = '<span class="preview-placeholder">Select a file to preview</span><a id="preview-obsidian-link" href="#" class="preview-link hidden">Open in Obsidian</a>';
    const contentEl = document.getElementById('preview-content');
    contentEl.innerHTML = '<p class="preview-empty">Click a file on the left to see its content here</p>';
    document.getElementById('tasks-panel-title').textContent = 'Tasks';
    document.getElementById('tasks-panel-content').innerHTML = '<p class="empty-state">Select a document to see related tasks</p>';
}

function renderFileItem(f) {
    const isSelected = f.relative_path === selectedFilePath;
    const selectedClass = isSelected ? ' selected' : '';

    let displayName = f.filename;
    if (/^\d{6}-/.test(displayName)) {
        displayName = displayName.substring(7);
    }
    if (displayName.endsWith('.md')) {
        displayName = displayName.slice(0, -3);
    }
    displayName = displayName.replace(/-/g, ' ');

    return `
        <div class="file-item${selectedClass}"
             onclick="selectFile('${escapeAttr(f.relative_path)}', '${escapeAttr(f.obsidian_link)}')"
             data-path="${escapeAttr(f.relative_path)}">
            <div class="file-item-name">${escapeHtml(displayName)}</div>
            <div class="file-item-meta">
                <span class="project-badge project-${f.project}">${f.project}</span>
                <span class="file-item-domain">${f.file_type}</span>
            </div>
        </div>
    `;
}

async function selectFile(relativePath, obsidianLink) {
    selectedFilePath = relativePath;

    document.querySelectorAll('.file-item').forEach(el => {
        if (el.dataset.path === relativePath) {
            el.classList.add('selected');
        } else {
            el.classList.remove('selected');
        }
    });

    const headerEl = document.getElementById('preview-header');
    const filename = relativePath.split('/').pop();
    headerEl.innerHTML = `
        <span class="preview-filename">${escapeHtml(filename)}</span>
        <a href="${escapeAttr(obsidianLink)}" class="preview-link">Open in Obsidian</a>
    `;

    const contentEl = document.getElementById('preview-content');
    contentEl.innerHTML = '<p class="empty-state">Loading...</p>';

    // Fetch content and tasks in parallel
    const contentPromise = fetch(`/api/files/content?path=${encodeURIComponent(relativePath)}`);
    const tasksPromise = loadFolderTasks(relativePath);

    try {
        const res = await contentPromise;
        if (!res.ok) {
            const err = await res.json();
            contentEl.innerHTML = `<p style="color: var(--cs-status-critical);">${escapeHtml(err.error || 'Failed to load')}</p>`;
            return;
        }

        const data = await res.json();
        contentEl.innerHTML = data.html;
        contentEl.scrollTop = 0;
    } catch (err) {
        contentEl.innerHTML = `<p style="color: var(--cs-status-critical);">Error: ${escapeHtml(err.message)}</p>`;
    }

    await tasksPromise;
}

async function loadFolderTasks(documentPath) {
    const titleEl = document.getElementById('tasks-panel-title');
    const contentEl = document.getElementById('tasks-panel-content');

    // Derive context label from document path (folder name)
    const parts = documentPath.split('/');
    const folderName = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    titleEl.textContent = `Tasks -- ${folderName}`;
    contentEl.innerHTML = '<p class="empty-state">Loading...</p>';

    try {
        const res = await fetch(`/api/tasks?folder=${encodeURIComponent(documentPath)}`);
        const tasks = await res.json();

        // Update title with actual context from tasks
        if (tasks.length > 0) {
            const ctx = tasks[0]._project || folderName;
            titleEl.textContent = `Tasks -- ${ctx}`;
        }

        // Filter to non-completed tasks
        const active = tasks.filter(t => t.status !== 'completed');
        if (active.length === 0) {
            contentEl.innerHTML = '<p class="empty-state">No active tasks</p>';
            return;
        }

        // Group by status
        const groups = {};
        const statusOrder = ['in_progress', 'blocked', 'pending'];
        for (const t of active) {
            const s = t.status || 'pending';
            if (!groups[s]) groups[s] = [];
            groups[s].push(t);
        }

        // Sort each group by priority
        const prioWeight = { critical: 0, high: 1, medium: 2, low: 3 };
        for (const arr of Object.values(groups)) {
            arr.sort((a, b) => (prioWeight[a.priority] || 9) - (prioWeight[b.priority] || 9));
        }

        let html = '';
        for (const status of statusOrder) {
            const items = groups[status];
            if (!items || items.length === 0) continue;
            const label = status.replace('_', ' ');
            html += `<div class="task-panel-group-header">${escapeHtml(label)} (${items.length})</div>`;
            for (const t of items) {
                const shortId = `#${t.id}`;
                const dueStr = t.due_date || '';
                const tags = (t.tags || []).slice(0, 2).join(', ');
                html += `
                    <a class="task-panel-item" href="/tasks/${t.id}">
                        <div class="task-panel-item-title">${escapeHtml(t.title)}</div>
                        <div class="task-panel-item-meta">
                            <span class="task-panel-item-id">${escapeHtml(shortId)}</span>
                            <span class="task-panel-status task-panel-status-${t.status}">${escapeHtml(t.priority || '')}</span>
                            ${tags ? `<span class="task-panel-item-tags">${escapeHtml(tags)}</span>` : ''}
                            ${dueStr ? `<span class="task-panel-item-due">${escapeHtml(dueStr)}</span>` : ''}
                        </div>
                    </a>`;
            }
        }

        contentEl.innerHTML = html;
    } catch (err) {
        contentEl.innerHTML = `<p class="empty-state">Failed to load tasks</p>`;
    }
}

function escapeAttr(s) {
    if (!s) return '';
    return s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
