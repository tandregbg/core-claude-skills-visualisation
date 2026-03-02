/**
 * activity.js -- Activity page: domain/type charts, trend, recent files
 */

let domainChartInstance = null;
let typeChartInstance = null;
let trendChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    loadActivity();
    window.addEventListener('folder-change', loadActivity);
    window.addEventListener('privacy-change', loadActivity);
});

async function loadActivity() {
    const params = getApiParams();

    try {
        const [activityRes, filesRes] = await Promise.all([
            fetch(`/api/activity?${params}`),
            fetch(`/api/files?${params}`)
        ]);

        const activity = await activityRes.json();
        const files = await filesRes.json();

        renderHeatmap(activity.daily_counts);
        renderDomainChart(activity.domain_counts);
        renderTypeChart(activity.type_counts);
        renderTrendChart(activity.weekly_counts);
        renderRecentFiles(files);
    } catch (err) {
        console.error('Failed to load activity:', err);
    }
}

function renderDomainChart(domainCounts) {
    const ctx = document.getElementById('domain-chart');
    if (!ctx) return;

    if (domainChartInstance) domainChartInstance.destroy();

    // Sort by count descending
    const entries = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(e => e[0]);
    const data = entries.map(e => e[1]);

    // Generate colors
    const palette = [
        '#3b82f6', '#22c55e', '#f97316', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#eab308', '#14b8a6', '#6366f1',
        '#f43f5e', '#84cc16', '#a855f7', '#0ea5e9',
    ];
    const colors = labels.map((_, i) => palette[i % palette.length]);

    domainChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Files',
                data: data,
                backgroundColor: colors,
                borderRadius: 4,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, font: { size: 11 } },
                    grid: { color: '#f3f4f6' }
                },
                y: {
                    ticks: { font: { size: 10 } },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderTypeChart(typeCounts) {
    const ctx = document.getElementById('type-chart');
    if (!ctx) return;

    if (typeChartInstance) typeChartInstance.destroy();

    const labels = Object.keys(typeCounts);
    const data = Object.values(typeCounts);
    const palette = [
        '#3b82f6', '#22c55e', '#f97316', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#eab308', '#14b8a6', '#6366f1',
    ];
    const colors = labels.map((_, i) => palette[i % palette.length]);

    typeChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
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

function renderTrendChart(weeklyCounts) {
    const ctx = document.getElementById('trend-chart');
    if (!ctx) return;

    if (trendChartInstance) trendChartInstance.destroy();

    const labels = weeklyCounts.map(w => w.week);
    const data = weeklyCounts.map(w => w.count);

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Files per week',
                data: data,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                pointBackgroundColor: '#3b82f6',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, font: { size: 11 } },
                    grid: { color: '#f3f4f6' }
                },
                x: {
                    ticks: { font: { size: 10 } },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderRecentFiles(files) {
    const container = document.getElementById('recent-files');
    if (!container) return;

    if (files.length === 0) {
        container.innerHTML = '<p class="empty-state">No files found</p>';
        return;
    }

    container.innerHTML = '<table class="data-table"><thead><tr>' +
        '<th>Date</th><th>Project</th><th>File</th><th>Domain</th>' +
        '</tr></thead><tbody>' +
        files.map(f => `
            <tr class="clickable-row" onclick="window.open('${escapeHtml(f.obsidian_link)}', '_self')">
                <td style="white-space: nowrap; font-variant-numeric: tabular-nums;">${f.date || ''}</td>
                <td><span class="project-badge project-${f.project}">${f.project}</span></td>
                <td>${escapeHtml(f.filename)}</td>
                <td style="color: var(--cs-on-surface-tertiary);">${f.domain}</td>
            </tr>
        `).join('') +
        '</tbody></table>';
}
