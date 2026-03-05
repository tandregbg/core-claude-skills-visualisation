/**
 * dashboard.js -- Day-oriented overview with documents, tasks, and project status
 */

let dashData = null;
let selectedDay = null;

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
        const [filesRes, tasksRes, overdueRes] = await Promise.all([
            fetch(`/api/files/recent?${params}&days=3`),
            fetch(`/api/tasks?${params}`),
            fetch(`/api/tasks/overdue?${params}`),
        ]);

        const filesData = await filesRes.json();
        const tasks = await tasksRes.json();
        const overdue = await overdueRes.json();

        dashData = { filesData, tasks, overdue };

        renderDayNav();
        renderAll();
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
        const count = (filesPerDay[key] || []).length;
        const isActive = selectedDay === key;
        return `<button class="day-badge day-badge-${type}${isActive ? ' active' : ''}"
                    data-day="${key}" onclick="selectDay('${key}')">
            <span class="day-badge-label">${label}</span>
            <span class="day-badge-count">${count}</span>
        </button>`;
    }).join('');
}

window.selectDay = function(dayKey) {
    selectedDay = dayKey;
    document.querySelectorAll('#dashboard-day-nav .day-badge').forEach(el => {
        el.classList.toggle('active', el.dataset.day === dayKey);
    });
    renderAll();
};

function renderAll() {
    renderDocsColumn();
    renderTasksColumn();
    renderProjectsColumn();
}

// -- Documents column --

function renderDocsColumn() {
    const container = document.getElementById('dashboard-docs-content');
    const header = container.parentElement.querySelector('.dashboard-col-header');
    const filesPerDay = dashData.filesData.days || {};
    const dayFiles = filesPerDay[selectedDay] || [];

    const docs = dayFiles.filter(f => f.domain !== 'ops');
    const ops = dayFiles.filter(f => f.domain === 'ops');

    header.textContent = `Documents (${dayFiles.length})`;

    if (dayFiles.length === 0) {
        container.innerHTML = '<p class="empty-state">No documents</p>';
        return;
    }

    let html = '';

    // Documents grouped by project
    if (docs.length > 0) {
        const byProject = groupBy(docs, f => f.project || 'other');
        for (const [proj, files] of sortedEntries(byProject)) {
            html += `<div class="dashboard-group">`;
            html += `<div class="dashboard-group-header"><span class="project-badge project-${proj}">${escapeHtml(proj)}</span></div>`;
            for (const f of files) {
                html += renderDocItem(f);
            }
            html += `</div>`;
        }
    }

    // Project updates
    if (ops.length > 0) {
        html += `<div class="dashboard-group">`;
        html += `<div class="dashboard-group-header dashboard-group-label">Project Updates</div>`;
        const byProject = groupBy(ops, f => f.project || 'other');
        for (const [proj, files] of sortedEntries(byProject)) {
            html += `<span class="project-badge project-${proj}" style="margin-left:8px;">${escapeHtml(proj)}</span>`;
            for (const f of files) {
                const context = f.ops_context && f.ops_context !== proj ? ` (${f.ops_context})` : '';
                html += `<a class="dashboard-item dashboard-item-ops" href="${escapeHtml(f.obsidian_link)}">${escapeHtml(f.filename)}${context ? `<span class="file-item-context">${escapeHtml(context)}</span>` : ''}</a>`;
            }
        }
        html += `</div>`;
    }

    container.innerHTML = html;
}

function renderDocItem(f) {
    let name = f.filename;
    if (/^\d{6}-/.test(name)) name = name.substring(7);
    if (name.endsWith('.md')) name = name.slice(0, -3);
    name = name.replace(/-/g, ' ');

    return `<a class="dashboard-item" href="/documents" title="${escapeHtml(f.relative_path)}">${escapeHtml(name)}<span class="dashboard-item-type">${escapeHtml(f.file_type)}</span></a>`;
}

// -- Tasks column --

function renderTasksColumn() {
    const container = document.getElementById('dashboard-tasks-content');
    const header = container.parentElement.querySelector('.dashboard-col-header');
    const tasks = dashData.tasks || [];
    const overdue = dashData.overdue || [];

    // Tasks due on selected day
    const dueTasks = tasks.filter(t => t.due_date === selectedDay && t.status !== 'completed');
    // In progress tasks
    const inProgress = tasks.filter(t => t.status === 'in_progress');
    // Blocked
    const blocked = tasks.filter(t => t.status === 'blocked');
    // Completed on selected day
    const completed = tasks.filter(t => t.completed_date === selectedDay);

    const totalShown = dueTasks.length + inProgress.length + blocked.length + overdue.length;
    header.textContent = `Tasks (${totalShown})`;

    let html = '';

    if (overdue.length > 0) {
        html += renderTaskGroup('Overdue', overdue, 'overdue');
    }

    if (dueTasks.length > 0) {
        html += renderTaskGroup('Due', dueTasks, 'due');
    }

    if (inProgress.length > 0) {
        html += renderTaskGroup('In Progress', inProgress, 'in_progress');
    }

    if (blocked.length > 0) {
        html += renderTaskGroup('Blocked', blocked, 'blocked');
    }

    if (completed.length > 0) {
        html += renderTaskGroup('Completed', completed, 'completed');
    }

    if (!html) {
        html = '<p class="empty-state">No tasks</p>';
    }

    container.innerHTML = html;
}

