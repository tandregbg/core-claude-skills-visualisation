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
    initGlobalInboxAdd();
});

// ---- Sidebar collapse ----

function initSidebarToggle() {
    const btn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const layout = document.querySelector('.app-layout');
    if (!btn || !sidebar) return;

    // Default to collapsed (auto-collapse), expand on hover is handled by CSS
    const savedState = sessionStorage.getItem('sidebar-collapsed');
    if (savedState === null || savedState === 'true') {
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

// ---- Global Inbox Add ----

function initGlobalInboxAdd() {
    const btn = document.getElementById('global-inbox-add');
    const modal = document.getElementById('global-add-modal');
    if (!btn || !modal) return;

    const closeBtn = document.getElementById('global-modal-close');
    const cancelBtn = document.getElementById('global-modal-cancel');
    const submitBtn = document.getElementById('global-modal-submit');

    btn.addEventListener('click', () => {
        modal.style.display = 'flex';
        _globalResetModal();
        _globalPopulateProjects();
        document.getElementById('global-add-title').focus();
    });

    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    submitBtn.addEventListener('click', _globalSubmitAdd);

    // Drop zone
    _globalInitDropZone();
}

function _globalResetModal() {
    document.getElementById('global-add-title').value = '';
    document.getElementById('global-add-content').value = '';
    document.getElementById('global-add-type').value = 'quick_note';
    document.getElementById('global-add-project').value = '';
    document.getElementById('global-add-tags').value = '';
    _globalDroppedContent = null;
    document.getElementById('global-drop-prompt').style.display = '';
    document.getElementById('global-drop-file').style.display = 'none';
    document.getElementById('global-drop-zone').classList.remove('drop-zone-has-file');
}

async function _globalPopulateProjects() {
    const select = document.getElementById('global-add-project');
    while (select.options.length > 1) select.remove(1);
    try {
        const res = await fetch('/api/projects');
        const projects = await res.json();
        for (const name of Object.keys(projects).sort()) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        }
    } catch (e) {}
}

let _globalDroppedContent = null;

function _globalInitDropZone() {
    const zone = document.getElementById('global-drop-zone');
    const clearBtn = document.getElementById('global-drop-clear');
    if (!zone) return;

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drop-zone-active'); });
    zone.addEventListener('dragleave', () => { zone.classList.remove('drop-zone-active'); });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drop-zone-active');
        const file = e.dataTransfer.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            _globalDroppedContent = ev.target.result;
            document.getElementById('global-add-content').value = ev.target.result;

            const titleInput = document.getElementById('global-add-title');
            if (!titleInput.value.trim()) {
                let name = file.name.replace(/\.\w+$/, '').replace(/[-_]/g, ' ');
                name = name.replace(/^\d{6}\s*/, '');
                titleInput.value = name;
            }

            document.getElementById('global-drop-prompt').style.display = 'none';
            document.getElementById('global-drop-file').style.display = '';
            document.getElementById('global-drop-filename').textContent = file.name;
            zone.classList.add('drop-zone-has-file');
        };
        reader.readAsText(file);
    });

    clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _globalDroppedContent = null;
        document.getElementById('global-add-content').value = '';
        document.getElementById('global-drop-prompt').style.display = '';
        document.getElementById('global-drop-file').style.display = 'none';
        zone.classList.remove('drop-zone-has-file');
    });
}

async function _globalSubmitAdd() {
    const title = document.getElementById('global-add-title').value.trim();
    const content = document.getElementById('global-add-content').value.trim();
    const itemType = document.getElementById('global-add-type').value;
    const project = document.getElementById('global-add-project').value;
    const tags = document.getElementById('global-add-tags').value.trim();

    if (!title) { alert('Title is required'); return; }
    if (!content) { alert('Content is required'); return; }

    const submitBtn = document.getElementById('global-modal-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';

    try {
        const res = await fetch('/api/inbox/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content, type: itemType, project, tags }),
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
            document.getElementById('global-add-modal').style.display = 'none';
            fetchInboxBadge();
            // If on inbox page, refresh the list
            if (typeof loadInbox === 'function') loadInbox();
        } else {
            alert(data.error || 'Failed to add item');
        }
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add to Inbox';
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
