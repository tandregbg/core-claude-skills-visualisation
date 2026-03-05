/* projects.js -- Project list and detail view */

(function () {
    'use strict';

    const listView = document.getElementById('projects-list-view');
    const detailView = document.getElementById('project-detail-view');
    let currentProject = null;

    // -----------------------------------------------------------------------
    // Project list
    // -----------------------------------------------------------------------

    async function loadProjectList() {
        try {
            const res = await fetch('/api/projects');
            const projects = await res.json();
            renderProjectCards(projects);
        } catch (e) {
            document.getElementById('project-cards').innerHTML =
                '<p class="empty-state">Failed to load projects</p>';
        }
    }

    function renderProjectCards(projects) {
        const container = document.getElementById('project-cards');
        const names = Object.keys(projects).sort();

        if (names.length === 0) {
            container.innerHTML = '<p class="empty-state">No projects found</p>';
            return;
        }

        container.innerHTML = names.map(name => {
            const cfg = projects[name];
            const vault = cfg.vault || '';
            const source = cfg.discovered ? 'discovered' : 'registered';
            return `<div class="project-card" onclick="openProject('${name.replace(/'/g, "\\'")}')">
                <div class="project-card-name">${escapeHtml(name)}</div>
                <div class="project-card-path">${escapeHtml(vault)}</div>
                <div class="project-card-source">${source}</div>
            </div>`;
        }).join('');
    }

    // -----------------------------------------------------------------------
    // Project detail
    // -----------------------------------------------------------------------

    window.openProject = function (name) {
        // Update URL without reload
        history.pushState({ project: name }, '', '/projects/' + encodeURIComponent(name));
        showDetail(name);
    };

    async function showDetail(name) {
        currentProject = name;
        listView.classList.add('hidden');
        detailView.classList.remove('hidden');

        document.getElementById('project-title').textContent = name;
        document.getElementById('project-vault-path').textContent = '';
        document.getElementById('preview-content').innerHTML =
            '<p class="preview-empty">Loading...</p>';
        document.getElementById('tasks-panel-content').innerHTML =
            '<p class="empty-state">Loading tasks...</p>';

        try {
            const res = await fetch('/api/projects/' + encodeURIComponent(name));
            if (!res.ok) throw new Error('Not found');
            const detail = await res.json();
            renderDetail(detail);
        } catch (e) {
            document.getElementById('preview-content').innerHTML =
                '<p class="empty-state">Failed to load project</p>';
        }
    }

    function renderDetail(detail) {
        document.getElementById('project-vault-path').textContent = detail.vault || '';

        // Ops files
        renderOpsFiles(detail.ops_files || []);

        // Meetings
        renderMeetings(detail.meetings || []);

        // Sub-projects
        renderSubProjects(detail.sub_projects || []);

        // Contact folders
        renderContacts(detail.contact_folders || []);

        // Stats
        renderStats(detail.stats || {});

        // Tasks
        renderTasks(detail.tasks || []);

        // Auto-load README if it exists
        const readme = (detail.ops_files || []).find(f => f.filename === 'README.md' && f.exists);
        if (readme) {
            loadPreview(readme.relative_path, readme.filename);
        } else {
            document.getElementById('preview-content').innerHTML =
                '<p class="preview-empty">No README.md found</p>';
            document.getElementById('preview-header').innerHTML =
                '<span class="preview-placeholder">No README.md</span>';
        }
    }

    // -----------------------------------------------------------------------
    // Left column renderers
    // -----------------------------------------------------------------------

    function renderOpsFiles(files) {
        const container = document.getElementById('ops-files-list');
        const existing = files.filter(f => f.exists);
        if (existing.length === 0) {
            container.innerHTML = '<p class="empty-state-sm">No ops files</p>';
            return;
        }
        container.innerHTML = existing.map(f => {
            const active = f.filename === 'README.md' ? ' project-nav-item-active' : '';
            return `<a href="#" class="project-nav-item${active}" data-path="${escapeAttr(f.relative_path)}"
                onclick="projLoadFile('${escapeJs(f.relative_path)}', '${escapeJs(f.filename)}'); return false;">
                ${escapeHtml(f.filename)}
                <span class="file-size">${formatSize(f.size)}</span>
            </a>`;
        }).join('');
    }

    function renderMeetings(meetings) {
        const section = document.getElementById('meetings-section');
        const container = document.getElementById('meetings-list');
        if (meetings.length === 0) {
            section.classList.add('hidden');
            return;
        }
        section.classList.remove('hidden');
        // Show last 15
        const shown = meetings.slice(0, 15);
        container.innerHTML = shown.map(m => {
            const label = m.filename.replace(/^\d{6}-/, '').replace(/\.md$/, '');
            const dateStr = m.date || '';
            const category = m.category ? `<span class="meeting-category">${escapeHtml(m.category)}</span>` : '';
            return `<a href="#" class="project-nav-item" data-path="${escapeAttr(m.relative_path)}"
                onclick="projLoadFile('${escapeJs(m.relative_path)}', '${escapeJs(m.filename)}'); return false;">
                <span class="meeting-date">${dateStr}</span>
                ${category}
                <span class="meeting-label">${escapeHtml(label)}</span>
            </a>`;
        }).join('');
        if (meetings.length > 15) {
            container.innerHTML += `<span class="more-count">+${meetings.length - 15} more</span>`;
        }
    }

    function renderSubProjects(subProjects) {
        const section = document.getElementById('sub-projects-section');
        const container = document.getElementById('sub-projects-list');
        if (subProjects.length === 0) {
            section.classList.add('hidden');
            return;
        }
        section.classList.remove('hidden');
        container.innerHTML = subProjects.map(sp => {
            const indicators = [];
            if (sp.has_readme) indicators.push('R');
            if (sp.has_changelog) indicators.push('C');
            if (sp.has_tasks) indicators.push('T');
            const badge = indicators.length > 0
                ? `<span class="sub-project-indicators">${indicators.join('')}</span>` : '';
            return `<a href="#" class="project-nav-item"
                onclick="projLoadSubProject('${escapeJs(sp.relative_path)}', '${escapeJs(sp.name)}'); return false;">
                ${escapeHtml(sp.name)} ${badge}
            </a>`;
        }).join('');
    }

    function renderContacts(contacts) {
        const section = document.getElementById('contacts-section');
        const container = document.getElementById('contacts-list');
        if (contacts.length === 0) {
            section.classList.add('hidden');
            return;
        }
        section.classList.remove('hidden');
        // Show top 20 by recent activity
        const shown = contacts.slice(0, 20);
        container.innerHTML = shown.map(c => {
            const dateStr = c.latest_date || '';
            return `<a href="#" class="project-nav-item"
                onclick="projLoadContactFolder('${escapeJs(c.relative_path)}', '${escapeJs(c.name)}'); return false;">
                <span class="contact-name">${escapeHtml(c.name)}</span>
                <span class="contact-meta">${c.file_count} files, ${dateStr}</span>
            </a>`;
        }).join('');
        if (contacts.length > 20) {
            container.innerHTML += `<span class="more-count">+${contacts.length - 20} more</span>`;
        }
    }

    function renderStats(stats) {
        const container = document.getElementById('project-stats');
        const parts = [`${stats.total_files || 0} files`];
        if (stats.date_range) {
            parts.push(`${stats.date_range.earliest} to ${stats.date_range.latest}`);
        }
        container.innerHTML = `<span class="project-stat">${parts.join(' &middot; ')}</span>`;
    }

    // -----------------------------------------------------------------------
    // Tasks panel
    // -----------------------------------------------------------------------

    function renderTasks(tasks) {
        const container = document.getElementById('tasks-panel-content');
        const titleEl = document.getElementById('tasks-panel-title');

        const open = tasks.filter(t => t.status !== 'completed' && t.status !== 'done');
        titleEl.textContent = `Tasks (${open.length})`;

        if (open.length === 0) {
            container.innerHTML = '<p class="empty-state">No open tasks</p>';
            return;
        }

        // Sort by priority then status
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
                <td><button class="task-done-btn" onclick="projCompleteTask(event, ${t.id}, '${sourceFile}')" title="Mark as done">&#10003;</button></td>
                <td><a href="/tasks/${t.id}" style="color:inherit;text-decoration:none;">#${t.id}</a></td>
                <td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><a href="/tasks/${t.id}" style="color:inherit;text-decoration:none;">${taskTitle}</a></td>
                <td><span class="priority-badge priority-${(t.priority || 'p3').toLowerCase()}">${escapeHtml(t.priority || '')}</span></td>
                <td><span class="task-panel-status task-panel-status-${t.status}">${escapeHtml(t.status || '')}</span></td>
                <td class="${overdueClass}" style="white-space:nowrap;">${escapeHtml(dueStr)}</td>
                <td style="font-size:11px;color:var(--cs-on-surface-tertiary);">${escapeHtml(tags)}</td>
            </tr>`;
        }

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    window.projCompleteTask = async function(event, taskId, sourceFile) {
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
                showDetail(currentProject);
            } else {
                alert(data.error || 'Failed to complete task');
                btn.disabled = false;
            }
        } catch (err) {
            alert('Failed to complete task: ' + err.message);
            btn.disabled = false;
        }
    };

    // -----------------------------------------------------------------------
    // Content preview
    // -----------------------------------------------------------------------

    window.projLoadFile = function (path, filename) {
        // Highlight active nav item
        document.querySelectorAll('.project-nav-item-active').forEach(el =>
            el.classList.remove('project-nav-item-active'));
        const clicked = document.querySelector(`.project-nav-item[data-path="${CSS.escape(path)}"]`);
        if (clicked) clicked.classList.add('project-nav-item-active');

        loadPreview(path, filename);
    };

    window.projLoadSubProject = function (relPath, name) {
        // Load sub-project README if it exists
        const readmePath = relPath + '/README.md';
        loadPreview(readmePath, name + ' / README.md');
    };

    window.projLoadContactFolder = function (relPath, name) {
        // Navigate to documents page filtered by this contact
        window.location.href = '/documents#project=' + encodeURIComponent(name);
    };

    async function loadPreview(path, label) {
        const header = document.getElementById('preview-header');
        const content = document.getElementById('preview-content');

        header.innerHTML = `<span>${escapeHtml(label || path)}</span>
            <a id="preview-obsidian-link" href="#" class="preview-link">Open in Obsidian</a>`;
        content.innerHTML = '<p class="preview-empty">Loading...</p>';

        try {
            const res = await fetch('/api/files/content?path=' + encodeURIComponent(path));
            if (!res.ok) {
                content.innerHTML = '<p class="preview-empty">File not found</p>';
                return;
            }
            const data = await res.json();
            content.innerHTML = data.html || '<p class="preview-empty">Empty file</p>';
        } catch (e) {
            content.innerHTML = '<p class="preview-empty">Failed to load file</p>';
        }
    }

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function escapeJs(str) {
        return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function formatSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
        return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    }

    // -----------------------------------------------------------------------
    // Navigation / back button
    // -----------------------------------------------------------------------

    function showList() {
        listView.classList.remove('hidden');
        detailView.classList.add('hidden');
        currentProject = null;
    }

    document.getElementById('back-to-list').addEventListener('click', function (e) {
        e.preventDefault();
        history.pushState({}, '', '/projects');
        showList();
    });

    window.addEventListener('popstate', function (e) {
        if (e.state && e.state.project) {
            showDetail(e.state.project);
        } else {
            showList();
        }
    });

    // -----------------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------------

    if (window.INITIAL_PROJECT && window.INITIAL_PROJECT !== 'null') {
        showDetail(window.INITIAL_PROJECT);
    } else {
        loadProjectList();
    }

})();