function renderTaskGroup(label, tasks, type) {
    let html = `<div class="dashboard-group">`;
    html += `<div class="dashboard-group-header dashboard-group-label">${label} <span class="day-badge-count">${tasks.length}</span></div>`;
    for (const t of tasks) {
        const proj = t._project || t.project || '';
        const title = t.task || t.title || '';
        const daysOverdue = t.days_overdue ? `<span class="dashboard-overdue-days">${t.days_overdue}d</span>` : '';
        html += `
            <a class="dashboard-item dashboard-task-item" href="/tasks/${t.id}">
                <span class="task-panel-status task-panel-status-${type === 'overdue' ? 'blocked' : t.status}">${escapeHtml(t.priority || '')}</span>
                <span class="dashboard-task-title">${escapeHtml(title)}</span>
                ${daysOverdue}
                <span class="project-badge project-${proj}">${escapeHtml(proj)}</span>
            </a>`;
    }
    html += `</div>`;
    return html;
}

// -- Projects column --

function renderProjectsColumn() {
    const container = document.getElementById('dashboard-projects-content');
    const header = container.parentElement.querySelector('.dashboard-col-header');
    const tasks = dashData.tasks || [];
    const filesPerDay = dashData.filesData.days || {};
    const dayFiles = filesPerDay[selectedDay] || [];

    // Collect projects with activity today or active tasks
    const projectStats = {};

    // Count files per project for this day
    for (const f of dayFiles) {
        const proj = f.project || 'other';
        if (!projectStats[proj]) projectStats[proj] = { files: 0, in_progress: 0, blocked: 0, pending: 0, overdue: 0 };
        projectStats[proj].files++;
    }

    // Count tasks per project (only active)
    for (const t of tasks) {
        if (t.status === 'completed') continue;
        const proj = t._project || t.project || 'unknown';
        if (!projectStats[proj]) projectStats[proj] = { files: 0, in_progress: 0, blocked: 0, pending: 0, overdue: 0 };
        const s = t.status || 'pending';
        if (projectStats[proj][s] !== undefined) {
            projectStats[proj][s]++;
        }
    }

    // Count overdue per project
    for (const t of (dashData.overdue || [])) {
        const proj = t.project || 'unknown';
        if (!projectStats[proj]) projectStats[proj] = { files: 0, in_progress: 0, blocked: 0, pending: 0, overdue: 0 };
        projectStats[proj].overdue++;
    }

    // Sort: projects with today's files first, then by total active tasks
    const sorted = Object.entries(projectStats).sort((a, b) => {
        // Files today first
        if (b[1].files !== a[1].files) return b[1].files - a[1].files;
        // Then by total active
        const aTotal = a[1].in_progress + a[1].blocked + a[1].pending;
        const bTotal = b[1].in_progress + b[1].blocked + b[1].pending;
        return bTotal - aTotal;
    });

    // Only show projects with activity today or active tasks
    const activeProjects = sorted.filter(([_, s]) =>
        s.files > 0 || s.in_progress > 0 || s.blocked > 0 || s.overdue > 0
    );

    header.textContent = `Projects (${activeProjects.length})`;

    if (activeProjects.length === 0) {
        container.innerHTML = '<p class="empty-state">No active projects</p>';
        return;
    }

    let html = '';
    for (const [proj, stats] of activeProjects) {
        html += `<div class="dashboard-project-card">`;
        html += `<div class="dashboard-project-card-header"><span class="project-badge project-${proj}">${escapeHtml(proj)}</span>`;
        if (stats.files > 0) {
            html += `<span class="dashboard-project-stat">${stats.files} docs</span>`;
        }
        html += `</div>`;

        // Task summary bar
        const parts = [];
        if (stats.in_progress > 0) parts.push(`<span class="task-panel-status task-panel-status-in_progress">${stats.in_progress} active</span>`);
        if (stats.blocked > 0) parts.push(`<span class="task-panel-status task-panel-status-blocked">${stats.blocked} blocked</span>`);
        if (stats.overdue > 0) parts.push(`<span class="dashboard-overdue-days">${stats.overdue} overdue</span>`);
        if (stats.pending > 0) parts.push(`<span class="dashboard-project-stat">${stats.pending} pending</span>`);

        if (parts.length > 0) {
            html += `<div class="dashboard-project-card-stats">${parts.join(' ')}</div>`;
        }

        html += `</div>`;
    }

    container.innerHTML = html;
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
