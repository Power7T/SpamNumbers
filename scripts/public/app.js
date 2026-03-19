'use strict';

const API_BASE = '/api';
let currentFilter = 'all';
let rawData = [];
let isEngineRunning = false;

/* Boot Sequence */
async function init() {
    updateClock();
    setInterval(updateClock, 1000);
    
    await checkEngineStatus();
    await updateStats();
    await fetchLatest();
    
    // UI binding
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.getAttribute('data-filter');
            renderTable();
        });
    });

    document.getElementById('close-profile').addEventListener('click', () => {
        document.getElementById('target-profile').style.display = 'none';
        document.querySelectorAll('#latest-table tr').forEach(tr => tr.classList.remove('selected'));
    });

    document.getElementById('btn-start').addEventListener('click', engageEngine);
    document.getElementById('btn-stop').addEventListener('click', haltEngine);

    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
    document.getElementById('btn-save-keys').addEventListener('click', saveSettings);

    // Grid Operations
    document.getElementById('btn-hunt').addEventListener('click', () => runOperation('hunt'));
    document.getElementById('btn-deep-crawl').addEventListener('click', () => runOperation('deep-crawl'));
    document.getElementById('btn-decay').addEventListener('click', () => runOperation('decay'));
    document.getElementById('btn-export').addEventListener('click', triggerExport);
    document.getElementById('btn-manual-add').addEventListener('click', openAddModal);
    document.getElementById('btn-close-add').addEventListener('click', closeAddModal);
    document.getElementById('add-form').addEventListener('submit', injectThreat);

    // Global Search
    document.getElementById('btn-search').addEventListener('click', targetLookup);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') targetLookup();
    });

    // Sync loops (fast syncing for "Live" feel)
    setInterval(updateStats, 5000); // 5 sec live sync
    setInterval(fetchLatest, 5000); // 5 sec live sync
    setInterval(syncTerminalLogs, 2000); // 2 sec log sync
    setInterval(checkEngineStatus, 10000); // 10 sec state check
    
    spawnRadarBlips();
}

function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('en-US', { hour12: false }) + ' UTC';
}

/* Engine Controls */
async function checkEngineStatus() {
    try {
        const res = await fetch(`${API_BASE}/status`);
        const data = await res.json();
        isEngineRunning = data.isRunning;
        updateUIState();
    } catch(e) {}
}

async function engageEngine() {
    if(isEngineRunning) return;
    runOperation('scrape');
}

async function runOperation(name) {
    if(isEngineRunning) return;
    try {
        await fetch(`${API_BASE}/start`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: name })
        });
        isEngineRunning = true;
        updateUIState(name);
    } catch(e) {}
}

async function haltEngine() {
    if(!isEngineRunning) return;
    try {
        await fetch(`${API_BASE}/stop`, { method: 'POST' });
        isEngineRunning = false;
        updateUIState();
    } catch(e) {}
}

async function triggerExport() {
    const btn = document.getElementById('btn-export');
    btn.textContent = 'WAIT...';
    btn.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/export`, { method: 'POST' });
        const data = await res.json();
        if(data.success) {
            alert(`SUCCESS: Database exported! \n\nStarting download to your PC...`);
            // Trigger browser download
            window.location.href = `${API_BASE}/download-export`;
        }
    } catch(e) {
        alert('Export failed. Check terminal logs.');
    }
    btn.textContent = '💾 EXPORT';
    btn.disabled = false;
}

function openAddModal() {
    document.getElementById('add-modal').style.display = 'block';
}

function closeAddModal() {
    document.getElementById('add-modal').style.display = 'none';
}

async function injectThreat(e) {
    e.preventDefault();
    const payload = {
        phone: document.getElementById('add-phone').value,
        type: document.getElementById('add-type').value,
        notes: document.getElementById('add-notes').value
    };
    try {
        const res = await fetch(`${API_BASE}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if(res.ok) {
            closeAddModal();
            fetchLatest();
            updateStats();
        }
    } catch(e) {}
}

