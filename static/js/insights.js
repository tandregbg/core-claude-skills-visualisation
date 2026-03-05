/**
 * insights.js -- Insights page: toggle badges, tag cloud, pivot heatmap, charts, list
 */

let timelineChartInstance = null;
let typeChartInstance = null;

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
let activeTags = new Set();
let allTagCounts = {};
let showAllTags = false;
const TOP_TAGS_COUNT = 15;
const PIVOT_MAX_COLS = 15;

document.addEventListener('DOMContentLoaded', () => {
    renderTypeBadges({});
    loadInsights();
    window.addEventListener('folder-change', loadInsights);
    window.addEventListener('privacy-change', loadInsights);
    document.getElementById('status-filter').addEventListener('change', loadInsights);
    document.getElementById('tag-show-all').addEventListener('click', () => {
        showAllTags = !showAllTags;
        renderTagCloud(allTagCounts);
    });
});

function debounce(fn, ms) {
    let timer;
    return function () {
        clearTimeout(timer);
        timer = setTimeout(fn, ms);
    };
}

async function loadInsights() {
    const params = new URLSearchParams();
    const folder = currentFolder;
    if (folder && folder !== 'all') params.set('project', folder);

    // Send active types as comma-separated (only if not all active)
    if (activeTypes.size < INSIGHT_TYPES.length && activeTypes.size > 0) {
        params.set('type', Array.from(activeTypes).join(','));
    } else if (activeTypes.size === 0) {
        // All deactivated -- show nothing
        renderEmpty();
        return;
    }

    const statusFilter = document.getElementById('status-filter').value;
    if (statusFilter !== 'all') params.set('status', statusFilter);

    try {
        const res = await fetch(`/api/insights?${params.toString()}`);
        const data = await res.json();

        let insights = data.insights;

        // Client-side tag filtering (AND logic)
        if (activeTags.size > 0) {
            insights = insights.filter(i =>
                Array.from(activeTags).every(tag =>
                    (i.tags || []).includes(tag)
                )
            );
        }

        // Store tag counts for cloud rendering
        allTagCounts = data.tag_counts || {};

        renderTypeBadges(data.type_counts || {});
        renderTagCloud(allTagCounts);
        renderPivotTable(data.type_tag_matrix || {}, allTagCounts);
        renderStats(data, insights.length);
        renderTimelineChart(data.monthly);
        renderTypeChart(data.type_counts);
        renderInsightsList(insights);
    } catch (err) {
        console.error('Failed to load insights:', err);
    }
}

function renderEmpty() {
    renderTypeBadges({});
    renderTagCloud({});
    renderPivotTable({}, {});
    document.getElementById('stat-total').textContent = '0';
    document.getElementById('stat-top1-label').textContent = '--';
    document.getElementById('stat-top1-value').textContent = '0';
    document.getElementById('stat-top2-label').textContent = '--';
    document.getElementById('stat-top2-value').textContent = '0';
    document.getElementById('stat-this-month').textContent = '0';
    document.getElementById('insights-list').innerHTML = '<p class="empty-state">No insights found</p>';
    document.getElementById('insights-count').textContent = '';
    if (timelineChartInstance) { timelineChartInstance.destroy(); timelineChartInstance = null; }
    if (typeChartInstance) { typeChartInstance.destroy(); typeChartInstance = null; }
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
    loadInsights();
};

// -- Tag cloud --

function renderTagCloud(tagCounts) {
    const container = document.getElementById('tag-cloud');
    const showAllBtn = document.getElementById('tag-show-all');

    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        container.innerHTML = '<span class="empty-state" style="padding:8px 0;">No tags</span>';
        showAllBtn.style.display = 'none';
        return;
    }

    const visible = showAllTags ? sorted : sorted.slice(0, TOP_TAGS_COUNT);
    const hasMore = sorted.length > TOP_TAGS_COUNT;

    showAllBtn.style.display = hasMore ? 'inline-block' : 'none';
    showAllBtn.textContent = showAllTags ? 'Show less' : `Show all (${sorted.length})`;

    container.innerHTML = visible.map(([tag, count]) => {
        const isActive = activeTags.has(tag);
        return `<button class="tag-cloud-pill${isActive ? ' active' : ''}"
                    onclick="toggleTag('${escapeHtml(tag)}')"
                    title="${count} insight${count !== 1 ? 's' : ''}">
                    ${escapeHtml(tag)}
                    <span class="tag-cloud-count">${count}</span>
                </button>`;
    }).join('');
}

