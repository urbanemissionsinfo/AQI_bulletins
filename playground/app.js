// === CONFIGURATION ===
// Update this filename to match the .db file in your GitHub Pages repository
const DB_FILE_PATH = '../data/Processed/aqi_bulletins.db';
const DEFAULT_QUERY = 'SELECT * FROM aqi_bulletins ORDER BY date DESC LIMIT 25;';

let db = null;
let lastColumns = [];
let lastRows = [];

// DOM Elements
const dbStatus = document.getElementById('dbStatus');
const sqlInput = document.getElementById('sqlInput');
const runBtn = document.getElementById('runBtn');
const resetBtn = document.getElementById('resetBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const resultsContent = document.getElementById('resultsContent');
const resultsMeta = document.getElementById('resultsMeta');
const presetContainer = document.getElementById('presetContainer');

// Filter Builder Elements
const cityFilter = document.getElementById('cityFilter');
const categoryFilter = document.getElementById('categoryFilter');
const pollutantFilter = document.getElementById('pollutantFilter');
const minAqiFilter = document.getElementById('minAqiFilter');
const minAqiVal = document.getElementById('minAqiVal');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');

// 1. Initialize sql.js and Fetch Database from GitHub Pages Repo
async function initApp() {
    try {
        const sqlPromise = initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });

        const dbResponsePromise = fetch(DB_FILE_PATH);
        const [SQL, response] = await Promise.all([sqlPromise, dbResponsePromise]);

        if (!response.ok) {
            throw new Error(`Failed to fetch ${DB_FILE_PATH} (HTTP ${response.status})`); }  const buffer = await response.arrayBuffer(); db = new SQL.Database(new Uint8Array(buffer));  // Update UI state dbStatus.textContent = `Connected (${DB_FILE_PATH.replace('./', '')})`;
        dbStatus.className = 'status-badge success';

        sqlInput.disabled = false;
        runBtn.disabled = false;
        resetBtn.disabled = false;
        applyFiltersBtn.disabled = false;

        populateFilterDropdowns();

        // Run default query
        sqlInput.value = DEFAULT_QUERY;
        executeQuery(DEFAULT_QUERY);

    } catch (err) {
        dbStatus.textContent = 'Database Load Error';
        dbStatus.className = 'status-badge error';
        resultsContent.innerHTML = `
            <div class="error-msg">
                <strong>Could not preload database:</strong> ${escapeHtml(err.message)}<br><br>
                <em>Tip: Ensure <code>${escapeHtml(DB_FILE_PATH)}</code> exists in the same folder as <code>index.html</code> and is served over HTTP/HTTPS (e.g., GitHub Pages or <code>python -m http.server</code>).</em>
            </div>`;
        console.error(err);
    }
}

// 2. Populate Visual Filter Dropdowns dynamically from distinct DB values
function populateFilterDropdowns() {
    populateSelect(cityFilter, 'SELECT DISTINCT city FROM aqi_bulletins WHERE city IS NOT NULL ORDER BY city ASC;');
    populateSelect(categoryFilter, 'SELECT DISTINCT aqi_category FROM aqi_bulletins WHERE aqi_category IS NOT NULL ORDER BY aqi_category ASC;');
    populateSelect(pollutantFilter, 'SELECT DISTINCT prominent_pollutant FROM aqi_bulletins WHERE prominent_pollutant IS NOT NULL ORDER BY prominent_pollutant ASC;');
}

function populateSelect(selectElement, query) {
    try {
        const stmt = db.prepare(query);
        while (stmt.step()) {
            const val = stmt.get()[0];
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            selectElement.appendChild(opt);
        }
        stmt.free();
    } catch (e) {
        console.warn('Could not populate dropdown:', e);
    }
}

// 3. Visual Filter Builder Event Listeners
minAqiFilter.addEventListener('input', (e) => {
    minAqiVal.textContent = e.target.value;
});

applyFiltersBtn.addEventListener('click', () => {
    const conditions = [];
    if (cityFilter.value !== 'ALL') {
        conditions.push(`city = '${cityFilter.value.replace(/'/g, "''")}'`);
    }
    if (categoryFilter.value !== 'ALL') {
        conditions.push(`aqi_category = '${categoryFilter.value.replace(/'/g, "''")}'`); } if (pollutantFilter.value !== 'ALL') { conditions.push(`prominent_pollutant = '${pollutantFilter.value.replace(/'/g, "''")}'`);
    }
    const minAqi = parseInt(minAqiFilter.value, 10);
    if (minAqi > 0) {
        conditions.push(`aqi >= ${minAqi}`); }  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} ` : '';
    const generatedSql = `SELECT * FROM aqi_bulletins ${whereClause}ORDER BY date DESC LIMIT 100;`;
    
    sqlInput.value = generatedSql;
    executeQuery(generatedSql);
});

// 4. Query Execution & Presets
runBtn.addEventListener('click', () => executeQuery(sqlInput.value));

resetBtn.addEventListener('click', () => {
    sqlInput.value = DEFAULT_QUERY;
    executeQuery(DEFAULT_QUERY);
});

sqlInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeQuery(sqlInput.value);
    }
});

presetContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (btn) {
        const query = btn.getAttribute('data-query');
        sqlInput.value = query;
        executeQuery(query);
    }
});

function executeQuery(query) {
    if (!db) return;
    const startTime = performance.now();
    try {
        const stmt = db.prepare(query);
        const columns = stmt.getColumnNames();
        const rows = [];

        while (stmt.step()) {
            rows.push(stmt.get());
        }
        stmt.free();

        const duration = (performance.now() - startTime).toFixed(1);
        lastColumns = columns;
        lastRows = rows;

        renderTable(columns, rows);
        resultsMeta.textContent = `(${rows.length} rows in${duration} ms)`;
        exportCsvBtn.disabled = rows.length === 0;
    } catch (err) {
        resultsContent.innerHTML = `<div class="error-msg"><strong>SQL Error:</strong> ${escapeHtml(err.message)}</div>`;
        resultsMeta.textContent = '';
        exportCsvBtn.disabled = true;
    }
}

// 5. Render Results Table
function renderTable(columns, rows) {
    if (rows.length === 0) {
        resultsContent.innerHTML = `<div class="placeholder-text">Query returned 0 rows.</div>`;
        return;
    }

    let html = '<table><thead><tr>';
    columns.forEach(col => {
        html += `<th>${escapeHtml(col)}</th>`;
    });
    html += '</tr></thead><tbody>';

    rows.forEach(row => {
        html += '<tr>';
        row.forEach(val => {
            const cell = val !== null ? escapeHtml(val) : '<span style="color:var(--text-muted)">NULL</span>';
            html += `<td>${cell}</td>`; }); html += '</tr>'; });  html += '</tbody></table>'; resultsContent.innerHTML = html; }  // 6. Export Current Results to CSV exportCsvBtn.addEventListener('click', () => { if (!lastRows.length) return; const csvLines = [ lastColumns.map(escapeCsv).join(','), ...lastRows.map(row => row.map(escapeCsv).join(',')) ]; const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'aqi_query_results.csv'; link.click(); URL.revokeObjectURL(url); });  function escapeCsv(val) { if (val === null \vert{}\vert{} val === undefined) return ''; const str = String(val); return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Start
initApp();