async function targetLookup() {
    const input = document.getElementById('search-input');
    const phone = input.value.trim();
    if(!phone) return;

    try {
        const res = await fetch(`${API_BASE}/lookup/${encodeURIComponent(phone)}`);
        const result = await res.json();
        if(result && result.phone_number) {
            // Find in rawData if possible to reuse inspectTarget
            const existing = rawData.find(i => i.phone_number === result.phone_number);
            if(!existing) {
                rawData.unshift(result); // Add to local cache for display
                renderTable();
            }
            inspectTarget(result.phone_number);
        } else {
            alert(`TARGET NOT FOUND: ${phone} \n\nNumber not detected in local database.`);
        }
    } catch(e) {}
}

function updateUIState(opName = 'scrape') {
    const startBtn = document.getElementById('btn-start');
    const stopBtn = document.getElementById('btn-stop');
    const radar = document.getElementById('radar-visual');
    const radarLabel = document.getElementById('radar-status-text');

    if (isEngineRunning) {
        startBtn.disabled = true; startBtn.classList.add('cursor-disabled');
        stopBtn.disabled = false; stopBtn.classList.remove('cursor-disabled');
        radar.classList.remove('idle');
        radarLabel.textContent = `OPERATION ${opName.toUpperCase()}: ACTIVE`;
        radarLabel.style.color = opName === 'scrape' ? 'var(--green)' : 'var(--magenta)';
    } else {
        startBtn.disabled = false; startBtn.classList.remove('cursor-disabled');
        stopBtn.disabled = true; stopBtn.classList.add('cursor-disabled');
        radar.classList.add('idle');
        radarLabel.textContent = 'SYSTEM IDLE... WAITING';
        radarLabel.style.color = 'var(--muted)';
    }
}

/* API Config Controls */
async function openSettings() {
    const res = await fetch(`${API_BASE}/settings`);
    const keys = await res.json();
    document.getElementById('key-numverify').value = keys.numverify || '';
    document.getElementById('key-abstract').value = keys.abstract || '';
    document.getElementById('settings-modal').style.display = 'block';
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

async function saveSettings(e) {
    e.preventDefault();
    const payload = {
        numverify: document.getElementById('key-numverify').value,
        abstract: document.getElementById('key-abstract').value
    };
    const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        closeSettings();
    }
}

/* Data Syncers */
async function updateStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const stats = await response.json();
        
        const tcElement = document.getElementById('total-count');
        const currTotal = parseInt(tcElement.innerText.replace(/,/g, '')) || 0;
        
        // Only re-render if stats changed (stops flickering)
        if (currTotal !== stats.total) {
            animateValue('total-count', currTotal, stats.total, 1000);
            document.getElementById('country-count').textContent = stats.byCountry.length;
            document.getElementById('source-count').textContent = stats.bySource.length;
            renderCssBarChart(stats.bySource.slice(0, 6));
        }

        const lastRun = stats.lastRun?.finished_at ? new Date(stats.lastRun.finished_at) : null;
        document.getElementById('last-run').textContent = lastRun ? lastRun.toLocaleTimeString('en-US', {hour12:false}) : (isEngineRunning ? 'SCANNING...' : 'STANDBY');

    } catch (e) { console.error('Telemetry err:', e); }
}

async function fetchLatest() {
    try {
        const response = await fetch(`${API_BASE}/latest`);
        const newRawData = await response.json();
        
        // Simple check to prevent full DOM repaint if data hasn't changed
        if (JSON.stringify(newRawData) !== JSON.stringify(rawData)) {
            rawData = newRawData;
            renderTable();
        }
    } catch (err) { }
}

async function syncTerminalLogs() {
    try {
        const res = await fetch(`${API_BASE}/logs`);
        const { logs } = await res.json();
        
        const logBox = document.getElementById('live-log');
        logBox.innerHTML = '';
        
        // Render logs backward (newest at top)
        const reversed = [...logs].reverse().slice(0, 50);
        reversed.forEach(logLine => {
            const wrap = document.createElement('p');
            // Basic color coding logic for real logs
            if(logLine.includes('[WARN]') || logLine.includes('FAIL')) wrap.className = 'log-entry threat';
            else if(logLine.includes('Captured') || logLine.includes('Found')) wrap.className = 'log-entry discovery';
            else if(logLine.includes('[SYS]')) wrap.className = 'log-entry system';
            else wrap.className = 'log-entry';
            
            wrap.textContent = logLine;
            logBox.appendChild(wrap);
        });
    } catch(e) {}
}

