/**
 * task-board.js -- Task overview with summary dashboard, project drill-in,
 * owner filtering, and smart views (CR-005).
 */

let currentView = 'kanban';
let currentDetailView = 'summary'; // 'summary' | 'detail'
let allTasks = [];
let detailTasks = [];
let currentSort = { field: 'priority', dir: 'asc' };
let selectedStatus = null;
let selectedPriority = null;
let selectedOwner = null;
let globalOwnerFilter = '';  // from owner-select dropdown
let myName = 'Tomas';
let currentProject = null; // null = all, string = specific project
let smartViewMode = null; // null, 'p0', 'blocked', 'overdue', 'my'

const STATUS_ORDER = ['pending', 'in_progress', 'blocked', 'completed'];
const STATUS_LABELS = {
    pending: 'Pending',
    in_progress: 'In Progress',
    blocked: 'Blocked',
    completed: 'Completed',
};

const PRIORITY_ORDER = ['P0', 'P1', 'P2', 'P3'];
const PRIORITY_LABELS = {
    P0: 'P0 Critical',
    P1: 'P1 High',
    P2: 'P2 Important',
    P3: 'P3 Research',
};

document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    initViewToggle();
    initTagFilter();
    initTableSort();
    initOwnerSelect();
    loadSummary();
    window.addEventListener('folder-change', loadSummary);
    window.addEventListener('privacy-change', loadSummary);
});

// ---- Config ----

async function loadConfig() {
    try {
        const res = await fetch('/api/tasks/config');
        const cfg = await res.json();
        myName = cfg.my_name || 'Tomas';
    } catch (e) {
        // fallback
    }
}

// ---- Owner select dropdown ----

async function initOwnerSelect() {
    const select = document.getElementById('owner-select');
    if (!select) return;

    try {
        const res = await fetch('/api/tasks/owners');
        const owners = await res.json();

        let html = '<option value="">All Tasks</option>';
        html += `<option value="${myName}">My Tasks (${myName})</option>`;
        for (const o of owners) {
            if (o.name === myName || o.name === 'Unassigned') continue;
            html += `<option value="${o.name}">${o.name} (${o.active})</option>`;
        }
        const unassigned = owners.find(o => o.name === 'Unassigned');
        if (unassigned) {
            html += `<option value="Unassigned">Unassigned (${unassigned.active})</option>`;
        }
        select.innerHTML = html;
    } catch (e) {
        // keep default
    }

    select.addEventListener('change', () => {
        globalOwnerFilter = select.value;
        loadSummary();
    });
}

// ---- Summary dashboard ----

async function loadSummary() {
    const params = getApiParams();
    const ownerParam = globalOwnerFilter || myName;

    try {
        const [summaryRes, statsRes] = await Promise.all([
            fetch(`/api/tasks/summary?${params}&owner=${encodeURIComponent(ownerParam)}`),
            fetch(`/api/tasks/stats?${params}`),
        ]);
        const summary = await summaryRes.json();
        const stats = await statsRes.json();

        renderGlobalStats(stats, summary);
        renderProjectCards(summary);

        // Update title
        const title = document.getElementById('summary-title');
        if (title) {
            title.textContent = globalOwnerFilter
                ? `Tasks -- ${globalOwnerFilter}`
                : 'Tasks';
        }
    } catch (err) {
        console.error('Failed to load summary:', err);
    }
}

function renderGlobalStats(stats, summary) {
    const active = stats.total_active || 0;
    const p0 = (stats.priority_counts || {}).P0 || 0;
    const p1 = (stats.priority_counts || {}).P1 || 0;
    const blocked = (stats.status_counts || {}).blocked || 0;
    const overdue = stats.overdue_count || 0;
    const doneWeek = stats.completed_this_week || 0;

    // If owner filter, recalculate from summary
    if (globalOwnerFilter) {
        let myActive = 0, myP0 = 0, myBlocked = 0, myOverdue = 0;
        for (const p of summary) {
            myActive += p.my_count || 0;
        }
        document.getElementById('stat-active').textContent = myActive;
    } else {
        document.getElementById('stat-active').textContent = active;
    }

    document.getElementById('stat-p0').textContent = p0;
    document.getElementById('stat-p1').textContent = p1;
    document.getElementById('stat-blocked').textContent = blocked;
    document.getElementById('stat-overdue').textContent = overdue;
    document.getElementById('stat-done-week').textContent = doneWeek;

    // Highlight P0 and overdue if > 0
    const p0Chip = document.querySelector('.stat-chip.stat-p0');
    const overdueChip = document.querySelector('.stat-chip.stat-overdue');
    const blockedChip = document.querySelector('.stat-chip.stat-blocked');
    if (p0Chip) p0Chip.classList.toggle('stat-alert', p0 > 0);
    if (overdueChip) overdueChip.classList.toggle('stat-alert', overdue > 0);
    if (blockedChip) blockedChip.classList.toggle('stat-alert', blocked > 0);
}

