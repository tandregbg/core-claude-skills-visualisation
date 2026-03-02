/**
 * charts.js -- Chart.js initialization for dashboard charts
 */

let priorityChartInstance = null;
let projectChartInstance = null;

function renderPriorityChart(priorityCounts) {
    const ctx = document.getElementById('priority-chart');
    if (!ctx) return;

    if (priorityChartInstance) {
        priorityChartInstance.destroy();
    }

    const labels = ['P0 Critical', 'P1 High', 'P2 Important', 'P3 Research'];
    const data = [
        priorityCounts.P0 || 0,
        priorityCounts.P1 || 0,
        priorityCounts.P2 || 0,
        priorityCounts.P3 || 0,
    ];
    const colors = [
        PRIORITY_COLORS.P0,
        PRIORITY_COLORS.P1,
        PRIORITY_COLORS.P2,
        PRIORITY_COLORS.P3,
    ];

    priorityChartInstance = new Chart(ctx, {
        type: 'doughnut',
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
                    position: 'bottom',
                    labels: { boxWidth: 12, padding: 12, font: { size: 11 } }
                }
            },
            cutout: '60%',
        }
    });
}

function renderProjectChart(projectCounts) {
    const ctx = document.getElementById('project-chart');
    if (!ctx) return;

    if (projectChartInstance) {
        projectChartInstance.destroy();
    }

    const labels = Object.keys(projectCounts);
    const data = Object.values(projectCounts);
    const colors = labels.map(l => getProjectColor(l, 'chart'));

    projectChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Active Tasks',
                data: data,
                backgroundColor: colors,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, font: { size: 11 } },
                    grid: { color: '#f3f4f6' }
                },
                x: {
                    ticks: { font: { size: 11 } },
                    grid: { display: false }
                }
            }
        }
    });
}
