/**
 * dashboard.js -- Day-oriented dashboard with project filtering,
 * document list, content preview, and context-scoped tasks.
 */

let dashData = null;
let selectedDay = null;
let activeProjects = new Set();
let selectedFilePath = null;

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function getDayKey(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
}

document.addEventListener('DOMContentLoaded', () => {
    selectedDay = getTodayKey();
    loadDashboard();
    window.addEventListener('folder-change', loadDashboard);
    window.addEventListener('privacy-change', loadDashboard);
});

async function loadDashboard() {
    const params = getApiParams();

    try {
        const [filesRes, overdueRes] = await Promise.all([
            fetch(`/api/files/recent?${params}&days=3`),
            fetch(`/api/tasks/overdue?${params}`),
        ]);

        const filesData = await filesRes.json();
        const overdue = await overdueRes.json();

        dashData = { filesData, overdue };

        renderDayNav();
        renderProjectBadges();
        renderDocsList();
    } catch (err) {
        console.error('Failed to load dashboard:', err);
    }
}

// -- Day navigation --

function renderDayNav() {
    const nav = document.getElementById('dashboard-day-nav');
    const yesterday = getDayKey(-1);
    const today = getTodayKey();
    const tomorrow = getDayKey(1);

    const days = [
        { key: yesterday, label: 'Yesterday', type: 'past' },
        { key: today, label: 'Today', type: 'today' },
        { key: tomorrow, label: 'Tomorrow', type: 'tomorrow' },
    ];

    const filesPerDay = dashData.filesData.days || {};

    nav.innerHTML = days.map(({ key, label, type }) => {
        const dayFiles = getFilteredDayFiles(key);
        const isActive = selectedDay === key;
        return `<button class="day-badge day-badge-${type}${isActive ? ' active' : ''}"
                    data-day="${key}" onclick="dashSelectDay('${key}')">
            <span class="day-badge-label">${label}</span>
            <span class="day-badge-count">${dayFiles.length}</span>
        </button>`;
    }).join('');

    // Add overdue indicator
    if (dashData.overdue.length > 0) {
        nav.innerHTML += `<button class="day-badge day-badge-overdue${selectedDay === 'overdue' ? ' active' : ''}"
            onclick="dashSelectDay('overdue')">
            <span class="day-badge-label">Overdue</span>
            <span class="day-badge-count">${dashData.overdue.length}</span>
        </button>`;
    }
}

window.dashSelectDay = function(dayKey) {
    selectedDay = dayKey;
    selectedFilePath = null;
    renderDayNav();
    renderProjectBadges();
    renderDocsList();
    resetPreview();
    resetTasks();
};

// -- Project badges --

function renderProjectBadges() {
    const container = document.getElementById('dashboard-project-badges');
    const filesPerDay = dashData.filesData.days || {};
    const dayFiles = filesPerDay[selectedDay] || [];

    // Count per project for this day
    const counts = {};
    for (const f of dayFiles) {
        const p = f.project || 'other';
        counts[p] = (counts[p] || 0) + 1;
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0 && selectedDay !== 'overdue') {
        container.innerHTML = '';
        return;
    }

    // For overdue view, show project badges from overdue tasks
    if (selectedDay === 'overdue') {
        const overdueCounts = {};
        for (const t of dashData.overdue) {
            const p = t.project || 'other';
            overdueCounts[p] = (overdueCounts[p] || 0) + 1;
        }
        const overdueSorted = Object.entries(overdueCounts).sort((a, b) => b[1] - a[1]);
        container.innerHTML = overdueSorted.map(([proj, count]) => {
            const isActive = activeProjects.has(proj);
            return `<button class="day-badge${isActive ? ' active' : ''}"
                        onclick="dashToggleProject('${escapeAttr(proj)}')">
                        <span class="day-badge-label">${escapeHtml(proj)}</span>
                        <span class="day-badge-count">${count}</span>
                    </button>`;
        }).join('');
        return;
    }

    container.innerHTML = sorted.map(([proj, count]) => {
        const isActive = activeProjects.has(proj);
        return `<button class="day-badge${isActive ? ' active' : ''}"
                    onclick="dashToggleProject('${escapeAttr(proj)}')">
                    <span class="day-badge-label">${escapeHtml(proj)}</span>
                    <span class="day-badge-count">${count}</span>
                </button>`;
    }).join('');
}

window.dashToggleProject = function(proj) {
    if (activeProjects.has(proj)) {
        activeProjects.delete(proj);
    } else {
        activeProjects.add(proj);
    }
    renderProjectBadges();
    renderDocsList();
};

// -- Filtered file helpers --