function renderProjectCards(summary) {
    const container = document.getElementById('project-cards');
    if (!container) return;

    if (summary.length === 0) {
        container.innerHTML = '<div class="empty-state">No projects with tasks found</div>';
        return;
    }

    // Filter to projects with active tasks (or show all if owner filter applied)
    const projects = summary.filter(p => p.active > 0 || p.completed_week > 0);

    container.innerHTML = projects.map(p => {
        const alertClass = p.p0 > 0 ? ' card-has-p0' : '';
        const blockedBadge = p.blocked > 0
            ? `<span class="card-stat card-stat-blocked">${p.blocked} blocked</span>` : '';
        const p0Badge = p.p0 > 0
            ? `<span class="card-stat card-stat-p0">${p.p0} P0</span>` : '';
        const overdueBadge = p.overdue > 0
            ? `<span class="card-stat card-stat-overdue">${p.overdue} overdue</span>` : '';
        const myBadge = p.my_count > 0
            ? `<span class="card-stat card-stat-my">${p.my_count} mine</span>` : '';
        const doneWeek = p.completed_week > 0
            ? `<span class="card-stat card-stat-done">${p.completed_week} done</span>` : '';

        return `
        <div class="project-task-card${alertClass}" onclick="drillIntoProject('${p.project}')">
            <div class="project-card-header">
                <span class="project-card-name">${p.project}</span>
                <span class="project-card-count">${p.active}</span>
            </div>
            <div class="project-card-stats">
                ${p0Badge}${blockedBadge}${overdueBadge}${myBadge}${doneWeek}
            </div>
        </div>`;
    }).join('');
}

// ---- Smart views ----

function openSmartView(mode) {
    smartViewMode = mode;
    currentProject = null;

    const titles = {
        p0: 'All P0 Tasks',
        blocked: 'All Blocked Tasks',
        overdue: 'All Overdue Tasks',
        my: `My Tasks (${myName})`,
    };

    document.getElementById('detail-title').textContent = titles[mode] || 'Tasks';
    showDetailView();
    loadDetailTasks();
}

function drillIntoProject(project) {
    smartViewMode = null;
    currentProject = project;
    document.getElementById('detail-title').textContent = project;
    showDetailView();
    loadDetailTasks();
}

function backToSummary() {
    smartViewMode = null;
    currentProject = null;
    selectedStatus = null;
    selectedPriority = null;
    selectedOwner = null;
    document.getElementById('summary-view').classList.remove('hidden');
    document.getElementById('detail-view').classList.add('hidden');
    currentDetailView = 'summary';
    loadSummary();
}

function showDetailView() {
    document.getElementById('summary-view').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
    currentDetailView = 'detail';
    selectedStatus = null;
    selectedPriority = null;
    selectedOwner = null;
}

// ---- Detail view data loading ----

async function loadDetailTasks() {
    const params = getApiParams();
    let url = `/api/tasks?${params}&hide_completed=true`;

    if (currentProject) {
        // Override project param for drill-in
        const p = new URLSearchParams(params.toString());
        p.set('project', currentProject);
        url = `/api/tasks?${p}&hide_completed=true`;
    }

    if (smartViewMode === 'my') {
        url += `&owner=${encodeURIComponent(myName)}`;
    }

    try {
        const res = await fetch(url);
        allTasks = await res.json();

        // Apply smart view filters
        if (smartViewMode === 'p0') {
            allTasks = allTasks.filter(t => t.priority === 'P0');
        } else if (smartViewMode === 'blocked') {
            allTasks = allTasks.filter(t => t.status === 'blocked');
        } else if (smartViewMode === 'overdue') {
            allTasks = allTasks.filter(t => t.is_overdue);
        }

        renderOwnerBadges();
        renderStatusBadges();
        renderPriorityBadges();

        if (currentView === 'kanban') {
            renderKanban(allTasks);
        } else {
            renderTable();
        }
    } catch (err) {
        console.error('Failed to load detail tasks:', err);
    }
}

