'use strict';

const API_BASE = '/api';
let currentFilter = 'all';
let rawData = [];

/**
 * Boot Sequence
 */
async function init() {
    updateClock();
    setInterval(updateClock, 1000);
    
    await updateStats();
    await fetchLatest();
    startTerminalSim();
    spawnRadarBlips();

    // Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.getAttribute('data-filter');
            renderTable();
        });
    });

    // Close Target Profile
    document.getElementById('close-profile').addEventListener('click', () => {
        document.getElementById('target-profile').style.display = 'none';
        document.querySelectorAll('#latest-table tr').forEach(tr => tr.classList.remove('selected'));
    });

    // Sync loops
    setInterval(updateStats, 30000);
    setInterval(fetchLatest, 30000);
}

/**
 * Digital Clock
 */
function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('en-US', { hour12: false }) + ' UTC';
}

/**
 * Fetch Main Telemetry
 */
async function updateStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const stats = await response.json();

        // Animate counter
        animateValue('total-count', parseInt(document.getElementById('total-count').innerText) || 0, stats.total, 1000);
        document.getElementById('country-count').textContent = stats.byCountry.length;
        document.getElementById('source-count').textContent = stats.bySource.length;
        
        const lastRun = stats.lastRun?.finished_at ? new Date(stats.lastRun.finished_at) : null;
        document.getElementById('last-run').textContent = lastRun ? lastRun.toLocaleTimeString('en-US', {hour12:false}) : 'SCANNING...';

        renderCssBarChart(stats.bySource.slice(0, 6));
    } catch (e) { console.error('Telemetry err:', e); }
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

/**
 * Fetch Live Threat Stream
 */
async function fetchLatest() {
    try {
        const response = await fetch(`${API_BASE}/latest`);
        rawData = await response.json();
        renderTable();
    } catch (err) { console.error('Stream err:', err); }
}

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

/**
 * Dossier Inspection (Interactive Click)
 */
function inspectTarget(phone) {
    // UI selection
    document.querySelectorAll('#latest-table tr').forEach(tr => tr.classList.remove('selected'));
    const row = document.querySelector(`tr[data-phone="${phone}"]`);
    if(row) row.classList.add('selected');

    // Data binding
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
    
    // Add terminal log entry for activity
    addLog(`[USER] Inspecting Dossier for Node: ${item.phone_number}`, 'system');
}

/**
 * Native CSS Bar Chart Builder (Replaces heavy JS libs)
 */
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

/**
 * Radar Blip Animator
 */
function spawnRadarBlips() {
    const radar = document.getElementById('radar-blips');
    setInterval(() => {
        if(radar.children.length > 5) radar.removeChild(radar.firstChild);
        
        const blip = document.createElement('div');
        blip.className = 'blip';
        
        // Random coords within the circle
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 60; // 150/2 = 75
        const x = Math.cos(angle) * radius + 75;
        const y = Math.sin(angle) * radius + 75;
        
        blip.style.left = `${x}px`;
        blip.style.top = `${y}px`;
        
        // Color randomization to simulate varing threats
        const colors = ['var(--red)', 'var(--cyan)', 'var(--magenta)'];
        blip.style.background = colors[Math.floor(Math.random() * colors.length)];
        
        radar.appendChild(blip);
    }, 1500);
}

/**
 * Terminal Simulator
 */
function startTerminalSim() {
    const scenarios = [
        { type: 'discovery', msg: 'Cloud-Vacuum (Gists): Intercepted 4 blocklists' },
        { type: 'system', msg: 'System integrity 100%. Handshake complete.' },
        { type: 'threat', msg: 'WARNING: Sudden surge in Spain (Tellows ES)' },
        { type: 'discovery', msg: 'Nitter Socket: Stream synced. Extracted 8 sigs' },
        { type: 'threat', msg: 'Deep-Stealth Archive: Bypassing Check...' },
        { type: 'discovery', msg: 'BBB Scraper: 53 consumer entries digested' }
    ];

    setInterval(() => {
        const random = scenarios[Math.floor(Math.random() * scenarios.length)];
        addLog(random.msg, random.type);
    }, 6000);
}

function addLog(msg, type) {
    const logBox = document.getElementById('live-log');
    const el = document.createElement('p');
    el.className = `log-entry ${type}`;
    el.innerHTML = `[${new Date().toLocaleTimeString('en-US',{hour12:false})}] ${msg}`;
    logBox.prepend(el);
    if (logBox.children.length > 50) logBox.removeChild(logBox.lastChild);
}

// Start sequence
init();
