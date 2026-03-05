/**
 * insights.js -- Insights page: toggle badges, context cloud, pivot heatmap, detail table
 */

const INSIGHT_TYPES = ['decision', 'preference', 'learning', 'opportunity', 'pattern'];

const INSIGHT_TYPE_COLORS = {
    decision:    { bg: '#dbeafe', text: '#1e40af', chart: '#3b82f6', border: '#3b82f6' },
    preference:  { bg: '#ede9fe', text: '#5b21b6', chart: '#8b5cf6', border: '#8b5cf6' },
    learning:    { bg: '#dcfce7', text: '#166534', chart: '#22c55e', border: '#22c55e' },
    opportunity: { bg: '#fef3c7', text: '#92400e', chart: '#f59e0b', border: '#f59e0b' },
    pattern:     { bg: '#f3f4f6', text: '#374151', chart: '#6b7280', border: '#6b7280' },
};

// State
let activeTypes = new Set(INSIGHT_TYPES);
let activeContexts = new Set();
let allContextCounts = {};
let lastInsights = [];
let showAllContexts = false;
let pivotSelection = null; // {type, context} or null
const TOP_CONTEXTS_COUNT = 15;
const PIVOT_MAX_COLS = 15;

document.addEventListener('DOMContentLoaded', () => {
    renderTypeBadges({});
    loadInsights();
    window.addEventListener('folder-change', loadInsights);
    window.addEventListener('privacy-change', loadInsights);
    document.getElementById('status-filter').addEventListener('change', loadInsights);
    document.getElementById('context-show-all').addEventListener('click', () => {
        showAllContexts = !showAllContexts;
        renderContextCloud(allContextCounts);
    });
    document.getElementById('insights-list-close').addEventListener('click', () => {
        pivotSelection = null;
        document.getElementById('insights-list-card').style.display = 'none';
        renderPivotHighlight();
    });
});

async function loadInsights() {
    const params = new URLSearchParams();
    const folder = currentFolder;
    if (folder && folder !== 'all') params.set('project', folder);

    if (activeTypes.size < INSIGHT_TYPES.length && activeTypes.size > 0) {
        params.set('type', Array.from(activeTypes).join(','));
    } else if (activeTypes.size === 0) {
        renderEmpty();
        return;
    }

    const statusFilter = document.getElementById('status-filter').value;
    if (statusFilter !== 'all') params.set('status', statusFilter);

    try {
        const res = await fetch(`/api/insights?${params.toString()}`);
        const data = await res.json();

        let insights = data.insights;

        // Client-side context filtering (OR logic -- show insights from any selected context)
        if (activeContexts.size > 0) {
            insights = insights.filter(i =>
                activeContexts.has(i.context || i.project)
            );
        }

        lastInsights = insights;
        allContextCounts = data.context_counts || {};

        renderTypeBadges(data.type_counts || {});
        renderContextCloud(allContextCounts);
        renderPivotTable(data.type_context_matrix || {}, allContextCounts);
        renderInsightsCount(insights.length);

        if (pivotSelection) {
            showPivotDetail(pivotSelection.type, pivotSelection.context);
        }
    } catch (err) {
        console.error('Failed to load insights:', err);
    }
}

function renderEmpty() {
    renderTypeBadges({});
    renderContextCloud({});
    renderPivotTable({}, {});
    renderInsightsCount(0);
    document.getElementById('insights-list-card').style.display = 'none';
}

function renderInsightsCount(count) {
    const el = document.getElementById('insights-count');
    if (el) el.textContent = count + ' insight' + (count !== 1 ? 's' : '');
}

// -- Type toggle badges --