// ---- Owner badges ----

function renderOwnerBadges() {
    const container = document.getElementById('owner-badges');
    if (!container) return;

    const counts = {};
    allTasks.forEach(t => {
        const owners = t._owners || [];
        if (owners.length === 0) {
            counts['Unassigned'] = (counts['Unassigned'] || 0) + 1;
        } else {
            owners.forEach(o => { counts[o] = (counts[o] || 0) + 1; });
        }
    });

    const total = allTasks.length;
    const allActive = selectedOwner === null ? ' active' : '';
    let html = `<button class="day-badge day-badge-all${allActive}" onclick="filterByOwner(null)">All <span class="day-badge-count">${total}</span></button>`;

    // Sort by count desc, but put myName first
    const sorted = Object.entries(counts).sort((a, b) => {
        if (a[0] === myName) return -1;
        if (b[0] === myName) return 1;
        return b[1] - a[1];
    });

    for (const [owner, count] of sorted) {
        const isActive = selectedOwner === owner ? ' active' : '';
        const isMe = owner === myName ? ' day-badge-my' : '';
        html += `<button class="day-badge day-badge-owner${isMe}${isActive}" onclick="filterByOwner('${owner}')" data-owner="${owner}">
            <span class="day-badge-label">${owner}</span>
            <span class="day-badge-count">${count}</span>
        </button>`;
    }

    container.innerHTML = html;
}

function filterByOwner(owner) {
    selectedOwner = owner;
    document.querySelectorAll('#owner-badges .day-badge').forEach(el => el.classList.remove('active'));
    if (owner === null) {
        document.querySelector('#owner-badges .day-badge-all').classList.add('active');
    } else {
        const badge = document.querySelector(`#owner-badges .day-badge[data-owner="${owner}"]`);
        if (badge) badge.classList.add('active');
    }
    applyFilters();
}

// ---- Status badges ----

function renderStatusBadges() {
    const container = document.getElementById('status-badges');
    if (!container) return;

    const counts = {};
    STATUS_ORDER.forEach(s => { counts[s] = 0; });
    allTasks.forEach(t => {
        const s = t.status || 'pending';
        if (counts[s] !== undefined) counts[s]++;
        else counts.pending++;
    });

    const total = allTasks.length;
    const allActive = selectedStatus === null ? ' active' : '';
    let html = `<button class="day-badge day-badge-all${allActive}" onclick="filterByStatus(null)">All <span class="day-badge-count">${total}</span></button>`;

    STATUS_ORDER.forEach(status => {
        const count = counts[status];
        if (count === 0 && status !== 'blocked') return;
        const label = STATUS_LABELS[status];
        const isActive = selectedStatus === status ? ' active' : '';
        html += `<button class="day-badge day-badge-status-${status}${isActive}" onclick="filterByStatus('${status}')" data-status="${status}">
            <span class="day-badge-label">${label}</span>
            <span class="day-badge-count">${count}</span>
        </button>`;
    });

    container.innerHTML = html;
}

function filterByStatus(status) {
    selectedStatus = status;
    document.querySelectorAll('#status-badges .day-badge').forEach(el => el.classList.remove('active'));
    if (status === null) {
        document.querySelector('#status-badges .day-badge-all').classList.add('active');
    } else {
        const badge = document.querySelector(`#status-badges .day-badge[data-status="${status}"]`);
        if (badge) badge.classList.add('active');
    }
    applyFilters();
}

// ---- Priority badges ----

function renderPriorityBadges() {
    const container = document.getElementById('priority-badges');
    if (!container) return;

    const counts = {};
    PRIORITY_ORDER.forEach(p => { counts[p] = 0; });
    allTasks.forEach(t => {
        const p = t.priority || 'P3';
        if (counts[p] !== undefined) counts[p]++;
        else counts.P3++;
    });

    const allActive = selectedPriority === null ? ' active' : '';
    let html = `<button class="day-badge day-badge-all${allActive}" onclick="filterByPriority(null)">All <span class="day-badge-count">${allTasks.length}</span></button>`;

    PRIORITY_ORDER.forEach(priority => {
        const count = counts[priority];
        if (count === 0) return;
        const label = PRIORITY_LABELS[priority];
        const isActive = selectedPriority === priority ? ' active' : '';
        html += `<button class="day-badge day-badge-priority-${priority.toLowerCase()}${isActive}" onclick="filterByPriority('${priority}')" data-priority="${priority}">
            <span class="day-badge-label">${label}</span>
            <span class="day-badge-count">${count}</span>
        </button>`;
    });

    container.innerHTML = html;
}

