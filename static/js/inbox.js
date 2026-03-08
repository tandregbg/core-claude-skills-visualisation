/**
 * inbox.js -- Inbox page: list, preview, classify, quick-add, archive
 */

let selectedItemId = null;
let selectedItemData = null;
let activeStatusFilter = '';
let activeTypeFilter = '';
let selectedConfidence = null;

document.addEventListener('DOMContentLoaded', () => {
    loadInbox();
    initModal();
    initClassifyPanel();
});

async function loadInbox() {
    try {
        const params = new URLSearchParams();
        if (activeStatusFilter) params.set('status', activeStatusFilter);

        const res = await fetch(`/api/inbox?${params}`);
        const data = await res.json();
        renderStatusBadges(data.stats);
        renderTypeBadges(data.stats);
        renderInboxList(data.items);

        const countEl = document.getElementById('inbox-count');
        countEl.textContent = `${data.stats.active} active`;
    } catch (err) {
        console.error('Failed to load inbox:', err);
    }
}

// -- Status filter badges --

function renderStatusBadges(stats) {
    const container = document.getElementById('status-badges');
    const counts = stats.status_counts || {};
    const statuses = ['new', 'classified', 'done', 'archived'];
    const total = stats.total || 0;
    const active = stats.active || 0;

    let html = `<button class="day-badge${activeStatusFilter === '' ? ' active' : ''}"
                    onclick="filterByStatus('')">
                    <span class="day-badge-label">All</span>
                    <span class="day-badge-count">${active}</span>
                </button>`;

    for (const s of statuses) {
        const count = counts[s] || 0;
        if (count === 0 && s !== 'new') continue;
        const isActive = activeStatusFilter === s;
        html += `<button class="day-badge inbox-status-${s}${isActive ? ' active' : ''}"
                    onclick="filterByStatus('${s}')">
                    <span class="day-badge-label">${s}</span>
                    <span class="day-badge-count">${count}</span>
                </button>`;
    }

    container.innerHTML = html;
}

function renderTypeBadges(stats) {
    const container = document.getElementById('type-badges');
    const counts = stats.type_counts || {};
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = sorted.map(([type, count]) => {
        const isActive = activeTypeFilter === type;
        return `<button class="day-badge inbox-type-${type.replace('_', '-')}${isActive ? ' active' : ''}"
                    onclick="filterByType('${escapeAttr(type)}')">
                    <span class="day-badge-label">${escapeHtml(type.replace('_', ' '))}</span>
                    <span class="day-badge-count">${count}</span>
                </button>`;
    }).join('');
}

window.filterByStatus = function(status) {
    activeStatusFilter = status;
    loadInbox();
};

window.filterByType = function(type) {
    activeTypeFilter = activeTypeFilter === type ? '' : type;
    loadInbox();
};

// -- Item list --

function renderInboxList(items) {
    const container = document.getElementById('inbox-list');

    // Apply client-side type filter
    let filtered = items;
    if (activeTypeFilter) {
        filtered = items.filter(i => i.type === activeTypeFilter);
    }

    if (filtered.length === 0) {
        container.innerHTML = '<p class="empty-state">No inbox items</p>';
        resetPreview();
        return;
    }

    // Sort: newest first
    filtered.sort((a, b) => (b.id || 0) - (a.id || 0));

    container.innerHTML = filtered.map(item => {
        const isSelected = item.id === selectedItemId;
        const statusClass = `inbox-status-badge inbox-status-${item.status || 'new'}`;
        const classification = item.classification
            ? `<span class="inbox-class-badge inbox-class-${item.classification}">${escapeHtml(item.classification)}</span>`
            : '<span class="inbox-class-badge inbox-class-none">?</span>';

        return `
            <div class="file-item${isSelected ? ' selected' : ''}"
                 onclick="selectItem(${item.id})"
                 data-id="${item.id}">
                <div class="file-item-name">${escapeHtml(item.title || 'Untitled')}</div>
                <div class="file-item-meta">
                    <span class="${statusClass}">${escapeHtml(item.status || 'new')}</span>
                    ${classification}
                    <span class="inbox-type-label">${escapeHtml((item.type || '').replace('_', ' '))}</span>
                    <span class="inbox-date-label">${escapeHtml(item.created || '')}</span>
                </div>
            </div>
        `;
    }).join('');

    // Auto-select first item if nothing selected
    if (!selectedItemId && filtered.length > 0) {
        selectItem(filtered[0].id);
    }
}

function resetPreview() {
    document.getElementById('preview-header').innerHTML =
        '<span class="preview-placeholder">Select an item to preview</span>';
    document.getElementById('preview-content').innerHTML =
        '<p class="preview-empty">Click an item on the left to see its content here</p>';
    document.getElementById('classify-card').style.display = 'none';
    selectedItemId = null;
    selectedItemData = null;
}

