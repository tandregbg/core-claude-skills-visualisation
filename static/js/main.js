/**
 * main.js -- Global state, folder selector, auto-refresh, navigation
 */

let currentFolder = 'all';
let includePrivate = false;
let autoRefreshInterval = null;
const AUTO_REFRESH_MS = 60000;

// Project colors for charts
const PROJECT_COLORS = {
    sonetel: { bg: '#dbeafe', text: '#1e40af', chart: '#3b82f6' },
    t1k:     { bg: '#dcfce7', text: '#166534', chart: '#22c55e' },
    personal:{ bg: '#f3f4f6', text: '#374151', chart: '#6b7280' },
    tajmad:  { bg: '#ffedd5', text: '#9a3412', chart: '#f97316' },
};

const PRIORITY_COLORS = {
    P0: '#ef4444',
    P1: '#f97316',
    P2: '#3b82f6',
    P3: '#9ca3af',
};

// ---- Init ----

document.addEventListener('DOMContentLoaded', () => {
    initFolderSelector();
    initPrivacyToggle();
    initRefreshButton();
    initAutoRefresh();
    setActiveNavLink();
});

// ---- Folder selector ----

async function initFolderSelector() {
    const select = document.getElementById('folder-select');
    if (!select) return;

    try {
        const res = await fetch('/api/projects');
        const projects = await res.json();

        for (const [name, cfg] of Object.entries(projects)) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (!cfg.shared_view) {
                opt.textContent += ' (private)';
            }
            select.appendChild(opt);
        }
    } catch (err) {
        console.error('Failed to load projects:', err);
    }

    const saved = sessionStorage.getItem('folder');
    if (saved) {
        select.value = saved;
        currentFolder = saved;
    }

    select.addEventListener('change', () => {
        currentFolder = select.value;
        sessionStorage.setItem('folder', currentFolder);
        window.dispatchEvent(new Event('folder-change'));
    });
}

// ---- Privacy toggle ----

function initPrivacyToggle() {
    const toggle = document.getElementById('private-toggle');
    if (!toggle) return;

    const saved = sessionStorage.getItem('private');
    if (saved === 'true') {
        toggle.checked = true;
        includePrivate = true;
    }

    toggle.addEventListener('change', () => {
        includePrivate = toggle.checked;
        sessionStorage.setItem('private', includePrivate);
        window.dispatchEvent(new Event('privacy-change'));
    });
}

// ---- Refresh ----

function initRefreshButton() {
    const btn = document.getElementById('refresh-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        btn.textContent = 'Refreshing...';
        btn.disabled = true;
        try {
            await fetch('/api/refresh', { method: 'POST' });
            window.dispatchEvent(new Event('folder-change'));
        } catch (err) {
            console.error('Refresh failed:', err);
        } finally {
            btn.textContent = 'Refresh data';
            btn.disabled = false;
        }
    });
}

// ---- Auto-refresh ----

function initAutoRefresh() {
    const toggle = document.getElementById('auto-refresh-toggle');
    if (!toggle) return;

    toggle.addEventListener('change', () => {
        if (toggle.checked) {
            autoRefreshInterval = setInterval(() => {
                window.dispatchEvent(new Event('folder-change'));
            }, AUTO_REFRESH_MS);
        } else {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
    });
}

// ---- Navigation ----

function setActiveNavLink() {
    const path = window.location.pathname;
    document.querySelectorAll('.nav-item[data-page]').forEach(link => {
        const page = link.dataset.page;
        const isActive = (page === 'index' && path === '/') ||
                         (page === 'tasks' && path.startsWith('/tasks')) ||
                         (page === 'recent' && path === '/recent') ||
                         (page === 'activity' && path === '/activity');
        if (isActive) {
            link.classList.add('active');
        }
    });
}

// ---- Shared helpers ----

function getApiParams() {
    const params = new URLSearchParams();
    if (currentFolder && currentFolder !== 'all') {
        params.set('project', currentFolder);
    }
    if (includePrivate) {
        params.set('private', 'true');
    }
    return params.toString();
}

function getPriorityClass(priority) {
    return `priority-badge priority-${(priority || 'p3').toLowerCase()}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getProjectColor(project, type) {
    const colors = PROJECT_COLORS[project] || PROJECT_COLORS.personal;
    return colors[type || 'chart'];
}
