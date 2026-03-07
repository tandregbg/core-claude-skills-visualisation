/**
 * synthesis.js -- Insight synthesis page
 */

document.addEventListener('DOMContentLoaded', () => {
    loadProjectOptions();
    loadSyntheses();
    loadProviderInfo();

    document.getElementById('run-synthesis-btn').addEventListener('click', runSynthesis);
});

async function loadProjectOptions() {
    try {
        const res = await fetch('/api/projects');
        const projects = await res.json();
        const select = document.getElementById('synth-project');
        for (const name of Object.keys(projects).sort()) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        }
    } catch (err) {
        console.error('Failed to load projects:', err);
    }
}

async function loadProviderInfo() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        const llm = data.llm || {};
        const provider = llm.provider || 'ollama';
        let model = '';
        if (provider === 'ollama') model = llm.ollama_model || '';
        else if (provider === 'anthropic') model = llm.anthropic_model || '';
        else if (provider === 'openai') model = llm.openai_model || '';

        const info = document.getElementById('synth-provider-info');
        info.textContent = `${provider}: ${model}`;
    } catch (err) {
        // ignore
    }
}

async function loadSyntheses() {
    try {
        const res = await fetch('/api/synthesis');
        const list = await res.json();

        const container = document.getElementById('synth-list');
        const countEl = document.getElementById('synth-list-count');
        countEl.textContent = list.length + ' saved';

        if (list.length === 0) {
            container.innerHTML = '<p class="empty-state">No syntheses yet. Run one above.</p>';
            return;
        }

        container.innerHTML = '<table class="data-table"><thead><tr>' +
            '<th>Date</th><th>Provider</th><th>Model</th><th>Insights</th><th>Patterns</th><th>Duration</th>' +
            '</tr></thead><tbody>' +
            list.map(s => `
                <tr class="clickable-row" onclick="viewSynthesis('${escapeHtml(s.id)}')">
                    <td style="white-space:nowrap;">${escapeHtml(s.timestamp.slice(0, 16).replace('T', ' '))}</td>
                    <td>${escapeHtml(s.provider)}</td>
                    <td>${escapeHtml(s.model)}</td>
                    <td style="text-align:right;">${s.input_count}</td>
                    <td style="text-align:right;">${s.pattern_count}</td>
                    <td style="text-align:right;">${s.duration_seconds}s</td>
                </tr>
            `).join('') +
            '</tbody></table>';
    } catch (err) {
        console.error('Failed to load syntheses:', err);
    }
}

async function runSynthesis() {
    const btn = document.getElementById('run-synthesis-btn');
    const statusMsg = document.getElementById('synth-status-msg');
    btn.disabled = true;
    btn.textContent = 'Running...';
    statusMsg.textContent = 'This may take 1-10 minutes (model cold start can be slow)...';
    statusMsg.style.color = '';

    const payload = {
        project: document.getElementById('synth-project').value,
        type: document.getElementById('synth-type').value,
        status: document.getElementById('synth-status').value,
    };

    try {
        const res = await fetch('/api/synthesis/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (!res.ok) {
            statusMsg.textContent = data.error || 'Synthesis failed';
            statusMsg.style.color = 'var(--cs-status-critical)';
            return;
        }

        statusMsg.textContent = `Done in ${data.duration_seconds}s`;
        statusMsg.style.color = 'var(--cs-status-success)';
        renderSynthesisResult(data);
        loadSyntheses();
    } catch (err) {
        statusMsg.textContent = 'Failed: ' + err.message;
        statusMsg.style.color = 'var(--cs-status-critical)';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Run Synthesis';
    }
}

async function viewSynthesis(id) {
    try {
        const res = await fetch(`/api/synthesis/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        renderSynthesisResult(data);
    } catch (err) {
        console.error('Failed to load synthesis:', err);
    }
}

function renderSynthesisResult(data) {
    const card = document.getElementById('synth-result-card');
    const title = document.getElementById('synth-result-title');
    const meta = document.getElementById('synth-result-meta');
    const content = document.getElementById('synth-result-content');

    card.style.display = '';
    title.textContent = `Synthesis ${data.id}`;
    meta.textContent = `${data.provider} / ${data.model} -- ${data.input_count} insights -- ${data.duration_seconds}s`;

    let html = '';

    // Patterns
    const patterns = data.patterns || [];
    if (patterns.length > 0) {
        html += '<h3 style="margin: var(--cs-spacing-lg) 0 var(--cs-spacing-md);">Patterns (' + patterns.length + ')</h3>';
        html += patterns.map((p, i) => `
            <div class="card" style="margin-bottom: var(--cs-spacing-md); padding: var(--cs-spacing-md);">
                <strong>${i + 1}. ${escapeHtml(p.title || 'Untitled')}</strong>
                <p style="margin-top: var(--cs-spacing-xs); color: var(--cs-on-surface-secondary);">${escapeHtml(p.description || '')}</p>
                ${(p.tags || []).length ? '<div style="margin-top: var(--cs-spacing-xs);">' + p.tags.map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join(' ') + '</div>' : ''}
                ${(p.supporting_insights || []).length ? '<div style="margin-top: var(--cs-spacing-xs); font-size: 11px; color: var(--cs-on-surface-tertiary);">Supporting: #' + p.supporting_insights.join(', #') + '</div>' : ''}
            </div>
        `).join('');
    }

    // Trends
    const trends = data.trends || [];
    if (trends.length > 0) {
        html += '<h3 style="margin: var(--cs-spacing-lg) 0 var(--cs-spacing-md);">Trends</h3>';
        html += '<ul style="margin: 0; padding-left: var(--cs-spacing-xl);">';
        html += trends.map(t => `<li style="margin-bottom: var(--cs-spacing-xs);">${escapeHtml(typeof t === 'string' ? t : JSON.stringify(t))}</li>`).join('');
        html += '</ul>';
    }

    // Meta analysis
    if (data.meta_analysis) {
        html += '<h3 style="margin: var(--cs-spacing-lg) 0 var(--cs-spacing-md);">Meta Analysis</h3>';
        html += `<p style="color: var(--cs-on-surface-secondary);">${escapeHtml(data.meta_analysis)}</p>`;
    }

    if (!html) {
        html = '<p class="empty-state">No patterns found in response</p>';
    }

    content.innerHTML = html;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
