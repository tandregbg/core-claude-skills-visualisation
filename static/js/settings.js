/**
 * settings.js -- Settings page logic
 */

let settingsData = null;
let dirty = false;

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initSettingsControls();
});

async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        settingsData = await res.json();
        renderSettings();
    } catch (err) {
        console.error('Failed to load settings:', err);
    }
}

function renderSettings() {
    if (!settingsData) return;

    // Vault config
    document.getElementById('vault-path').value = settingsData.vault_path || '';
    document.getElementById('vault-name').value = settingsData.vault_name || '';

    // Scanning
    const depthSelect = document.getElementById('scan-depth');
    depthSelect.value = String(settingsData.scan_depth || 2);

    // Projects table
    renderProjectsTable(settingsData.projects);
    updateProjectCount();

    // LLM config
    renderLlmSettings(settingsData.llm || {});

    setDirty(false);
}

function renderLlmSettings(llm) {
    const provider = llm.provider || 'ollama';
    document.getElementById('llm-provider').value = provider;
    updateLlmFieldVisibility(provider);

    if (provider === 'ollama') {
        document.getElementById('llm-endpoint').value = llm.ollama_endpoint || '';
        document.getElementById('llm-model').value = llm.ollama_model || '';
    } else if (provider === 'anthropic') {
        document.getElementById('llm-model').value = llm.anthropic_model || '';
        if (llm.anthropic_api_key_set) {
            document.getElementById('llm-apikey-hint').textContent = 'API key is set';
        }
    } else if (provider === 'openai') {
        document.getElementById('llm-model').value = llm.openai_model || '';
        if (llm.openai_api_key_set) {
            document.getElementById('llm-apikey-hint').textContent = 'API key is set';
        }
    }
}

function updateLlmFieldVisibility(provider) {
    const endpointField = document.getElementById('llm-endpoint-field');
    const apikeyField = document.getElementById('llm-apikey-field');

    endpointField.style.display = provider === 'ollama' ? '' : 'none';
    apikeyField.style.display = provider !== 'ollama' ? '' : 'none';
}

function getLlmPayload() {
    const provider = document.getElementById('llm-provider').value;
    const model = document.getElementById('llm-model').value;
    const payload = { provider };

    if (provider === 'ollama') {
        payload.ollama_endpoint = document.getElementById('llm-endpoint').value;
        payload.ollama_model = model;
    } else if (provider === 'anthropic') {
        payload.anthropic_model = model;
        const key = document.getElementById('llm-apikey').value;
        if (key) payload.anthropic_api_key = key;
    } else if (provider === 'openai') {
        payload.openai_model = model;
        const key = document.getElementById('llm-apikey').value;
        if (key) payload.openai_api_key = key;
    }

    return payload;
}

function renderProjectsTable(projects) {
    const tbody = document.getElementById('projects-tbody');
    if (!projects || Object.keys(projects).length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No projects found</td></tr>';
        return;
    }

    const sorted = Object.entries(projects).sort((a, b) => a[0].localeCompare(b[0]));
    const rows = sorted.map(([name, cfg]) => {
        const checked = cfg.enabled ? 'checked' : '';

        return `<tr class="${cfg.enabled ? '' : 'row-disabled'}">
            <td style="text-align: center;">
                <input type="checkbox" class="project-toggle" data-project="${escapeHtml(name)}" ${checked}>
            </td>
            <td class="project-name-cell">${escapeHtml(name)}</td>
            <td class="project-path-cell">${escapeHtml(cfg.vault || '')}</td>
            <td style="text-align: right; font-variant-numeric: tabular-nums;">${cfg.file_count || 0}</td>
        </tr>`;
    });

    tbody.innerHTML = rows.join('');

    // Bind toggle events
    tbody.querySelectorAll('.project-toggle').forEach(cb => {
        cb.addEventListener('change', () => {
            const proj = cb.dataset.project;
            settingsData.projects[proj].enabled = cb.checked;
            cb.closest('tr').classList.toggle('row-disabled', !cb.checked);
            setDirty(true);
            updateProjectCount();
        });
    });
}

function updateProjectCount() {
    const projects = settingsData ? settingsData.projects : {};
    const total = Object.keys(projects).length;
    const enabled = Object.values(projects).filter(p => p.enabled).length;
    const el = document.getElementById('project-count');
    if (el) el.textContent = `${enabled} of ${total} enabled`;
}