function filterByPriority(priority) {
    selectedPriority = priority;
    document.querySelectorAll('#priority-badges .day-badge').forEach(el => el.classList.remove('active'));
    if (priority === null) {
        document.querySelector('#priority-badges .day-badge-all').classList.add('active');
    } else {
        const badge = document.querySelector(`#priority-badges .day-badge[data-priority="${priority}"]`);
        if (badge) badge.classList.add('active');
    }
    applyFilters();
}

// ---- Combined filters ----

function initTagFilter() {
    const tagFilter = document.getElementById('filter-tags');
    if (tagFilter) tagFilter.addEventListener('input', applyFilters);
}

function getFilteredTasks(tasks) {
    const tagFilter = document.getElementById('filter-tags');
    let filtered = tasks;

    if (selectedOwner !== null) {
        filtered = filtered.filter(t => {
            const owners = t._owners || [];
            if (selectedOwner === 'Unassigned') return owners.length === 0;
            return owners.some(o => o === selectedOwner);
        });
    }

    if (selectedStatus !== null) {
        filtered = filtered.filter(t => (t.status || 'pending') === selectedStatus);
    }

    if (selectedPriority !== null) {
        filtered = filtered.filter(t => (t.priority || 'P3') === selectedPriority);
    }

    if (tagFilter && tagFilter.value.trim()) {
        const tag = tagFilter.value.trim().toLowerCase();
        filtered = filtered.filter(t =>
            (t.tags || []).some(tt => tt.toLowerCase().includes(tag))
        );
    }

    return filtered;
}

function applyFilters() {
    if (currentView === 'kanban') {
        renderKanban(allTasks);
    } else {
        renderTable();
    }
}

// ---- View toggle ----

function initViewToggle() {
    const kanbanBtn = document.getElementById('view-kanban');
    const tableBtn = document.getElementById('view-table');
    if (!kanbanBtn || !tableBtn) return;

    kanbanBtn.addEventListener('click', () => {
        currentView = 'kanban';
        kanbanBtn.className = 'btn btn-primary btn-sm';
        tableBtn.className = 'btn btn-secondary btn-sm';
        document.getElementById('kanban-board').classList.remove('hidden');
        document.getElementById('table-view').classList.add('hidden');
        applyFilters();
    });

    tableBtn.addEventListener('click', () => {
        currentView = 'table';
        tableBtn.className = 'btn btn-primary btn-sm';
        kanbanBtn.className = 'btn btn-secondary btn-sm';
        document.getElementById('kanban-board').classList.add('hidden');
        document.getElementById('table-view').classList.remove('hidden');
        renderTable();
    });
}

// ---- Kanban rendering ----

function renderKanban(tasks) {
    const groups = { pending: [], in_progress: [], blocked: [], completed: [] };
    const source = Array.isArray(tasks) ? tasks : [];
    for (const t of source) {
        const s = t.status || 'pending';
        if (groups[s]) groups[s].push(t);
        else groups.pending.push(t);
    }

    for (const [status, statusTasks] of Object.entries(groups)) {
        const col = document.getElementById(`col-${status}`);
        const count = document.getElementById(`count-${status}`);
        if (!col) continue;

        const filtered = getFilteredTasks(statusTasks);
        if (count) count.textContent = filtered.length;

        if (filtered.length === 0) {
            col.innerHTML = '<div class="empty-state" style="text-align: center; padding: 24px 0;">No tasks</div>';
            continue;
        }

        col.innerHTML = filtered.map(t => renderCard(t)).join('');
    }

    if (selectedStatus !== null) {
        STATUS_ORDER.forEach(s => {
            const col = document.getElementById(`col-${s}`);
            if (!col) return;
            const column = col.closest('.kanban-column');
            if (!column) return;
            column.classList.toggle('hidden', s !== selectedStatus);
        });
    } else {
        STATUS_ORDER.forEach(s => {
            const col = document.getElementById(`col-${s}`);
            if (!col) return;
            const column = col.closest('.kanban-column');
            if (column) column.classList.remove('hidden');
        });
    }
}