function getFilteredDayFiles(dayKey) {
    const filesPerDay = dashData.filesData.days || {};
    let files = filesPerDay[dayKey] || [];
    if (activeProjects.size > 0) {
        files = files.filter(f => activeProjects.has(f.project));
    }
    return files;
}

// -- Documents list --

function renderDocsList() {
    const container = document.getElementById('dashboard-docs-content');
    const header = document.getElementById('dashboard-docs-header');

    // Overdue mode: show overdue tasks as list
    if (selectedDay === 'overdue') {
        let overdue = dashData.overdue;
        if (activeProjects.size > 0) {
            overdue = overdue.filter(t => activeProjects.has(t.project));
        }
        header.textContent = `Overdue Tasks (${overdue.length})`;
        if (overdue.length === 0) {
            container.innerHTML = '<p class="empty-state">No overdue tasks</p>';
            return;
        }
        container.innerHTML = overdue.map(t => {
            const proj = t.project || '';
            return `
                <a class="file-item" href="/tasks/${t.id}">
                    <div class="file-item-name">${escapeHtml(t.task || t.title)}</div>
                    <div class="file-item-meta">
                        <span class="project-badge project-${proj}">${escapeHtml(proj)}</span>
                        <span class="task-panel-status task-panel-status-blocked">${escapeHtml(t.priority || '')}</span>
                        <span class="dashboard-overdue-days">${t.days_overdue}d overdue</span>
                    </div>
                </a>`;
        }).join('');
        return;
    }

    const dayFiles = getFilteredDayFiles(selectedDay);
    header.textContent = `Documents (${dayFiles.length})`;

    if (dayFiles.length === 0) {
        container.innerHTML = '<p class="empty-state">No documents</p>';
        resetPreview();
        resetTasks();
        return;
    }

    // Group: docs first, then ops
    const docs = dayFiles.filter(f => f.domain !== 'ops');
    const ops = dayFiles.filter(f => f.domain === 'ops');

    let html = '';

    // Documents grouped by project, then threaded
    const docsByProject = groupBy(docs, f => f.project || 'other');
    for (const [proj, files] of sortedEntries(docsByProject)) {
        html += `<div class="day-group">`;
        html += `<div class="day-group-header">
            <div class="day-group-label"><span class="project-badge project-${proj}">${escapeHtml(proj)}</span></div>
            <span class="day-group-count">${files.length}</span>
        </div>`;
        html += renderThreadedFiles(files);
        html += `</div>`;
    }

    // Project updates
    if (ops.length > 0) {
        html += `<div class="day-group">`;
        html += `<div class="day-group-header">
            <div class="day-group-label">Project Updates</div>
            <span class="day-group-count">${ops.length}</span>
        </div>`;
        for (const f of ops) {
            html += renderFileItem(f, true);
        }
        html += `</div>`;
    }

    container.innerHTML = html;

    // Auto-select first file
    const firstFile = docs.length > 0 ? docs[0] : (ops.length > 0 ? ops[0] : null);
    if (firstFile) {
        dashSelectFile(firstFile.relative_path, firstFile.obsidian_link);
    }
}

function renderFileItem(f, isOps, isThreadPrep) {
    const isSelected = f.relative_path === selectedFilePath;
    const selectedClass = isSelected ? ' selected' : '';

    let displayName = f.filename;
    if (/^\d{6}-/.test(displayName)) {
        displayName = displayName.substring(7);
    }
    if (displayName.endsWith('.md')) {
        displayName = displayName.slice(0, -3);
    }
    if (!isOps) {
        displayName = displayName.replace(/-/g, ' ');
    }

    const context = isOps && f.ops_context && f.ops_context !== f.project
        ? `<span class="file-item-context">${escapeHtml(f.ops_context)}</span>` : '';

    // Thread prep: compact single-line label
    if (isThreadPrep) {
        return `
            <div class="file-item file-item-prep${selectedClass}"
                 onclick="dashSelectFile('${escapeAttr(f.relative_path)}', '${escapeAttr(f.obsidian_link)}')"
                 data-path="${escapeAttr(f.relative_path)}">
                <div class="file-item-name"><span class="prep-label">prep</span> ${escapeHtml(displayName)}</div>
            </div>`;
    }

    return `
        <div class="file-item${selectedClass}${isOps ? ' file-item-ops' : ''}"
             onclick="dashSelectFile('${escapeAttr(f.relative_path)}', '${escapeAttr(f.obsidian_link)}')"
             data-path="${escapeAttr(f.relative_path)}">
            <div class="file-item-name">${escapeHtml(displayName)}${context}</div>
            <div class="file-item-meta">
                ${isOps ? `<span class="project-badge project-${f.project}">${escapeHtml(f.project)}</span>` : ''}
                <span class="file-item-domain">${escapeHtml(f.file_type)}</span>
            </div>
        </div>`;
}

