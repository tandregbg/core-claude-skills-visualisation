/**
 * recent.js -- Recent Updates page: day badges, file list, markdown preview
 */

let selectedFilePath = null;
let selectedDay = null;
let cachedData = null;

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
        cachedData = data;
        selectedDay = null;
        renderDayBadges(data);
        renderFileList(data, null);
    } catch (err) {
        console.error('Failed to load recent files:', err);
    }
}

function getDayLabel(dayKey) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const d = new Date(dayKey + 'T00:00:00');
    const diff = Math.round((d - today) / 86400000);

    if (diff === 0) return 'Today';
    if (diff === -1) return 'Yesterday';
    if (diff === 1) return 'Tomorrow';

    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return weekdayNames[d.getDay()];
}

function getDayType(dayKey) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dayKey + 'T00:00:00');
    const diff = Math.round((d - today) / 86400000);

    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff < 0) return 'past';
    return 'future';
}

function renderDayBadges(data) {
    const container = document.getElementById('day-badges');
    const countEl = document.getElementById('file-count');
    const days = data.days;
    const sortedDays = Object.keys(days).sort();

    countEl.textContent = `${data.total} files`;

    if (sortedDays.length === 0) {
        container.innerHTML = '';
        return;
    }

    // "All" badge first
    const allBadge = `<button class="day-badge day-badge-all active" onclick="filterByDay(null)">All <span class="day-badge-count">${data.total}</span></button>`;

    const badges = sortedDays.map(dayKey => {
        const files = days[dayKey];
        const label = getDayLabel(dayKey);
        const type = getDayType(dayKey);
        const dateStr = dayKey.slice(5); // MM-DD

        return `<button class="day-badge day-badge-${type}" onclick="filterByDay('${dayKey}')" data-day="${dayKey}">
            <span class="day-badge-label">${label}</span>
            <span class="day-badge-date">${dateStr}</span>
            <span class="day-badge-count">${files.length}</span>
        </button>`;
    }).join('');

    container.innerHTML = allBadge + badges;
}

function filterByDay(dayKey) {
    selectedDay = dayKey;
    selectedFilePath = null;

    // Update badge active state
    document.querySelectorAll('.day-badge').forEach(el => {
        el.classList.remove('active');
    });
    if (dayKey === null) {
        document.querySelector('.day-badge-all').classList.add('active');
    } else {
        const badge = document.querySelector(`.day-badge[data-day="${dayKey}"]`);
        if (badge) badge.classList.add('active');
    }

    renderFileList(cachedData, dayKey);
}

function renderFileList(data, filterDay) {
    const container = document.getElementById('file-list');
    const days = data.days;
    let sortedDays = Object.keys(days).sort().reverse();

    if (filterDay) {
        sortedDays = sortedDays.filter(d => d === filterDay);
    }

    if (sortedDays.length === 0) {
        container.innerHTML = '<p class="empty-state">No files for this day</p>';
        resetPreview();
        return;
    }

    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    container.innerHTML = sortedDays.map(dayKey => {
        const files = days[dayKey];
        const label = getDayLabel(dayKey);
        const fullLabel = (label === 'Today' || label === 'Yesterday' || label === 'Tomorrow')
            ? label
            : weekdayNames[new Date(dayKey + 'T00:00:00').getDay()];

        return `
            <div class="day-group">
                <div class="day-group-header">
                    <div class="day-group-label">
                        ${fullLabel}<span class="day-group-date">${dayKey}</span>
                    </div>
                    <span class="day-group-count">${files.length}</span>
                </div>
                ${files.map(f => renderFileItem(f)).join('')}
            </div>
        `;
    }).join('');

    // Auto-select first file
    if (sortedDays.length > 0) {
        const firstFile = days[sortedDays[0]][0];
        if (firstFile) {
            selectFile(firstFile.relative_path, firstFile.obsidian_link);
        }
    }
}

function resetPreview() {
    const headerEl = document.getElementById('preview-header');
    headerEl.innerHTML = '<span class="preview-placeholder">Select a file to preview</span><a id="preview-obsidian-link" href="#" class="preview-link hidden">Open in Obsidian</a>';
    const contentEl = document.getElementById('preview-content');
    contentEl.innerHTML = '<p class="preview-empty">Click a file on the left to see its content here</p>';
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