window.selectItem = async function(itemId) {
    selectedItemId = itemId;

    // Update selection styling
    document.querySelectorAll('#inbox-list .file-item').forEach(el => {
        el.classList.toggle('selected', parseInt(el.dataset.id) === itemId);
    });

    const headerEl = document.getElementById('preview-header');
    const contentEl = document.getElementById('preview-content');
    contentEl.innerHTML = '<p class="empty-state">Loading...</p>';

    try {
        const res = await fetch(`/api/inbox/${itemId}`);
        if (!res.ok) {
            contentEl.innerHTML = '<p class="empty-state">Failed to load item</p>';
            return;
        }
        const item = await res.json();
        selectedItemData = item;

        headerEl.innerHTML = `
            <span class="preview-filename">${escapeHtml(item.title || 'Untitled')}</span>
            <span class="inbox-meta-header">
                <span class="inbox-type-label">${escapeHtml((item.type || '').replace('_', ' '))}</span>
                <span class="inbox-date-label">${escapeHtml(item.created || '')}</span>
            </span>
        `;

        contentEl.innerHTML = item.content_html || '<p class="empty-state">No content</p>';
        contentEl.scrollTop = 0;

        // Show and populate classification panel
        const classifyCard = document.getElementById('classify-card');
        if (item.status !== 'archived') {
            classifyCard.style.display = '';
            populateClassifyPanel(item);
        } else {
            classifyCard.style.display = 'none';
        }
    } catch (err) {
        contentEl.innerHTML = `<p class="empty-state">Error: ${escapeHtml(err.message)}</p>`;
    }
};

// -- Classification panel --

function initClassifyPanel() {
    // Confidence buttons
    document.querySelectorAll('.confidence-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedConfidence = btn.dataset.value;
            document.querySelectorAll('.confidence-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Save classification
    document.getElementById('save-classify-btn').addEventListener('click', saveClassification);

    // Archive
    document.getElementById('archive-btn').addEventListener('click', archiveItem);
}

function populateClassifyPanel(item) {
    document.getElementById('classify-select').value = item.classification || '';
    const routing = item.routing || {};
    document.getElementById('route-skill-select').value = routing.target_skill || '';
    document.getElementById('route-folder-input').value = routing.target_folder || '';

    selectedConfidence = routing.confidence || null;
    document.querySelectorAll('.confidence-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === selectedConfidence);
    });
}

async function saveClassification() {
    if (!selectedItemId) return;

    const classification = document.getElementById('classify-select').value;
    if (!classification) {
        alert('Select a classification first');
        return;
    }

    const targetSkill = document.getElementById('route-skill-select').value || null;
    const targetFolder = document.getElementById('route-folder-input').value.trim() || null;

    try {
        const res = await fetch(`/api/inbox/${selectedItemId}/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                classification,
                target_skill: targetSkill,
                target_folder: targetFolder,
                confidence: selectedConfidence,
            }),
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
            loadInbox();
            updateNavBadge();
        } else {
            alert(data.error || 'Failed to save classification');
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function archiveItem() {
    if (!selectedItemId) return;
    if (!confirm('Archive this item? The file will be moved to .archive/')) return;

    try {
        const res = await fetch(`/api/inbox/${selectedItemId}/archive`, {
            method: 'POST',
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
            selectedItemId = null;
            selectedItemData = null;
            loadInbox();
            resetPreview();
            updateNavBadge();
        } else {
            alert(data.error || 'Failed to archive item');
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// -- Quick Add Modal --

function initModal() {
    const modal = document.getElementById('quick-add-modal');
    const openBtn = document.getElementById('quick-add-btn');
    const closeBtn = document.getElementById('modal-close');
    const cancelBtn = document.getElementById('modal-cancel');
    const submitBtn = document.getElementById('modal-submit');

    openBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
        document.getElementById('add-title').value = '';
        document.getElementById('add-content').value = '';
        document.getElementById('add-type').value = 'quick_note';
        document.getElementById('add-title').focus();
    });

    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    submitBtn.addEventListener('click', submitQuickAdd);
}

async function submitQuickAdd() {
    const title = document.getElementById('add-title').value.trim();
    const content = document.getElementById('add-content').value.trim();
    const itemType = document.getElementById('add-type').value;

    if (!title) { alert('Title is required'); return; }
    if (!content) { alert('Content is required'); return; }

    const submitBtn = document.getElementById('modal-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';

    try {
        const res = await fetch('/api/inbox/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content, type: itemType }),
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
            document.getElementById('quick-add-modal').style.display = 'none';
            selectedItemId = data.item.id;
            loadInbox();
            updateNavBadge();
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

// -- Nav badge helper --

async function updateNavBadge() {
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

function escapeAttr(s) {
    if (!s) return '';
    return s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
