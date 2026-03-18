'use strict';

const API_BASE = '/api';

/**
 * Initialize Dashboard
 */
async function init() {
    await updateStats();
    await updateLatest();
    
    // Auto-refresh every 30 seconds
    setInterval(updateStats, 30000);
}

/**
 * Fetch and Render Stats
 */
async function updateStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();

        // Update Numbers
        document.getElementById('total-count').textContent = data.total.toLocaleString();
        document.getElementById('country-count').textContent = data.byCountry.length;
        document.getElementById('source-count').textContent = data.bySource.length;
        
        const lastRunDate = data.lastRun?.finished_at ? new Date(data.lastRun.finished_at) : null;
        document.getElementById('last-run').textContent = lastRunDate 
            ? `Sync completed: ${lastRunDate.toLocaleTimeString()}`
            : 'Scrape in progress...';

        // Render Source Chart
        renderChart(data.bySource.slice(0, 10));

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
        const data = await response.json();
        const table = document.getElementById('latest-table');
        
        table.innerHTML = data.map(item => {
            const scoreClass = item.weighted_score >= 8 ? 'score-high' : 
                               item.weighted_score >= 5 ? 'score-med' : 'score-low';
            return `
                <tr>
                    <td class="pill">${item.phone_number}</td>
                    <td class="${scoreClass}">${item.weighted_score.toFixed(1)}</td>
                    <td style="color: grey">${item.call_type}</td>
                    <td>${item.country}</td>
                    <td><span class="badge" style="border: none; background: rgba(0,255,0,0.1); color: var(--threat-low)">DETECTED</span></td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Latest update failed:', err);
    }
}

/**
 * Instant Search
 */
document.getElementById('search-btn').addEventListener('click', async () => {
    const input = document.getElementById('search-input').value.trim();
    if (!input) return;

    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = '<p class="pulse">ANALYZING OSINT...</p>';

    try {
        const response = await fetch(`${API_BASE}/lookup/${encodeURIComponent(input)}`);
        const data = await response.json();

        if (data.found === false) {
            resultsDiv.innerHTML = `
                <div class="glass" style="padding: 1rem; border-color: var(--threat-low); background: rgba(0,255,0,0.05)">
                    <h3 style="color: var(--threat-low)">🛡️ NUMBER CLEAN</h3>
                    <p style="font-size: 0.8rem">No reports found for ${input} in any community database.</p>
                </div>
            `;
        } else {
            const scoreClass = data.weighted_score >= 8 ? 'score-high' : 'score-med';
            resultsDiv.innerHTML = `
                <div class="glass" style="padding: 1.5rem; border-color: var(--threat-high); border-width: 2px;">
                    <div style="display: flex; gap: 20px; align-items: center">
                        <div class="${scoreClass}" style="font-size: 2.5rem">${data.weighted_score.toFixed(1)}</div>
                        <div>
                            <h3 style="color: var(--threat-high)">🚨 SPAM IDENTIFIED</h3>
                            <p style="font-size: 0.9rem">${data.user_notes || 'Confirmed robocall pattern detected.'}</p>
                            <p style="font-size: 0.7rem; color: var(--muted)">Detected across ${data.sources || 'Multiple'} sources</p>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (err) {
        resultsDiv.innerHTML = `<p style="color: red">SEARCH ERROR: ${err.message}</p>`;
    }
});

let sharedChart = null;
function renderChart(sourceData) {
    const ctx = document.getElementById('sourceChart').getContext('2d');
    
    if (sharedChart) sharedChart.destroy();

    sharedChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sourceData.map(s => s.source),
            datasets: [{
                label: 'Threats per Source',
                data: sourceData.map(s => s.count),
                backgroundColor: [
                    '#00f3ff', '#ff00ff', '#ff3e3e', '#ff9e00', '#00e676', 
                    '#5e5e5e', '#7d7d7d', '#3d3d3d'
                ],
                borderWidth: 0,
                hoverOffset: 20
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#808080', font: { family: 'Outfit', size: 10 } }
                }
            },
            cutout: '70%'
        }
    });
}

// Start app
init();