// -- File selection: preview + tasks --

window.dashSelectFile = async function(relativePath, obsidianLink) {
    selectedFilePath = relativePath;

    // Update selected state in list
    document.querySelectorAll('#dashboard-docs-content .file-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.path === relativePath);
    });

    // Preview header
    const headerEl = document.getElementById('dashboard-preview-header');
    const filename = relativePath.split('/').pop();
    const folderPath = relativePath.substring(0, relativePath.lastIndexOf('/'));
    const changelogPath = folderPath ? folderPath + '/CHANGELOG.md' : 'CHANGELOG.md';

    headerEl.innerHTML = `
        <span class="preview-filename">${escapeHtml(filename)}</span>
        <span class="preview-header-links">
            <span id="dashboard-changelog-btn"></span>
            <a href="${escapeAttr(obsidianLink)}" class="preview-link">Open in Obsidian</a>
        </span>
    `;

    // Check if CHANGELOG exists, show button if so
    checkChangelog(changelogPath, 'dashboard-changelog-btn', 'dashLoadChangelog');

    // Load content and tasks in parallel
    const contentEl = document.getElementById('dashboard-preview-content');
    contentEl.innerHTML = '<p class="empty-state">Loading...</p>';

    const contentPromise = loadPreview(relativePath, contentEl);
    const tasksPromise = loadTasks(relativePath);
    await Promise.all([contentPromise, tasksPromise]);
};

async function loadPreview(relativePath, contentEl) {
    try {
        const res = await fetch(`/api/files/content?path=${encodeURIComponent(relativePath)}`);
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
}

async function loadTasks(documentPath) {
    const headerEl = document.getElementById('dashboard-tasks-header');
    const contentEl = document.getElementById('dashboard-tasks-content');

    const parts = documentPath.split('/');
    const folderName = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    headerEl.textContent = `Tasks (${folderName})`;
    contentEl.innerHTML = '<p class="empty-state">Loading...</p>';

    try {
        const res = await fetch(`/api/tasks?folder=${encodeURIComponent(documentPath)}`);
        const tasks = await res.json();

        if (tasks.length > 0) {
            const ctx = tasks[0]._project || folderName;
            headerEl.textContent = `Tasks (${ctx})`;
        }

        const open = tasks.filter(t => t.status !== 'completed' && t.status !== 'done');
        headerEl.textContent = `Tasks (${open.length})`;

        if (open.length === 0) {
            contentEl.innerHTML = '<p class="empty-state">No active tasks</p>';
            return;
        }

        const prioOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
        const statusOrder = { in_progress: 0, blocked: 1, pending: 2 };
        open.sort((a, b) => {
            const ps = (prioOrder[a.priority] || 9) - (prioOrder[b.priority] || 9);
            if (ps !== 0) return ps;
            return (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9);
        });

        let html = '<table class="tasks-inline-table"><thead><tr>';
        html += '<th></th><th>ID</th><th>Task</th><th>Priority</th><th>Status</th><th>Due</th><th>Tags</th>';
        html += '</tr></thead><tbody>';

        for (const t of open) {
            const taskTitle = escapeHtml(t.title || t.task || '');
            const dueStr = t.due_display || t.due_date || '';
            const tags = (t.tags || []).join(', ');
            const overdueClass = t.is_overdue ? ' overdue-text' : '';
            const sourceFile = escapeAttr(t._source_file || '');
            html += `<tr>
                <td><button class="task-done-btn" onclick="dashCompleteTask(event, ${t.id}, '${sourceFile}')" title="Mark as done">&#10003;</button></td>
                <td><a href="/tasks/${t.id}" style="color:inherit;text-decoration:none;">#${t.id}</a></td>
                <td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><a href="/tasks/${t.id}" style="color:inherit;text-decoration:none;">${taskTitle}</a></td>
                <td><span class="${getPriorityClass(t.priority)}">${escapeHtml(t.priority || '')}</span></td>
                <td><span class="task-panel-status task-panel-status-${t.status}">${escapeHtml(t.status || '')}</span></td>
                <td class="${overdueClass}" style="white-space:nowrap;">${escapeHtml(dueStr)}</td>
                <td style="font-size:11px;color:var(--cs-on-surface-tertiary);">${escapeHtml(tags)}</td>
            </tr>`;
        }

        html += '</tbody></table>';
        contentEl.innerHTML = html;
    } catch (err) {
        contentEl.innerHTML = '<p class="empty-state">Failed to load tasks</p>';
    }
}

window.dashCompleteTask = async function(event, taskId, sourceFile) {
    event.preventDefault();
    event.stopPropagation();
    if (!confirm(`Mark task #${taskId} as done?`)) return;

    const btn = event.target;
    btn.disabled = true;

    try {
        const res = await fetch(`/api/tasks/${taskId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_file: sourceFile }),
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
            if (selectedFilePath) {
                loadTasks(selectedFilePath);
            }
        } else {
            alert(data.error || 'Failed to complete task');
            btn.disabled = false;
        }
    } catch (err) {
        alert('Failed to complete task: ' + err.message);
        btn.disabled = false;
    }
};

async function checkChangelog(changelogPath, btnContainerId, fnName) {
    const container = document.getElementById(btnContainerId);
    if (!container) return;
    try {
        const res = await fetch(`/api/files/content?path=${encodeURIComponent(changelogPath)}`);
        if (res.ok) {
            container.innerHTML = `<a href="#" class="preview-link" onclick="${fnName}('${changelogPath.replace(/'/g, "\\'")}'); return false;">CHANGELOG</a>`;
        }
    } catch (e) {
        // No changelog -- leave button hidden
    }
}

