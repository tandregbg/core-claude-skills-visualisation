/**
 * dashboard.js -- Day-oriented overview: today/yesterday/tomorrow
 * Shows documents, project updates, and tasks for each day.
 */

let dashboardData = null;

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function getDayKey(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
}

document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    window.addEventListener('folder-change', loadDashboard);
    window.addEventListener('privacy-change', loadDashboard);
});

async function loadDashboard() {
    const params = getApiParams();
    const content = document.getElementById('dashboard-content');
    content.innerHTML = '<p class="empty-state">Loading...</p>';

    try {
        const [filesRes, tasksRes, overdueRes, statsRes] = await Promise.all([
            fetch(`/api/files/recent?${params}&days=3`),
            fetch(`/api/tasks?${params}`),
            fetch(`/api/tasks/overdue?${params}`),
            fetch(`/api/tasks/stats?${params}`),
        ]);

        const filesData = await filesRes.json();
        const tasks = await tasksRes.json();
        const overdue = await overdueRes.json();
        const stats = await statsRes.json();

        dashboardData = { filesData, tasks, overdue, stats };

        renderDayNav();
        renderDayOverviews();
    } catch (err) {
        console.error('Failed to load dashboard:', err);
        content.innerHTML = '<p class="empty-state">Failed to load dashboard</p>';
    }
}

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

    const filesPerDay = dashboardData.filesData.days || {};

    nav.innerHTML = days.map(({ key, label, type }) => {
        const count = (filesPerDay[key] || []).length;
        return `<button class="day-badge day-badge-${type}" data-day="${key}" disabled>
            <span class="day-badge-label">${label}</span>
            <span class="day-badge-count">${count}</span>
        </button>`;
    }).join('');
}

function renderDayOverviews() {
    const content = document.getElementById('dashboard-content');
    const yesterday = getDayKey(-1);
    const today = getTodayKey();
    const tomorrow = getDayKey(1);

    const days = [
        { key: today, label: 'Today', type: 'today' },
        { key: yesterday, label: 'Yesterday', type: 'past' },
        { key: tomorrow, label: 'Tomorrow', type: 'tomorrow' },
    ];

    let html = '';
    for (const day of days) {
        html += renderDaySection(day);
    }

    // Overdue tasks section
    if (dashboardData.overdue.length > 0) {
        html += renderOverdueSection();
    }

    content.innerHTML = html;
}

