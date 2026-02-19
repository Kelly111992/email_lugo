// ============================================
// STATE
// ============================================
let currentFilter = 'all';
let emails = [];
let stats = {};

// ============================================
// API CALLS
// ============================================
async function fetchStats() {
    try {
        const response = await fetch('/api/stats');
        stats = await response.json();
        updateStatsUI();
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

async function fetchEmails(source = null) {
    try {
        let url = '/api/emails?limit=100';
        if (source && source !== 'all') {
            url += `&source=${source}`;
        }

        const response = await fetch(url);
        emails = await response.json();
        updateEmailsUI();
    } catch (error) {
        console.error('Error fetching emails:', error);
    }
}

// ============================================
// UI UPDATES
// ============================================
function updateStatsUI() {
    document.getElementById('stat-total').textContent = stats.total || 0;
    document.getElementById('stat-personal').textContent = stats.bySource?.personal || 0;
    document.getElementById('stat-inmuebles24').textContent = stats.bySource?.inmuebles24 || 0;
    document.getElementById('stat-proppit').textContent = stats.bySource?.proppit || 0;
    document.getElementById('stat-easybroker').textContent = stats.bySource?.easybroker || 0;
    document.getElementById('stat-vivanuncios').textContent = stats.bySource?.vivanuncios || 0;
    document.getElementById('stat-mercadolibre').textContent = stats.bySource?.mercadolibre || 0;
}

function updateEmailsUI() {
    const container = document.getElementById('emails-list');

    if (emails.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📭</span>
                <p>No hay correos todavía</p>
                <span class="empty-hint">Los correos aparecerán aquí cuando n8n los envíe</span>
            </div>
        `;
        return;
    }

    container.innerHTML = emails.map(email => `
        <div class="email-item" onclick="openEmailModal(${email.id})">
            <span class="email-source-badge ${email.source}">${formatSource(email.source)}</span>
            <div class="email-content">
                <div class="email-subject">${escapeHtml(email.subject)}</div>
                <div class="email-from">${escapeHtml(email.from_address)}</div>
            </div>
            <span class="email-date">${formatDate(email.received_at)}</span>
        </div>
    `).join('');
}

// ============================================
// HELPERS
// ============================================
function formatSource(source) {
    const names = {
        'personal': 'Personal',
        'inmuebles24': 'Inmuebles24',
        'proppit': 'Proppit',
        'easybroker': 'EasyBroker',
        'vivanuncios': 'Vivanuncios',
        'mercadolibre': 'MercadoLibre',
        'otros': 'Otros'
    };
    return names[source] || source;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    // Less than 1 minute
    if (diff < 60000) {
        return 'Ahora';
    }

    // Less than 1 hour
    if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return `Hace ${mins} min`;
    }

    // Less than 24 hours
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `Hace ${hours}h`;
    }

    // More than 24 hours
    return date.toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// ============================================
// MODAL
// ============================================
async function openEmailModal(id) {
    try {
        const response = await fetch(`/api/emails/${id}`);
        const email = await response.json();

        document.getElementById('modal-subject').textContent = email.subject || '(Sin asunto)';
        document.getElementById('modal-from').textContent = `De: ${email.from_address}`;
        document.getElementById('modal-date').textContent = formatDate(email.received_at);
        document.getElementById('modal-source').textContent = formatSource(email.source);
        document.getElementById('modal-source').className = `modal-source ${email.source}`;
        document.getElementById('modal-preview').textContent = email.body_preview || 'Sin contenido';

        // Parse and format raw data
        try {
            const rawData = JSON.parse(email.raw_data);
            document.getElementById('modal-raw').textContent = JSON.stringify(rawData, null, 2);
        } catch {
            document.getElementById('modal-raw').textContent = email.raw_data || 'N/A';
        }

        document.getElementById('email-modal').classList.add('active');
    } catch (error) {
        console.error('Error fetching email:', error);
    }
}

function closeModal() {
    document.getElementById('email-modal').classList.remove('active');
}

// Close modal on background click
document.getElementById('email-modal').addEventListener('click', (e) => {
    if (e.target.id === 'email-modal') {
        closeModal();
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});

// ============================================
// FILTERS
// ============================================
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Update active state
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Fetch filtered emails
        currentFilter = btn.dataset.filter;
        fetchEmails(currentFilter);
    });
});

// Click on stat cards to filter
document.querySelectorAll('.stat-card[data-source]').forEach(card => {
    card.addEventListener('click', () => {
        const source = card.dataset.source;

        // Update filter buttons
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.filter-btn[data-filter="${source}"]`)?.classList.add('active');

        // Fetch filtered emails
        currentFilter = source;
        fetchEmails(source);
    });
});

