'use strict';

const API_BASE = '/api';
let currentFilter = 'all';

/**
 * Initialize Dashboard
 */
async function init() {
    await updateStats();
    await updateLatest();
    startLogSimulator();

    // Event Listeners for Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.getAttribute('data-filter');
            updateLatest();
        });
    });

    // Auto-refresh every 30 seconds
    setInterval(updateStats, 30000);
    setInterval(updateLatest, 30000);
}

/**
 * Fetch and Render Stats
 */
async function updateStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();

        document.getElementById('total-count').textContent = data.total.toLocaleString();
        document.getElementById('country-count').textContent = data.byCountry.length;
        document.getElementById('source-count').textContent = data.bySource.length;
        
        const lastRunDate = data.lastRun?.finished_at ? new Date(data.lastRun.finished_at) : null;
        document.getElementById('last-run').textContent = lastRunDate 
            ? `Sync completed: ${lastRunDate.toLocaleTimeString()}`
            : 'Scrape in progress...';

        renderChart(data.bySource.slice(0, 5));

    } catch (err) {
        console.error('Stats update failed:', err);
    }
}

/**
 * Fetch and Render Latest Table
 */
async function updateLatest() {
    try {
        const response = await fetch(`${API_BASE}/latest`);
        let data = await response.json();
        
        if (currentFilter !== 'all') {
            data = data.filter(item => item.country === currentFilter);
        }

        const table = document.getElementById('latest-table');
        table.innerHTML = data.map(item => {
            const scoreClass = item.weighted_score >= 8 ? 'score-high' : 
                               item.weighted_score >= 5 ? 'score-med' : 'score-low';
            return `
                <tr>
                    <td><span class="pill">${item.phone_number}</span></td>
                    <td><span class="${scoreClass}">${item.weighted_score.toFixed(1)}</span></td>
                    <td style="color: grey; font-size: 0.8rem">${item.call_type || 'robot'}</td>
                    <td>${item.country || 'Global'}</td>
                    <td><span class="badge" style="background: rgba(0,243,255,0.05); color: var(--accent); border-radius: 4px; font-size: 0.65rem">MONITORED</span></td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Latest update failed:', err);
    }
}

/**
 * System Log Simulator (Simulates Real-Time background activity)
 */
function startLogSimulator() {
    const logContainer = document.getElementById('live-log');
    const scenarios = [
        { type: 'discovery', msg: 'Gist Hunter discovered 12 candidates in public drop #812' },
        { type: 'discovery', msg: 'Tellows regional sweep complete (AU, IN, UK)' },
        { type: 'threat', msg: 'High Intelligence Threat detected: +1 (800) XXX-XXXX' },
        { type: 'system', msg: 'SQLite cache optimized. 1,200 redundant entries purged.' },
        { type: 'discovery', msg: 'Nitter social stream extraction successful #scamcall' },
        { type: 'threat', msg: 'New IRS Phishing pattern identified in 800notes archives' }
    ];

    setInterval(() => {
        const random = scenarios[Math.floor(Math.random() * scenarios.length)];
        const el = document.createElement('p');
        el.className = `log-entry ${random.type}`;
        el.textContent = `[${new Date().toLocaleTimeString()}] ${random.msg}`;
        logContainer.prepend(el);
        if (logContainer.children.length > 30) logContainer.removeChild(logContainer.lastChild);
    }, 5000);
}

let sharedChart = null;
function renderChart(sourceData) {
    const ctx = document.getElementById('sourceChart').getContext('2d');
    if (sharedChart) sharedChart.destroy();

    sharedChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sourceData.map(s => s.source),
            datasets: [{
                data: sourceData.map(s => s.count),
                backgroundColor: ['#00f3ff', '#ff00ff', '#ff3e3e', '#ff9e00', '#00e676'],
                borderWidth: 0,
                hoverOffset: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }, // Custom Legend in CSS
            cutout: '80%'
        }
    });
}

// Start app
init();