/* View Renderers */
function renderTable() {
    const table = document.getElementById('latest-table');
    let filtered = rawData;
    
    if (currentFilter !== 'all') {
        filtered = rawData.filter(item => item.country === currentFilter);
    }

    table.innerHTML = filtered.map(item => {
        const pScore = parseFloat(item.weighted_score);
        const scoreClass = pScore >= 8 ? 'score-high' : pScore >= 5 ? 'score-med' : 'score-low';
        
        return `
            <tr onclick="inspectTarget('${item.phone_number}')" data-phone="${item.phone_number}">
                <td><span class="pill">${item.phone_number}</span></td>
                <td><span class="${scoreClass}">${item.weighted_score.toFixed(1)}</span></td>
                <td style="color:#a3a3a3">${(item.call_type || 'robot').toUpperCase()}</td>
                <td style="color:var(--cyan)">${item.country || 'GLOBAL'}</td>
            </tr>
        `;
    }).join('');
}

function inspectTarget(phone) {
    document.querySelectorAll('#latest-table tr').forEach(tr => tr.classList.remove('selected'));
    const row = document.querySelector(`tr[data-phone="${phone}"]`);
    if(row) row.classList.add('selected');

    const item = rawData.find(i => i.phone_number === phone);
    if (!item) return;

    document.getElementById('target-profile').style.display = 'block';
    document.getElementById('target-phone').textContent = item.phone_number;
    document.getElementById('target-source').textContent = (item.source || 'UNKNOWN').toUpperCase();
    document.getElementById('target-score').textContent = item.weighted_score.toFixed(1);
    document.getElementById('target-type').textContent = (item.call_type || 'UNKNOWN').toUpperCase();
    document.getElementById('target-country').textContent = (item.country || 'GLOBAL').toUpperCase();
    
    document.getElementById('target-notes').innerHTML = `
        ACCESSING DATABASE... <br>
        [SEEN]: ${new Date(item.date_first_seen).toLocaleString()} <br>
        [INTEL]: ${item.user_notes || 'No extended intelligence available.'}
    `;
}

function renderCssBarChart(sourceData) {
    const container = document.getElementById('bar-chart');
    if (!sourceData.length) return;
    
    const maxVal = Math.max(...sourceData.map(s => s.count));
    const colors = ['var(--cyan)', 'var(--magenta)', 'var(--green)', 'var(--red)', '#fff', '#aaa'];
    
    container.innerHTML = sourceData.map((s, idx) => {
        const percent = Math.max(5, (s.count / maxVal) * 100);
        return `
            <div class="bar-row">
                <div class="bar-label">${s.source.toUpperCase()}</div>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${percent}%; background: ${colors[idx % colors.length]};"></div>
                </div>
                <div class="bar-value">${s.count.toLocaleString()}</div>
            </div>
        `;
    }).join('');
}

function spawnRadarBlips() {
    const radar = document.getElementById('radar-blips');
    setInterval(() => {
        if(!isEngineRunning) {
            radar.innerHTML = ''; return;
        }

        if(radar.children.length > 5) radar.removeChild(radar.firstChild);
        
        const blip = document.createElement('div');
        blip.className = 'blip';
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 60; 
        const x = Math.cos(angle) * radius + 75;
        const y = Math.sin(angle) * radius + 75;
        
        blip.style.left = `${x}px`;
        blip.style.top = `${y}px`;
        
        const colors = ['var(--red)', 'var(--cyan)', 'var(--magenta)'];
        blip.style.background = colors[Math.floor(Math.random() * colors.length)];
        
        radar.appendChild(blip);
    }, 1500);
}

function animateValue(id, start, end, duration) {
    if (start === end) return;
    let range = end - start;
    let current = start;
    let increment = end > start ? Math.ceil(range / 60) : Math.floor(range / 60);
    let stepTime = Math.abs(Math.floor(duration / (range / increment)));
    let obj = document.getElementById(id);
    let timer = setInterval(function() {
        current += increment;
        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
            current = end;
            clearInterval(timer);
        }
        obj.innerHTML = current.toLocaleString();
    }, stepTime);
}

init();