// ============================================
// AUTO REFRESH
// ============================================
function startAutoRefresh() {
    // Refresh every 30 seconds
    setInterval(() => {
        fetchStats();
        fetchEmails(currentFilter);
        updateTrendsChart();
    }, 30000);
}

// ============================================
// TRENDS CHART
// ============================================
let trendsChart = null;

const chartColors = {
    inmuebles24: { border: '#f97316', bg: 'rgba(249, 115, 22, 0.1)' },
    proppit: { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)' },
    easybroker: { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
    vivanuncios: { border: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
    mercadolibre: { border: '#eab308', bg: 'rgba(234, 179, 8, 0.1)' },
    personal: { border: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)' },
    otros: { border: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)' }
};

const sourceLabels = {
    inmuebles24: 'Inmuebles24',
    proppit: 'Proppit',
    easybroker: 'EasyBroker',
    vivanuncios: 'Vivanuncios',
    mercadolibre: 'MercadoLibre',
    personal: 'Personal',
    otros: 'Otros'
};

async function fetchTrends(days = 30) {
    try {
        const response = await fetch(`/api/trends?days=${days}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching trends:', error);
        return null;
    }
}

async function initTrendsChart() {
    const ctx = document.getElementById('trendsChart');
    if (!ctx) return;

    const data = await fetchTrends(30);
    if (!data) return;

    const datasets = data.datasets.map(ds => ({
        label: sourceLabels[ds.source] || ds.source,
        data: ds.data,
        borderColor: chartColors[ds.source]?.border || '#6b7280',
        backgroundColor: chartColors[ds.source]?.bg || 'rgba(107, 114, 128, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 6
    }));

    trendsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#a0a0b0',
                        usePointStyle: true,
                        padding: 20,
                        font: {
                            family: 'Inter, sans-serif',
                            size: 12
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 30, 50, 0.95)',
                    titleColor: '#ffffff',
                    bodyColor: '#a0a0b0',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    titleFont: {
                        family: 'Inter, sans-serif',
                        weight: '600'
                    },
                    bodyFont: {
                        family: 'Inter, sans-serif'
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#6b6b7b',
                        font: {
                            family: 'Inter, sans-serif',
                            size: 11
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#6b6b7b',
                        stepSize: 1,
                        font: {
                            family: 'Inter, sans-serif',
                            size: 11
                        }
                    }
                }
            }
        }
    });
}

async function updateTrendsChart() {
    if (!trendsChart) return;

    const periodSelect = document.getElementById('chart-period');
    const days = periodSelect ? parseInt(periodSelect.value) : 30;

    const data = await fetchTrends(days);
    if (!data) return;

    trendsChart.data.labels = data.labels;
    data.datasets.forEach((ds, index) => {
        if (trendsChart.data.datasets[index]) {
            trendsChart.data.datasets[index].data = ds.data;
        }
    });
    trendsChart.update();
}

// Period selector event
document.addEventListener('DOMContentLoaded', () => {
    const periodSelect = document.getElementById('chart-period');
    if (periodSelect) {
        periodSelect.addEventListener('change', updateTrendsChart);
    }
});

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    fetchStats();
    fetchEmails();
    initTrendsChart();
    startAutoRefresh();

    console.log('📧 Email Monitor Dashboard initialized');
});