function initSettingsControls() {
    // Vault name change
    document.getElementById('vault-name').addEventListener('input', () => setDirty(true));

    // Scan depth change
    document.getElementById('scan-depth').addEventListener('change', () => setDirty(true));

    // Enable all
    document.getElementById('enable-all-btn').addEventListener('click', () => {
        for (const proj of Object.values(settingsData.projects)) {
            proj.enabled = true;
        }
        renderProjectsTable(settingsData.projects);
        setDirty(true);
    });

    // Disable all
    document.getElementById('disable-all-btn').addEventListener('click', () => {
        for (const proj of Object.values(settingsData.projects)) {
            proj.enabled = false;
        }
        renderProjectsTable(settingsData.projects);
        setDirty(true);
    });

    // Re-scan
    document.getElementById('rescan-btn').addEventListener('click', rescan);

    // LLM controls
    document.getElementById('llm-provider').addEventListener('change', () => {
        const provider = document.getElementById('llm-provider').value;
        updateLlmFieldVisibility(provider);
        // Reset model to default for new provider
        const defaults = { ollama: 'qwen3.5:35b', anthropic: 'claude-sonnet-4-20250514', openai: 'gpt-4o' };
        document.getElementById('llm-model').value = defaults[provider] || '';
        document.getElementById('llm-apikey').value = '';
        document.getElementById('llm-apikey-hint').textContent = '';
        setDirty(true);
    });
    document.getElementById('llm-endpoint').addEventListener('input', () => setDirty(true));
    document.getElementById('llm-model').addEventListener('input', () => setDirty(true));
    document.getElementById('llm-apikey').addEventListener('input', () => setDirty(true));
    document.getElementById('llm-test-btn').addEventListener('click', testLlmConnection);

    // Save
    document.getElementById('save-btn').addEventListener('click', saveSettings);
}

async function rescan() {
    const btn = document.getElementById('rescan-btn');
    const status = document.getElementById('scan-status');
    btn.disabled = true;
    btn.textContent = 'Scanning...';
    status.textContent = '';

    try {
        const res = await fetch('/api/settings/rescan', { method: 'POST' });
        const data = await res.json();

        // Merge new projects into settingsData
        for (const [name, cfg] of Object.entries(data.projects)) {
            if (!settingsData.projects[name]) {
                settingsData.projects[name] = cfg;
            } else {
                // Update file_count and source
                settingsData.projects[name].file_count = cfg.file_count;
                settingsData.projects[name].source = cfg.source;
                settingsData.projects[name].vault = cfg.vault;
            }
        }

        renderProjectsTable(settingsData.projects);
        updateProjectCount();

        const total = Object.keys(data.projects).length;
        status.textContent = `Found ${total} projects (${data.total_discovered} discovered)`;
    } catch (err) {
        status.textContent = 'Scan failed';
        console.error('Rescan failed:', err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Re-scan';
    }
}

async function testLlmConnection() {
    const btn = document.getElementById('llm-test-btn');
    const status = document.getElementById('llm-test-status');
    btn.disabled = true;
    btn.textContent = 'Testing...';
    status.textContent = '';

    // Save current LLM settings first so test uses them
    const llmPayload = getLlmPayload();
    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ llm: llmPayload }),
        });
    } catch (e) { /* ignore save error for test */ }

    try {
        const res = await fetch('/api/llm/test', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
            let msg = 'Connected';
            if (data.model_available === false) {
                msg += ' (model not found on server)';
            } else if (data.models) {
                msg += ` (${data.models.length} models available)`;
            }
            status.textContent = msg;
            status.style.color = 'var(--cs-status-success)';
        } else {
            status.textContent = data.error || 'Connection failed';
            status.style.color = 'var(--cs-status-critical)';
        }
    } catch (err) {
        status.textContent = 'Test failed: ' + err.message;
        status.style.color = 'var(--cs-status-critical)';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Test Connection';
    }
}

async function saveSettings() {
    const btn = document.getElementById('save-btn');
    const status = document.getElementById('save-status');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const payload = {
        vault_name: document.getElementById('vault-name').value,
        scan_depth: parseInt(document.getElementById('scan-depth').value, 10),
        projects: {},
        llm: getLlmPayload(),
    };

    // Only send enabled/shared_view for each project
    for (const [name, cfg] of Object.entries(settingsData.projects)) {
        payload.projects[name] = {
            enabled: cfg.enabled,
            shared_view: cfg.shared_view,
        };
    }

    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.status === 'ok') {
            status.textContent = 'Saved';
            setDirty(false);
            window.dispatchEvent(new Event('settings-saved'));
            setTimeout(() => { status.textContent = ''; }, 2000);
        } else {
            status.textContent = 'Save failed';
        }
    } catch (err) {
        status.textContent = 'Save failed';
        console.error('Save failed:', err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save settings';
    }
}

function setDirty(isDirty) {
    dirty = isDirty;
    const bar = document.getElementById('save-bar');
    if (bar) bar.classList.toggle('visible', isDirty);
}
