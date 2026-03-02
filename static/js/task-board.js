/**
 * task-board.js -- Kanban board and table view rendering with filters
 */

let currentView = 'kanban';
let allTasks = [];
let currentSort = { field: 'id', dir: 'asc' };

document.addEventListener('DOMContentLoaded', () => {
    initViewToggle();
    initFilters();
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
        loadTasks();
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

// ---- Filters ----

function initFilters() {
    const priorityFilter = document.getElementById('filter-priority');
    const tagFilter = document.getElementById('filter-tags');

    if (priorityFilter) priorityFilter.addEventListener('change', applyFilters);
    if (tagFilter) tagFilter.addEventListener('input', applyFilters);
}

function getFilteredTasks(tasks) {
    const priorityFilter = document.getElementById('filter-priority');
    const tagFilter = document.getElementById('filter-tags');
    let filtered = tasks;

    if (priorityFilter && priorityFilter.value) {
        filtered = filtered.filter(t => t.priority === priorityFilter.value);
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
        if (currentView === 'kanban') {
            const res = await fetch(`/api/tasks/grouped?${params}`);
            const grouped = await res.json();

            allTasks = [];
            for (const tasks of Object.values(grouped)) {
                allTasks.push(...tasks);
            }

            renderKanban(grouped);
        }

        const allRes = await fetch(`/api/tasks?${params}`);
        allTasks = await allRes.json();

        if (currentView === 'table') {
            renderTable();
        }
    } catch (err) {
        console.error('Failed to load tasks:', err);
    }
}

// ---- Kanban rendering ----

function renderKanban(grouped) {
    let groups = grouped;
    if (Array.isArray(grouped)) {
        groups = { pending: [], in_progress: [], blocked: [], completed: [] };
        for (const t of grouped) {
            const s = t.status || 'pending';
            if (groups[s]) groups[s].push(t);
            else groups.pending.push(t);
        }
    }

    for (const [status, tasks] of Object.entries(groups)) {
        const col = document.getElementById(`col-${status}`);
        const count = document.getElementById(`count-${status}`);
        if (!col) continue;

        const filtered = getFilteredTasks(tasks);
        if (count) count.textContent = filtered.length;

        if (filtered.length === 0) {
            col.innerHTML = '<div class="empty-state" style="text-align: center; padding: 24px 0;">No tasks</div>';
            continue;
        }

        col.innerHTML = filtered.map(t => renderCard(t)).join('');
    }
}

function renderCard(t) {
    const overdueClass = t.is_overdue ? ' card-overdue' : '';
    const dueBadge = t.is_overdue
        ? `<span class="overdue-days">${t.days_overdue}d overdue</span>`
        : (t.due_display ? `<span class="meta-text">${t.due_display}</span>` : '');

    return `
        <a href="/tasks/${t.id}" class="kanban-card${overdueClass}">
            <div class="kanban-card-top">
                <span class="priority-badge priority-${t.priority.toLowerCase()}">${t.priority}</span>
                ${dueBadge}
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
