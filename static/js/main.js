/**
 * main.js -- Global state, folder selector, auto-refresh, navigation
 */

let currentFolder = 'all';
let includePrivate = false;
let autoRefreshInterval = null;
const AUTO_REFRESH_MS = 60000;

// Project color palette -- assigned dynamically to projects from _tasks.yaml
const PROJECT_COLOR_PALETTE = [
    { bg: '#dbeafe', text: '#1e40af', chart: '#3b82f6' },
    { bg: '#dcfce7', text: '#166534', chart: '#22c55e' },
    { bg: '#ffedd5', text: '#9a3412', chart: '#f97316' },
    { bg: '#fef3c7', text: '#92400e', chart: '#f59e0b' },
    { bg: '#ede9fe', text: '#5b21b6', chart: '#8b5cf6' },
    { bg: '#fce7f3', text: '#9d174d', chart: '#ec4899' },
];
const PROJECT_PERSONAL_COLOR = { bg: '#f3f4f6', text: '#374151', chart: '#6b7280' };
const PROJECT_COLORS = {};  // Populated dynamically in initFolderSelector

const PRIORITY_COLORS = {
    P0: '#ef4444',
    P1: '#f97316',
    P2: '#3b82f6',
    P3: '#9ca3af',
};

// ---- Init ----

document.addEventListener('DOMContentLoaded', () => {
    initSidebarToggle();
    setActiveNavLink();
    initFolderSelector();
    initPrivacyToggle();
    initRefreshButton();
    initAutoRefresh();
    fetchInboxBadge();
});

// ---- Sidebar collapse ----

function initSidebarToggle() {
    const btn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const layout = document.querySelector('.app-layout');
    if (!btn || !sidebar) return;

    // Restore saved state
    if (sessionStorage.getItem('sidebar-collapsed') === 'true') {
        sidebar.classList.add('collapsed');
        if (layout) layout.classList.add('sidebar-collapsed');
    }

    btn.addEventListener('click', () => {
        const collapsed = sidebar.classList.toggle('collapsed');
        if (layout) layout.classList.toggle('sidebar-collapsed', collapsed);
        sessionStorage.setItem('sidebar-collapsed', collapsed);
    });
}

// ---- Folder selector ----

let _projectStyleEl = null;

async function loadProjects() {
    const select = document.getElementById('folder-select');
    if (!select) return;

    // Clear existing options (keep "All projects")
    while (select.options.length > 1) {
        select.remove(1);
    }

    try {
        const res = await fetch('/api/projects');
        const projects = await res.json();

        let colorIdx = 0;
        const cssRules = [];

        for (const [name, cfg] of Object.entries(projects)) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (!cfg.shared_view) {
                opt.textContent += ' (private)';
            }
            select.appendChild(opt);

            // Assign color from palette
            const color = (name === 'personal')
                ? PROJECT_PERSONAL_COLOR
                : PROJECT_COLOR_PALETTE[colorIdx++ % PROJECT_COLOR_PALETTE.length];
            PROJECT_COLORS[name] = color;

            // Generate CSS for project badge
            cssRules.push(`.project-${name} { background: ${color.bg}; color: ${color.text}; }`);
        }

        // Replace dynamic project CSS
        if (_projectStyleEl) _projectStyleEl.remove();
        if (cssRules.length > 0) {
            _projectStyleEl = document.createElement('style');
            _projectStyleEl.textContent = cssRules.join('\n');
            document.head.appendChild(_projectStyleEl);
        }
    } catch (err) {
        console.error('Failed to load projects:', err);
    }

    // Restore saved selection (reset to 'all' if project no longer exists)
    const saved = sessionStorage.getItem('folder');
    if (saved && select.querySelector(`option[value="${saved}"]`)) {
        select.value = saved;
        currentFolder = saved;
    } else {
        select.value = 'all';
        currentFolder = 'all';
        sessionStorage.removeItem('folder');
    }
}

async function initFolderSelector() {
    const select = document.getElementById('folder-select');
    if (!select) return;

    await loadProjects();

    select.addEventListener('change', () => {
        currentFolder = select.value;
        sessionStorage.setItem('folder', currentFolder);
        window.dispatchEvent(new Event('folder-change'));
    });

    // Reload dropdown when settings are saved
    window.addEventListener('settings-saved', async () => {
        await loadProjects();
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
                         (page === 'inbox' && path === '/inbox') ||
                         (page === 'tasks' && path.startsWith('/tasks')) ||
                         (page === 'documents' && path === '/documents') ||
                         (page === 'activity' && path === '/activity') ||
                         (page === 'insights' && path === '/insights') ||
                         (page === 'settings' && path === '/settings');
        if (isActive) {
            link.classList.add('active');
        }
    });
}

async function fetchInboxBadge() {
    try {
        const res = await fetch('/api/inbox/count');
        const data = await res.json();
        const badge = document.getElementById('inbox-nav-badge');
        if (badge) {
            badge.textContent = data.count || '';
            badge.style.display = data.count > 0 ? '' : 'none';
        }
    } catch (e) {
        // Silently fail
    }
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
    const colors = PROJECT_COLORS[project] || PROJECT_PERSONAL_COLOR;
    return colors[type || 'chart'];
}

// ---- Export / download helpers ----

function downloadHtml(relativePath) {
    window.open(`/api/files/export?path=${encodeURIComponent(relativePath)}`, '_blank');
}

function downloadPdf(relativePath) {
    window.open(`/api/files/pdf?path=${encodeURIComponent(relativePath)}`, '_blank');
}

function renderExportLinks(relativePath) {
    const escaped = relativePath.replace(/'/g, "\\'");
    return `<a href="#" class="preview-link" onclick="downloadHtml('${escaped}'); return false;">HTML</a>` +
           `<a href="#" class="preview-link" onclick="downloadPdf('${escaped}'); return false;">PDF</a>`;
}