window.toggleTag = function(tag) {
    if (activeTags.has(tag)) {
        activeTags.delete(tag);
    } else {
        activeTags.add(tag);
    }
    loadInsights();
};

// -- Pivot heatmap --

function renderPivotTable(matrix, tagCounts) {
    const container = document.getElementById('type-tag-pivot');

    // Get top tags by frequency
    const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, PIVOT_MAX_COLS)
        .map(e => e[0]);

    if (topTags.length === 0) {
        container.innerHTML = '<p class="empty-state">No data for pivot</p>';
        return;
    }

    // Only show types that are currently active
    const visibleTypes = INSIGHT_TYPES.filter(t => activeTypes.has(t));

    // Find max value for intensity scaling
    let maxVal = 0;
    for (const type of visibleTypes) {
        for (const tag of topTags) {
            const val = (matrix[type] || {})[tag] || 0;
            if (val > maxVal) maxVal = val;
        }
    }

    let html = '<table class="pivot-table"><thead><tr><th></th>';
    html += topTags.map(tag => `<th class="pivot-col-header" title="${escapeHtml(tag)}">${escapeHtml(truncate(tag, 12))}</th>`).join('');
    html += '</tr></thead><tbody>';

    for (const type of visibleTypes) {
        const colors = INSIGHT_TYPE_COLORS[type];
        html += `<tr><td class="pivot-row-header"><span class="insight-badge insight-${type}">${type}</span></td>`;
        for (const tag of topTags) {
            const val = (matrix[type] || {})[tag] || 0;
            const opacity = maxVal > 0 ? Math.max(0.08, val / maxVal) : 0;
            const cellStyle = val > 0
                ? `background:${colors.chart};opacity:1;`
                : '';
            const innerStyle = val > 0
                ? `background:rgba(255,255,255,${1 - opacity * 0.85});`
                : '';
            html += `<td class="pivot-cell${val > 0 ? ' pivot-cell-filled' : ''}"
                        style="${cellStyle}"
                        onclick="pivotClick('${type}','${escapeHtml(tag)}')"
                        title="${type} + ${tag}: ${val}">
                        <span class="pivot-cell-inner" style="${innerStyle}">${val || ''}</span>
                    </td>`;
        }
        html += '</tr>';
    }

    html += '</tbody></table>';
    container.innerHTML = html;
}

window.pivotClick = function(type, tag) {
    // Set type filter to only this type
    activeTypes.clear();
    activeTypes.add(type);

    // Toggle this tag
    activeTags.clear();
    activeTags.add(tag);

    loadInsights();
};

