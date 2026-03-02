/**
 * recent.js -- Recent Updates page: file list grouped by day + markdown preview
 */

let selectedFilePath = null;

document.addEventListener('DOMContentLoaded', () => {
    loadRecentFiles();

    document.getElementById('days-select').addEventListener('change', loadRecentFiles);
    window.addEventListener('folder-change', loadRecentFiles);
    window.addEventListener('privacy-change', loadRecentFiles);
});

async function loadRecentFiles() {
    const params = getApiParams();
    const days = document.getElementById('days-select').value;

    try {
        const res = await fetch(`/api/files/recent?${params}&days=${days}`);
        const data = await res.json();
        renderFileList(data);
    } catch (err) {
        console.error('Failed to load recent files:', err);
    }
}

function renderFileList(data) {
    const container = document.getElementById('file-list');
    const countEl = document.getElementById('file-count');

    countEl.textContent = `${data.total} files`;

    const days = data.days;
    const sortedDays = Object.keys(days).sort().reverse();

    if (sortedDays.length === 0) {
        container.innerHTML = '<p class="empty-state">No files in this period</p>';
        return;
    }

    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    container.innerHTML = sortedDays.map(dayKey => {
        const files = days[dayKey];
        const d = new Date(dayKey + 'T00:00:00');
        const weekday = weekdayNames[d.getDay()];
        const isToday = dayKey === new Date().toISOString().slice(0, 10);
        const dayLabel = isToday ? 'Today' : weekday;

        return `
            <div class="day-group">
                <div class="day-group-header">
                    <div class="day-group-label">
                        ${dayLabel}<span class="day-group-date">${dayKey}</span>
                    </div>
                    <span class="day-group-count">${files.length}</span>
                </div>
                ${files.map(f => renderFileItem(f)).join('')}
            </div>
        `;
    }).join('');

    // Auto-select first file if nothing selected
    if (!selectedFilePath && sortedDays.length > 0) {
        const firstFile = days[sortedDays[0]][0];
        if (firstFile) {
            selectFile(firstFile.relative_path, firstFile.obsidian_link);
        }
    }
}

function renderFileItem(f) {
    const isSelected = f.relative_path === selectedFilePath;
    const selectedClass = isSelected ? ' selected' : '';

    // Clean display name
    let displayName = f.filename;
    if (/^\d{6}-/.test(displayName)) {
        displayName = displayName.substring(7);
    }
    if (displayName.endsWith('.md')) {
        displayName = displayName.slice(0, -3);
    }
    displayName = displayName.replace(/-/g, ' ');

    return `
        <div class="file-item${selectedClass}"
             onclick="selectFile('${escapeAttr(f.relative_path)}', '${escapeAttr(f.obsidian_link)}')"
             data-path="${escapeAttr(f.relative_path)}">
            <div class="file-item-name">${escapeHtml(displayName)}</div>
            <div class="file-item-meta">
                <span class="project-badge project-${f.project}">${f.project}</span>
                <span class="file-item-domain">${f.domain}</span>
            </div>
        </div>
    `;
}

async function selectFile(relativePath, obsidianLink) {
    selectedFilePath = relativePath;

    // Update visual selection
    document.querySelectorAll('.file-item').forEach(el => {
        if (el.dataset.path === relativePath) {
            el.classList.add('selected');
        } else {
            el.classList.remove('selected');
        }
    });

    // Update header
    const headerEl = document.getElementById('preview-header');
    const filename = relativePath.split('/').pop();
    headerEl.innerHTML = `
        <span class="preview-filename">${escapeHtml(filename)}</span>
        <a href="${escapeAttr(obsidianLink)}" class="preview-link">Open in Obsidian</a>
    `;

    // Load content
    const contentEl = document.getElementById('preview-content');
    contentEl.innerHTML = '<p class="empty-state">Loading...</p>';

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

function escapeAttr(s) {
    if (!s) return '';
    return s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
