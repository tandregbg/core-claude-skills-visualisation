/**
 * task-board.js -- Kanban board and table view with badge-based filters
 */

let currentView = 'kanban';
let allTasks = [];
let currentSort = { field: 'id', dir: 'asc' };
let selectedStatus = null;
let selectedPriority = null;

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

document.addEventListener('DOMContentLoaded', () => {
    initViewToggle();
    initTagFilter();
    initTableSort();
    loadTasks();
    window.addEventListener('folder-change', loadTasks);
    window.addEventListener('privacy-change', loadTasks);
});

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

    // Update badge active state
    document.querySelectorAll('#status-badges .day-badge').forEach(el => {
        el.classList.remove('active');
    });
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

    // Update badge active state
    document.querySelectorAll('#priority-badges .day-badge').forEach(el => {
        el.classList.remove('active');
    });
    if (priority === null) {
        document.querySelector('#priority-badges .day-badge-all').classList.add('active');
    } else {
        const badge = document.querySelector(`#priority-badges .day-badge[data-priority="${priority}"]`);
        if (badge) badge.classList.add('active');
    }

    applyFilters();
}

// ---- Filters ----

function initTagFilter() {
    const tagFilter = document.getElementById('filter-tags');
    if (tagFilter) tagFilter.addEventListener('input', applyFilters);
}

function getFilteredTasks(tasks) {
    const tagFilter = document.getElementById('filter-tags');
    let filtered = tasks;

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

// ---- Data loading ----

async function loadTasks() {
    const params = getApiParams();

    try {
        const allRes = await fetch(`/api/tasks?${params}`);
        allTasks = await allRes.json();

        renderStatusBadges();
        renderPriorityBadges();

        if (currentView === 'kanban') {
            renderKanban(allTasks);
        } else {
            renderTable();
        }
    } catch (err) {
        console.error('Failed to load tasks:', err);
    }
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

    // Show/hide columns based on status filter
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
    const overdueClass = t.is_overdue ? ' card-overdue' : '';
    const dueBadge = t.is_overdue
        ? `<span class="overdue-days">${t.days_overdue}d overdue</span>`
        : (t.due_display ? `<span class="meta-text">${t.due_display}</span>` : '');

    const checkBtn = t.status !== 'completed'
        ? `<button class="kanban-complete-btn" onclick="quickComplete(event, ${t.id}, '${escapeHtml(t._source_file || '')}')" title="Mark as done">&#10003;</button>`
        : '';

    return `
        <a href="/tasks/${t.id}" class="kanban-card${overdueClass}">
            <div class="kanban-card-top">
                <span class="priority-badge priority-${t.priority.toLowerCase()}">${t.priority}</span>
                ${dueBadge}
                ${checkBtn}
            </div>
            <div class="kanban-card-title">#${t.id} ${escapeHtml(t.task)}</div>
            <div class="kanban-card-meta">
                <span class="project-badge project-${t.project}">${t.project}</span>
                ${t.notes_count ? `<span class="meta-text">${t.notes_count} notes</span>` : ''}
                ${t.private ? '<span class="private-badge">priv</span>' : ''}
            </div>
        </a>
    `;
}

async function quickComplete(event, taskId, sourceFile) {
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
            loadTasks();
        } else {
            alert(data.error || 'Failed to complete task');
            btn.disabled = false;
        }
    } catch (err) {
        alert('Failed to complete task: ' + err.message);
        btn.disabled = false;
    }
}

// ---- Table rendering ----

function initTableSort() {
    document.querySelectorAll('.sortable-header').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (currentSort.field === field) {
                currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.field = field;
                currentSort.dir = 'asc';
            }
            renderTable();
        });
    });
}

function renderTable() {
    const tbody = document.getElementById('task-table-body');
    if (!tbody) return;

    let filtered = getFilteredTasks(allTasks);

    filtered.sort((a, b) => {
        let va = a[currentSort.field];
        let vb = b[currentSort.field];

        if (currentSort.field === 'priority') {
            va = va || 'P3';
            vb = vb || 'P3';
        }

        if (va == null) va = '';
        if (vb == null) vb = '';

        if (typeof va === 'number' && typeof vb === 'number') {
            return currentSort.dir === 'asc' ? va - vb : vb - va;
        }

        va = String(va);
        vb = String(vb);
        const cmp = va.localeCompare(vb);
        return currentSort.dir === 'asc' ? cmp : -cmp;
    });

    tbody.innerHTML = filtered.map(t => {
        const rowClass = t.is_overdue ? ' overdue' : '';
        return `
            <tr class="clickable-row${rowClass}" onclick="window.location='/tasks/${t.id}'">
                <td>${t.id}</td>
                <td><span class="priority-badge priority-${t.priority.toLowerCase()}">${t.priority}</span></td>
                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(t.task)}</td>
                <td><span class="project-badge project-${t.project}">${t.project}</span></td>
                <td><span class="status-badge status-${t.status}">${t.status}</span></td>
                <td class="${t.is_overdue ? 'overdue-text' : ''}">${t.due_display || ''}</td>
                <td style="font-size: 12px; color: var(--cs-on-surface-tertiary);">${(t.tags || []).join(', ')}</td>
            </tr>
        `;
    }).join('');
}