function renderCard(t) {
    const priorityClass = (t.priority || 'P3').toLowerCase();
    const overdueClass = t.is_overdue ? ' card-overdue' : '';
    const dueHtml = t.due_display
        ? `<span class="${t.is_overdue ? 'overdue-text' : ''}">${t.due_display}</span>`
        : '';
    const projectBadge = !currentProject
        ? `<span class="project-badge project-badge-${(t._project || '').replace(/[^a-z0-9-]/gi, '-').toLowerCase()}">${t._project || ''}</span>`
        : '';
    const ownerHtml = (t._owners || []).length > 0
        ? `<span class="card-owner">${t._owners.join(', ')}</span>`
        : '';
    const notesHtml = t.notes_count ? `<span class="card-notes">${t.notes_count} notes</span>` : '';
    const completeBtn = t.status !== 'completed'
        ? `<button class="kanban-complete-btn" onclick="quickComplete(event, ${t.id}, '${(t._source_file || '').replace(/'/g, "\\'")}')">Done</button>`
        : '';

    return `
    <div class="kanban-card${overdueClass}" onclick="window.location='/tasks/${t.id}'">
        <div class="kanban-card-top">
            <span class="priority-badge priority-${priorityClass}">${t.priority || 'P3'}</span>
            ${dueHtml}
            ${completeBtn}
        </div>
        <div class="kanban-card-title">${t.task || ''}</div>
        <div class="kanban-card-meta">
            ${projectBadge}${ownerHtml}${notesHtml}
        </div>
    </div>`;
}

async function quickComplete(event, taskId, sourceFile) {
    event.stopPropagation();
    try {
        const res = await fetch(`/api/tasks/${taskId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_file: sourceFile }),
        });
        if (res.ok) {
            if (currentDetailView === 'detail') {
                loadDetailTasks();
            } else {
                loadSummary();
            }
        }
    } catch (err) {
        console.error('Failed to complete task:', err);
    }
}

// ---- Table rendering ----

function initTableSort() {
    document.addEventListener('click', (e) => {
        const header = e.target.closest('.sortable-header');
        if (!header) return;
        const field = header.dataset.sort;
        if (currentSort.field === field) {
            currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.field = field;
            currentSort.dir = 'asc';
        }
        renderTable();
    });
}

function renderTable() {
    const tbody = document.getElementById('task-table-body');
    if (!tbody) return;

    let filtered = getFilteredTasks(allTasks);

    // Sort
    const { field, dir } = currentSort;
    filtered.sort((a, b) => {
        let va = a[field] || '';
        let vb = b[field] || '';

        if (field === 'priority') {
            va = PRIORITY_ORDER.indexOf(va);
            vb = PRIORITY_ORDER.indexOf(vb);
        } else if (field === 'status') {
            va = STATUS_ORDER.indexOf(va);
            vb = STATUS_ORDER.indexOf(vb);
        } else if (field === 'owner') {
            va = (a._owners || []).join(',');
            vb = (b._owners || []).join(',');
        } else if (field === 'due') {
            va = a.due_date || '9999';
            vb = b.due_date || '9999';
        } else if (field === 'id') {
            va = a.id || 0;
            vb = b.id || 0;
        } else if (field === 'project') {
            va = a._project || '';
            vb = b._project || '';
        }

        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    // Update sort indicators
    document.querySelectorAll('.sortable-header').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === field) {
            th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    tbody.innerHTML = filtered.map(t => {
        const overdueClass = t.is_overdue ? ' class="overdue"' : '';
        const owners = (t._owners || []).join(', ') || '-';
        const tags = (t.tags || []).map(tag => `<span class="tag-badge">${tag}</span>`).join(' ');
        const dueHtml = t.due_display
            ? `<span class="${t.is_overdue ? 'overdue-text' : ''}">${t.due_display}</span>`
            : '-';

        return `<tr${overdueClass} onclick="window.location='/tasks/${t.id}'" style="cursor: pointer;">
            <td><span class="display-id">${t._display_id || t.id}</span></td>
            <td><span class="priority-badge priority-${(t.priority || 'P3').toLowerCase()}">${t.priority || 'P3'}</span></td>
            <td>${t.task || ''}</td>
            <td>${owners}</td>
            <td><span class="project-badge project-badge-${(t._project || '').replace(/[^a-z0-9-]/gi, '-').toLowerCase()}">${t._project || ''}</span></td>
            <td><span class="status-badge status-${t.status || 'pending'}">${STATUS_LABELS[t.status] || t.status || 'Pending'}</span></td>
            <td>${dueHtml}</td>
            <td>${tags}</td>
        </tr>`;
    }).join('');
}