function renderDaySection({ key, label, type }) {
    const filesPerDay = dashboardData.filesData.days || {};
    const dayFiles = filesPerDay[key] || [];
    const tasks = dashboardData.tasks || [];

    // Tasks due this day
    const dueTasks = tasks.filter(t => t.due_date === key && t.status !== 'completed');
    // Tasks completed this day
    const completedTasks = tasks.filter(t => t.completed_date === key);

    const hasContent = dayFiles.length > 0 || dueTasks.length > 0 || completedTasks.length > 0;

    // Group files by type
    const docs = dayFiles.filter(f => f.domain !== 'ops');
    const ops = dayFiles.filter(f => f.domain === 'ops');

    // Group docs by project
    const docsByProject = {};
    for (const f of docs) {
        const proj = f.project || 'other';
        if (!docsByProject[proj]) docsByProject[proj] = [];
        docsByProject[proj].push(f);
    }

    // Group ops by project
    const opsByProject = {};
    for (const f of ops) {
        const proj = f.project || 'other';
        if (!opsByProject[proj]) opsByProject[proj] = [];
        opsByProject[proj].push(f);
    }

    let inner = '';

    if (!hasContent) {
        inner = `<p class="empty-state">No activity</p>`;
    } else {
        // Documents section
        if (docs.length > 0) {
            inner += '<div class="dashboard-subsection">';
            inner += `<div class="dashboard-subsection-header">Documents <span class="day-badge-count">${docs.length}</span></div>`;
            for (const [proj, files] of Object.entries(docsByProject).sort()) {
                inner += `<div class="dashboard-project-group">`;
                inner += `<span class="project-badge project-${proj}">${escapeHtml(proj)}</span>`;
                for (const f of files) {
                    inner += renderDashboardFile(f);
                }
                inner += `</div>`;
            }
            inner += '</div>';
        }

        // Project updates section
        if (ops.length > 0) {
            inner += '<div class="dashboard-subsection">';
            inner += `<div class="dashboard-subsection-header">Project Updates <span class="day-badge-count">${ops.length}</span></div>`;
            for (const [proj, files] of Object.entries(opsByProject).sort()) {
                inner += `<div class="dashboard-project-group">`;
                inner += `<span class="project-badge project-${proj}">${escapeHtml(proj)}</span>`;
                for (const f of files) {
                    const context = f.ops_context && f.ops_context !== proj ? f.ops_context : '';
                    const contextStr = context ? `<span class="file-item-context">${escapeHtml(context)}</span>` : '';
                    inner += `<a class="dashboard-file-link" href="${escapeHtml(f.obsidian_link)}">${escapeHtml(f.filename)}${contextStr}</a>`;
                }
                inner += `</div>`;
            }
            inner += '</div>';
        }

        // Due tasks
        if (dueTasks.length > 0) {
            inner += '<div class="dashboard-subsection">';
            inner += `<div class="dashboard-subsection-header">Tasks Due <span class="day-badge-count">${dueTasks.length}</span></div>`;
            for (const t of dueTasks) {
                inner += renderDashboardTask(t);
            }
            inner += '</div>';
        }

        // Completed tasks
        if (completedTasks.length > 0) {
            inner += '<div class="dashboard-subsection">';
            inner += `<div class="dashboard-subsection-header">Completed <span class="day-badge-count">${completedTasks.length}</span></div>`;
            for (const t of completedTasks) {
                inner += renderDashboardTask(t, true);
            }
            inner += '</div>';
        }
    }

    return `
        <div class="dashboard-day-section dashboard-day-${type}">
            <div class="dashboard-day-header">
                <span class="dashboard-day-label">${label}</span>
                <span class="dashboard-day-date">${key}</span>
            </div>
            <div class="dashboard-day-content">
                ${inner}
            </div>
        </div>`;
}

function renderDashboardFile(f) {
    let displayName = f.filename;
    if (/^\d{6}-/.test(displayName)) {
        displayName = displayName.substring(7);
    }
    if (displayName.endsWith('.md')) {
        displayName = displayName.slice(0, -3);
    }
    displayName = displayName.replace(/-/g, ' ');

    return `<a class="dashboard-file-link" href="/documents" title="${escapeHtml(f.relative_path)}">${escapeHtml(displayName)}</a>`;
}

function renderDashboardTask(t, completed) {
    const displayId = `#${t.id}`;
    const statusClass = completed ? 'completed' : t.status;
    return `
        <a class="dashboard-task" href="/tasks/${t.id}">
            <span class="task-panel-status task-panel-status-${statusClass}">${escapeHtml(t.priority || '')}</span>
            <span class="dashboard-task-title">${escapeHtml(t.title)}</span>
            <span class="dashboard-task-id">${escapeHtml(displayId)}</span>
            <span class="project-badge project-${t._project || t.project}">${escapeHtml(t._project || t.project || '')}</span>
        </a>`;
}

function renderOverdueSection() {
    const overdue = dashboardData.overdue;
    let html = `
        <div class="dashboard-day-section dashboard-day-overdue">
            <div class="dashboard-day-header">
                <span class="dashboard-day-label">Overdue</span>
                <span class="day-badge-count">${overdue.length}</span>
            </div>
            <div class="dashboard-day-content">`;

    for (const t of overdue) {
        const displayId = `#${t.id}`;
        html += `
            <a class="dashboard-task" href="/tasks/${t.id}">
                <span class="task-panel-status task-panel-status-blocked">${escapeHtml(t.priority || '')}</span>
                <span class="dashboard-task-title">${escapeHtml(t.task || t.title)}</span>
                <span class="dashboard-task-id">${escapeHtml(displayId)}</span>
                <span class="project-badge project-${t.project}">${escapeHtml(t.project || '')}</span>
                <span class="dashboard-overdue-days">${t.days_overdue}d overdue</span>
            </a>`;
    }

    html += '</div></div>';
    return html;
}