function renderTypeBadges(typeCounts) {
    const container = document.getElementById('type-badges');
    container.innerHTML = INSIGHT_TYPES.map(type => {
        const colors = INSIGHT_TYPE_COLORS[type];
        const count = typeCounts[type] || 0;
        const isActive = activeTypes.has(type);
        return `<button class="day-badge insight-type-badge${isActive ? ' active' : ''}"
                    data-type="${type}"
                    style="${isActive
                        ? `background:${colors.border};border-color:${colors.border};color:#fff;`
                        : `border-color:${colors.border};color:${colors.text};background:transparent;`}"
                    onclick="toggleType('${type}')">
                    <span class="day-badge-label">${type}</span>
                    <span class="day-badge-count" style="${isActive
                        ? 'background:rgba(255,255,255,0.25);color:#fff;'
                        : `background:${colors.bg};color:${colors.text};`}">${count}</span>
                </button>`;
    }).join('');
}

window.toggleType = function(type) {
    if (activeTypes.has(type)) {
        activeTypes.delete(type);
    } else {
        activeTypes.add(type);
    }
    pivotSelection = null;
    document.getElementById('insights-list-card').style.display = 'none';
    loadInsights();
};

// -- Context cloud --

function renderContextCloud(contextCounts) {
    const container = document.getElementById('context-cloud');
    const showAllBtn = document.getElementById('context-show-all');

    const sorted = Object.entries(contextCounts).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        container.innerHTML = '<span class="empty-state" style="padding:8px 0;">No contexts</span>';
        showAllBtn.style.display = 'none';
        return;
    }

    const visible = showAllContexts ? sorted : sorted.slice(0, TOP_CONTEXTS_COUNT);
    const hasMore = sorted.length > TOP_CONTEXTS_COUNT;

    showAllBtn.style.display = hasMore ? 'inline-block' : 'none';
    showAllBtn.textContent = showAllContexts ? 'Show less' : `Show all (${sorted.length})`;

    container.innerHTML = visible.map(([ctx, count]) => {
        const isActive = activeContexts.has(ctx);
        return `<button class="tag-cloud-pill${isActive ? ' active' : ''}"
                    onclick="toggleContext('${escapeHtml(ctx)}')"
                    title="${count} insight${count !== 1 ? 's' : ''}">
                    ${escapeHtml(ctx)}
                    <span class="tag-cloud-count">${count}</span>
                </button>`;
    }).join('');
}

window.toggleContext = function(ctx) {
    if (activeContexts.has(ctx)) {
        activeContexts.delete(ctx);
    } else {
        activeContexts.add(ctx);
    }
    pivotSelection = null;
    document.getElementById('insights-list-card').style.display = 'none';
    loadInsights();
};

// -- Pivot heatmap (type x context) --

function renderPivotTable(matrix, contextCounts) {
    const container = document.getElementById('type-tag-pivot');

    const topContexts = Object.entries(contextCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, PIVOT_MAX_COLS)
        .map(e => e[0]);

    if (topContexts.length === 0) {
        container.innerHTML = '<p class="empty-state">No data for pivot</p>';
        return;
    }

    const visibleTypes = INSIGHT_TYPES.filter(t => activeTypes.has(t));

    let maxVal = 0;
    for (const type of visibleTypes) {
        for (const ctx of topContexts) {
            const val = (matrix[type] || {})[ctx] || 0;
            if (val > maxVal) maxVal = val;
        }
    }

    let html = '<table class="pivot-table"><thead><tr><th class="pivot-row-header"></th>';
    html += topContexts.map(ctx => `<th class="pivot-col-header" title="${escapeHtml(ctx)}">${escapeHtml(ctx)}</th>`).join('');
    html += '</tr></thead><tbody>';

    for (const type of visibleTypes) {
        const colors = INSIGHT_TYPE_COLORS[type];
        html += `<tr><td class="pivot-row-header"><span class="insight-badge insight-${type}">${type}</span></td>`;
        for (const ctx of topContexts) {
            const val = (matrix[type] || {})[ctx] || 0;
            const opacity = maxVal > 0 ? Math.max(0.08, val / maxVal) : 0;
            const isSelected = pivotSelection && pivotSelection.type === type && pivotSelection.context === ctx;
            const cellStyle = val > 0
                ? `background:${colors.chart};`
                : '';
            const innerStyle = val > 0
                ? `background:rgba(255,255,255,${1 - opacity * 0.85});`
                : '';
            html += `<td class="pivot-cell${val > 0 ? ' pivot-cell-filled' : ''}${isSelected ? ' pivot-cell-selected' : ''}"
                        style="${cellStyle}"
                        onclick="pivotClick('${type}','${escapeAttr(ctx)}')"
                        title="${type} + ${ctx}: ${val}">
                        <span class="pivot-cell-inner" style="${innerStyle}">${val || ''}</span>
                    </td>`;
        }
        html += '</tr>';
    }

    html += '</tbody></table>';
    container.innerHTML = html;
}

function escapeAttr(s) {
    return s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function renderPivotHighlight() {
    document.querySelectorAll('.pivot-cell').forEach(cell => {
        cell.classList.remove('pivot-cell-selected');
    });
}

window.pivotClick = function(type, ctx) {
    // If clicking the same cell, deselect
    if (pivotSelection && pivotSelection.type === type && pivotSelection.context === ctx) {
        pivotSelection = null;
        document.getElementById('insights-list-card').style.display = 'none';
        renderPivotHighlight();
        return;
    }

    pivotSelection = { type, context: ctx };
    showPivotDetail(type, ctx);

    // Update highlight
    document.querySelectorAll('.pivot-cell').forEach(cell => {
        cell.classList.remove('pivot-cell-selected');
    });
    // Match by title prefix
    const prefix = `${type} + ${ctx}:`;
    document.querySelectorAll('.pivot-cell').forEach(cell => {
        if (cell.title.startsWith(prefix)) {
            cell.classList.add('pivot-cell-selected');
        }
    });
};

function showPivotDetail(type, ctx) {
    const filtered = lastInsights.filter(i =>
        i.type === type && (i.context || i.project) === ctx
    );

    const card = document.getElementById('insights-list-card');
    const titleEl = document.getElementById('insights-list-title');

    titleEl.innerHTML = `<span class="insight-badge insight-${type}">${type}</span> + <span class="project-badge">${escapeHtml(ctx)}</span> <span class="file-count-label">${filtered.length} insight${filtered.length !== 1 ? 's' : ''}</span>`;

    renderInsightsList(filtered);
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// -- Insights list --

function renderInsightsList(insights) {
    const container = document.getElementById('insights-list');
    if (!container) return;

    if (insights.length === 0) {
        container.innerHTML = '<p class="empty-state">No insights found</p>';
        return;
    }

    container.innerHTML = '<table class="data-table"><thead><tr>' +
        '<th>Date</th><th>Summary</th><th>Tags</th><th>Source</th>' +
        '</tr></thead><tbody>' +
        insights.map(i => {
            const tags = (i.tags || []).map(t =>
                `<span class="tag-badge">${escapeHtml(t)}</span>`
            ).join(' ');

            const sourceLink = i.obsidian_link
                ? `<a href="${escapeHtml(i.obsidian_link)}" class="detail-link" title="Open in Obsidian">${escapeHtml((i.source && i.source.file) || '')}</a>`
                : escapeHtml((i.source && i.source.file) || '');

            return `
                <tr>
                    <td style="white-space: nowrap; font-variant-numeric: tabular-nums;">${escapeHtml(i.date)}</td>
                    <td>
                        <div class="insight-summary">${escapeHtml(i.summary)}</div>
                        ${i.rationale ? `<div class="insight-rationale">${escapeHtml(i.rationale)}</div>` : ''}
                    </td>
                    <td>${tags}</td>
                    <td style="font-size: 11px;">${sourceLink}</td>
                </tr>
            `;
        }).join('') +
        '</tbody></table>';
}