window.dashLoadChangelog = async function(changelogPath) {
    const contentEl = document.getElementById('dashboard-preview-content');
    contentEl.innerHTML = '<p class="empty-state">Loading history...</p>';

    try {
        const res = await fetch(`/api/files/content?path=${encodeURIComponent(changelogPath)}`);
        if (!res.ok) {
            contentEl.innerHTML = '<p class="empty-state">No history available</p>';
            return;
        }
        const data = await res.json();
        contentEl.innerHTML = data.html;
        contentEl.scrollTop = 0;
    } catch (err) {
        contentEl.innerHTML = '<p class="empty-state">No history available</p>';
    }
};

function resetPreview() {
    document.getElementById('dashboard-preview-header').innerHTML =
        '<span class="preview-placeholder">Select a file to preview</span>';
    document.getElementById('dashboard-preview-content').innerHTML =
        '<p class="preview-empty">Click a document to see its content</p>';
}

function resetTasks() {
    document.getElementById('dashboard-tasks-header').textContent = 'Tasks';
    document.getElementById('dashboard-tasks-content').innerHTML =
        '<p class="empty-state">Select a document to see related tasks</p>';
}

// -- Document threading --

function extractThreadKey(filename) {
    let name = filename;
    // Strip date prefix and .md
    name = name.replace(/^\d{6}-/, '').replace(/\.md$/, '').toLowerCase();
    // Remove preparation prefix
    const isPrep = /^förberedelse-/.test(name) || /^preparation-/.test(name);
    name = name.replace(/^(förberedelse|preparation)-/, '');
    // Remove meeting type words
    name = name.replace(/^(samtal|lunch|möte|meeting|call|daily)-/, '');
    // Tokenize and remove 'tomas'
    const tokens = name.split('-').filter(t => t !== 'tomas' && t.length > 0);
    // Use first 2 tokens as thread key (typically contact name)
    const key = tokens.slice(0, 2).join('-') || name;
    return { key, isPrep };
}

function renderThreadedFiles(files) {
    // Group files into threads by thread key
    const threads = {};
    const threadOrder = [];
    for (const f of files) {
        const { key, isPrep } = extractThreadKey(f.filename);
        if (!threads[key]) {
            threads[key] = { prep: null, main: [] };
            threadOrder.push(key);
        }
        if (isPrep) {
            threads[key].prep = f;
        } else {
            threads[key].main.push(f);
        }
    }

    let html = '';
    for (const key of threadOrder) {
        const thread = threads[key];
        const hasThread = thread.prep && thread.main.length > 0;

        if (hasThread) {
            // Render as a combined thread
            html += `<div class="doc-thread">`;
            html += `<div class="doc-thread-prep">`;
            html += renderFileItem(thread.prep, false, true);
            html += `</div>`;
            for (const f of thread.main) {
                html += renderFileItem(f);
            }
            html += `</div>`;
        } else {
            // Standalone files
            if (thread.prep) {
                html += renderFileItem(thread.prep);
            }
            for (const f of thread.main) {
                html += renderFileItem(f);
            }
        }
    }
    return html;
}

// -- Helpers --

function groupBy(arr, keyFn) {
    const map = {};
    for (const item of arr) {
        const key = keyFn(item);
        if (!map[key]) map[key] = [];
        map[key].push(item);
    }
    return map;
}

function sortedEntries(obj) {
    return Object.entries(obj).sort((a, b) => b[1].length - a[1].length);
}

function escapeAttr(s) {
    if (!s) return '';
    return s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