function truncate(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

// -- Stats --

function renderStats(data, filteredCount) {
    document.getElementById('stat-total').textContent = filteredCount;
    document.getElementById('stat-this-month').textContent = data.this_month || 0;

    // Dynamic top-2 types
    const typeCounts = data.type_counts || {};
    const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

    const top1 = sorted[0];
    const top2 = sorted[1];

    const top1Card = document.getElementById('stat-top1-card');
    const top2Card = document.getElementById('stat-top2-card');

    if (top1) {
        const colors = INSIGHT_TYPE_COLORS[top1[0]] || INSIGHT_TYPE_COLORS.pattern;
        document.getElementById('stat-top1-label').textContent = top1[0].charAt(0).toUpperCase() + top1[0].slice(1) + 's';
        document.getElementById('stat-top1-value').textContent = top1[1];
        top1Card.style.borderLeftColor = colors.chart;
    } else {
        document.getElementById('stat-top1-label').textContent = '--';
        document.getElementById('stat-top1-value').textContent = '0';
    }

    if (top2) {
        const colors = INSIGHT_TYPE_COLORS[top2[0]] || INSIGHT_TYPE_COLORS.pattern;
        document.getElementById('stat-top2-label').textContent = top2[0].charAt(0).toUpperCase() + top2[0].slice(1) + 's';
        document.getElementById('stat-top2-value').textContent = top2[1];
        top2Card.style.borderLeftColor = colors.chart;
    } else {
        document.getElementById('stat-top2-label').textContent = '--';
        document.getElementById('stat-top2-value').textContent = '0';
    }

    const countEl = document.getElementById('insights-count');
    if (countEl) {
        countEl.textContent = filteredCount + ' insight' + (filteredCount !== 1 ? 's' : '');
    }
}

// -- Timeline chart --

function renderTimelineChart(monthly) {
    const ctx = document.getElementById('insights-timeline-chart');
    if (!ctx) return;

    if (timelineChartInstance) timelineChartInstance.destroy();

    if (!monthly || monthly.length === 0) {
        timelineChartInstance = null;
        return;
    }

    const labels = monthly.map(m => m.month);

    const allTypes = new Set();
    monthly.forEach(m => Object.keys(m.counts).forEach(t => allTypes.add(t)));

    const datasets = Array.from(allTypes)
        .filter(t => activeTypes.has(t))
        .map(type => {
            const colors = INSIGHT_TYPE_COLORS[type] || INSIGHT_TYPE_COLORS.pattern;
            return {
                label: type,
                data: monthly.map(m => m.counts[type] || 0),
                backgroundColor: colors.chart,
                borderRadius: 3,
            };
        });

    timelineChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 10, padding: 8, font: { size: 10 } }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: { font: { size: 10 } },
                    grid: { display: false }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { stepSize: 1, font: { size: 11 } },
                    grid: { color: '#f3f4f6' }
                }
            }
        }
    });
}

// -- Type doughnut --

function renderTypeChart(typeCounts) {
    const ctx = document.getElementById('insights-type-chart');
    if (!ctx) return;

    if (typeChartInstance) typeChartInstance.destroy();

    // Only show active types
    const entries = Object.entries(typeCounts || {}).filter(([t]) => activeTypes.has(t));
    if (entries.length === 0) {
        typeChartInstance = null;
        return;
    }

    const labels = entries.map(e => e[0]);
    const data = entries.map(e => e[1]);
    const colors = labels.map(l => (INSIGHT_TYPE_COLORS[l] || INSIGHT_TYPE_COLORS.pattern).chart);

    typeChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderWidth: 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { boxWidth: 10, padding: 8, font: { size: 10 } }
                }
            }
        }
    });
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
        '<th>Type</th><th>Date</th><th>Summary</th><th>Context</th><th>Tags</th><th>Source</th>' +
        '</tr></thead><tbody>' +
        insights.map(i => {
            const typeClass = `insight-badge insight-${i.type}`;
            const tags = (i.tags || []).map(t => {
                const isActive = activeTags.has(t);
                return `<span class="tag-badge${isActive ? ' tag-badge-active' : ''}" onclick="toggleTag('${escapeHtml(t)}')" style="cursor:pointer;">${escapeHtml(t)}</span>`;
            }).join(' ');

            const sourceLink = i.obsidian_link
                ? `<a href="${escapeHtml(i.obsidian_link)}" class="detail-link" title="Open in Obsidian">${escapeHtml((i.source && i.source.file) || '')}</a>`
                : escapeHtml((i.source && i.source.file) || '');

            return `
                <tr>
                    <td><span class="${typeClass}">${escapeHtml(i.type)}</span></td>
                    <td style="white-space: nowrap; font-variant-numeric: tabular-nums;">${escapeHtml(i.date)}</td>
                    <td>
                        <div class="insight-summary">${escapeHtml(i.summary)}</div>
                        ${i.rationale ? `<div class="insight-rationale">${escapeHtml(i.rationale)}</div>` : ''}
                    </td>
                    <td><span class="project-badge project-${i.project}">${escapeHtml(i.context || i.project)}</span></td>
                    <td>${tags}</td>
                    <td style="font-size: 11px;">${sourceLink}</td>
                </tr>
            `;
        }).join('') +
        '</tbody></table>';
}
