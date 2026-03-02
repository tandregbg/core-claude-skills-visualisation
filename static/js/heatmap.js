/**
 * heatmap.js -- GitHub-style calendar heatmap using CSS grid
 */

function renderHeatmap(dailyCounts) {
    const container = document.getElementById('heatmap');
    if (!container) return;

    const today = new Date();
    const oneDay = 86400000;
    const daysToShow = 365;

    // Start from 364 days ago
    const startDate = new Date(today.getTime() - (daysToShow - 1) * oneDay);

    // Adjust to start on a Sunday
    const startDow = startDate.getDay();
    const adjustedStart = new Date(startDate.getTime() - startDow * oneDay);

    // Calculate total days from adjusted start to today
    const totalDays = Math.ceil((today.getTime() - adjustedStart.getTime()) / oneDay) + 1;
    const totalWeeks = Math.ceil(totalDays / 7);

    // Find max count for intensity scaling
    const counts = Object.values(dailyCounts);
    const maxCount = Math.max(1, ...counts);

    // Build month labels
    const monthLabels = [];
    let lastMonth = -1;

    // Build grid cells
    let html = '<div class="heatmap-months">';

    // Month labels row
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let currentWeek = 0;
    for (let w = 0; w < totalWeeks; w++) {
        const weekStart = new Date(adjustedStart.getTime() + w * 7 * oneDay);
        const month = weekStart.getMonth();
        if (month !== lastMonth) {
            monthLabels.push({ week: w, label: monthNames[month] });
            lastMonth = month;
        }
    }

    // Render month labels
    html += '<div class="heatmap-month-row" style="display:grid;grid-template-columns:repeat(' + totalWeeks + ',13px);gap:2px;margin-left:20px;margin-bottom:2px;">';
    let labelIdx = 0;
    for (let w = 0; w < totalWeeks; w++) {
        if (labelIdx < monthLabels.length && monthLabels[labelIdx].week === w) {
            html += `<div class="text-xs text-gray-400" style="grid-column:${w + 1}">${monthLabels[labelIdx].label}</div>`;
            labelIdx++;
        }
    }
    html += '</div>';

    // Day labels
    const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

    html += '<div style="display:flex;">';
    // Day of week labels
    html += '<div style="display:grid;grid-template-rows:repeat(7,13px);gap:2px;margin-right:4px;">';
    for (let d = 0; d < 7; d++) {
        html += `<div class="text-xs text-gray-400" style="line-height:13px;text-align:right;">${dayLabels[d]}</div>`;
    }
    html += '</div>';

    // Cells grid
    html += `<div style="display:grid;grid-template-columns:repeat(${totalWeeks},13px);grid-template-rows:repeat(7,13px);gap:2px;">`;

    for (let w = 0; w < totalWeeks; w++) {
        for (let d = 0; d < 7; d++) {
            const cellDate = new Date(adjustedStart.getTime() + (w * 7 + d) * oneDay);
            const dateStr = cellDate.toISOString().slice(0, 10);
            const count = dailyCounts[dateStr] || 0;

            // Skip future dates
            if (cellDate > today) {
                html += '<div></div>';
                continue;
            }

            // Intensity level (0-4)
            let level = 0;
            if (count > 0) {
                const ratio = count / maxCount;
                if (ratio <= 0.25) level = 1;
                else if (ratio <= 0.5) level = 2;
                else if (ratio <= 0.75) level = 3;
                else level = 4;
            }

            html += `<div class="heatmap-cell level-${level}" title="${dateStr}: ${count} file${count !== 1 ? 's' : ''}" style="grid-column:${w + 1};grid-row:${d + 1};"></div>`;
        }
    }

    html += '</div></div></div>';
    container.innerHTML = html;
}
