// === CONFIGURATION ===
// Primary location of the SQLite file, relative to index.html.
// If it is not found there, the fallbacks below are tried in order.
const DB_FILE_PATH = '../data/Processed/aqi_bulletins.db';
const DB_FALLBACK_PATHS = [
    'aqi_bulletins.db',
    'data/aqi_bulletins.db',
    'data/Processed/aqi_bulletins.db'
];

const DEFAULT_QUERY = `SELECT *
FROM aqi_bulletins
ORDER BY date DESC
LIMIT 25;`;

// Rendering thousands of rows freezes the browser, so the table shows at most this many.
// The CSV download always contains every row of the result.
const MAX_RENDER_ROWS = 1000;

// CPCB categories from cleanest to most severe (used to order the dropdown)
const CATEGORY_ORDER = ['good', 'satisfactory', 'moderate', 'poor', 'very poor', 'severe'];

const PRESETS = [
    {
        label: 'City rankings (mean and peak AQI)',
        sql: `SELECT city,
       COUNT(*) AS days_recorded,
       ROUND(AVG(aqi), 1) AS mean_aqi,
       MAX(aqi) AS max_aqi,
       MAX(no_stations) AS stations
FROM aqi_bulletins
GROUP BY city
ORDER BY mean_aqi DESC;`
    },
    {
        label: 'Category breakdown per city',
        sql: `SELECT city, aqi_category, COUNT(*) AS days
FROM aqi_bulletins
GROUP BY city, aqi_category
ORDER BY city, days DESC;`
    },
    {
        label: 'Monthly AQI trend (all cities)',
        sql: `SELECT SUBSTR(date, 1, 7) AS year_month,
       ROUND(AVG(aqi), 1) AS monthly_avg_aqi,
       COUNT(*) AS records
FROM aqi_bulletins
GROUP BY year_month
ORDER BY year_month DESC;`
    },
    {
        label: 'Dominant pollutants and severity',
        sql: `SELECT prominent_pollutant,
       COUNT(*) AS occurrences,
       ROUND(AVG(aqi), 1) AS avg_aqi_when_prominent
FROM aqi_bulletins
WHERE prominent_pollutant IS NOT NULL
GROUP BY prominent_pollutant
ORDER BY occurrences DESC;`
    },
    {
        label: 'Severe episodes (AQI 400 or more)',
        sql: `SELECT date, city, aqi, aqi_category, prominent_pollutant, no_stations
FROM aqi_bulletins
WHERE aqi >= 400
ORDER BY aqi DESC
LIMIT 50;`
    }
];

let db = null;
let lastColumns = [];
let lastRows = [];

// DOM elements
const dbStatus = document.getElementById('dbStatus');
const sqlInput = document.getElementById('sqlInput');
const runBtn = document.getElementById('runBtn');
const resetBtn = document.getElementById('resetBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const resultsContent = document.getElementById('resultsContent');
const resultsMeta = document.getElementById('resultsMeta');
const presetContainer = document.getElementById('presetContainer');

const cityFilter = document.getElementById('cityFilter');
const categoryFilter = document.getElementById('categoryFilter');
const pollutantFilter = document.getElementById('pollutantFilter');
const minAqiFilter = document.getElementById('minAqiFilter');
const minAqiVal = document.getElementById('minAqiVal');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');

// ---------------------------------------------------------------
// 1. Load the SQLite engine and the database file
// ---------------------------------------------------------------

// Every SQLite file starts with the text "SQLite format 3" followed by a zero byte.
function hasSqliteHeader(bytes) {
    const magic = 'SQLite format 3\u0000';
    if (bytes.length < magic.length) return false;
    for (let i = 0; i < magic.length; i++) {
        if (bytes[i] !== magic.charCodeAt(i)) return false;
    }
    return true;
}

async function fetchDatabase() {
    const paths = [...new Set([DB_FILE_PATH, ...DB_FALLBACK_PATHS])];
    const attempts = [];

    for (const path of paths) {
        // Show the absolute URL the browser actually requested, not just the relative path
        const fullUrl = new URL(path, location.href).href;
        try {
            const response = await fetch(fullUrl, { cache: 'no-cache' });
            if (!response.ok) {
                attempts.push(`${fullUrl}: not found (HTTP ${response.status})`);
                continue;
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (!hasSqliteHeader(bytes)) {
                attempts.push(
                    `${fullUrl}: the file was found but it is not a SQLite database ` +
                    `(a Git LFS pointer file or an HTML error page is the usual cause)`
                );
                continue;
            }
            return { bytes, path };
        } catch (err) {
            attempts.push(`${fullUrl}: ${err.message}`);
        }
    }

    const error = new Error('No usable database file was found.');
    error.attempts = attempts;
    throw error;
}

async function initApp() {
    sqlInput.value = DEFAULT_QUERY;
    renderPresets();

    try {
        if (typeof initSqlJs !== 'function') {
            throw new Error('The sql.js library did not load from cdnjs.cloudflare.com. Check your internet connection or any content blocker.');
        }

        const [SQL, found] = await Promise.all([
            initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}` }),
            fetchDatabase()
        ]);

        db = new SQL.Database(found.bytes);

        // Confirm the expected table exists before enabling the UI
        const check = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'aqi_bulletins';");
        if (!check.length) {
            throw new Error(`The file ${found.path} loaded, but it has no table named aqi_bulletins.`);
        }

        dbStatus.textContent = `Connected: ${found.path}`;
        dbStatus.className = 'status-badge success';

        sqlInput.disabled = false;
        runBtn.disabled = false;
        resetBtn.disabled = false;
        applyFiltersBtn.disabled = false;
        presetContainer.querySelectorAll('button').forEach(b => { b.disabled = false; });

        populateFilterDropdowns();
        executeQuery(DEFAULT_QUERY);
    } catch (err) {
        showLoadError(err);
    }
}

function showLoadError(err) {
    dbStatus.textContent = 'Database failed to load';
    dbStatus.className = 'status-badge error';

    let details = '';
    if (err.attempts && err.attempts.length) {
        details = '<ul>' + err.attempts.map(a => `<li>${escapeHtml(a)}</li>`).join('') + '</ul>';
    }

    const fileProtocolTip = location.protocol === 'file:'
        ? '<br>This page is open straight from disk (<code>file://</code>), and browsers block loading the database that way. Run <code>python -m http.server</code> in the repository folder and open <code>http://localhost:8000</code> instead.'
        : '';

    resultsContent.innerHTML = `
        <div class="error-msg">
            <strong>Could not load the database.</strong> ${escapeHtml(err.message)}
            ${details}
            Set <code>DB_FILE_PATH</code> at the top of <code>app.js</code> to the correct location of the
            <code>.db</code> file, relative to <code>index.html</code>. Paths are case sensitive on GitHub Pages.${fileProtocolTip}
        </div>`;
    resultsMeta.textContent = '';
    console.error(err);
}

// ---------------------------------------------------------------
// 2. Filter builder
// ---------------------------------------------------------------
function populateFilterDropdowns() {
    populateSelect(cityFilter, 'city');
    populateSelect(categoryFilter, 'aqi_category', (a, b) => categoryRank(a) - categoryRank(b));
    populateSelect(pollutantFilter, 'prominent_pollutant');
}

function categoryRank(name) {
    const i = CATEGORY_ORDER.indexOf(String(name).toLowerCase());
    return i === -1 ? CATEGORY_ORDER.length : i;
}

function populateSelect(selectElement, column, sorter) {
    try {
        const result = db.exec(
            `SELECT DISTINCT ${column} FROM aqi_bulletins WHERE ${column} IS NOT NULL ORDER BY ${column} ASC;`
        );
        const values = result.length ? result[0].values.map(row => row[0]) : [];
        if (sorter) values.sort(sorter);

        values.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            selectElement.appendChild(opt);
        });
    } catch (e) {
        console.warn(`Could not populate the ${column} dropdown:`, e);
    }
}

function sqlQuote(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

minAqiFilter.addEventListener('input', e => {
    minAqiVal.textContent = e.target.value;
});

applyFiltersBtn.addEventListener('click', () => {
    const conditions = [];

    if (cityFilter.value !== 'ALL') {
        conditions.push(`city = ${sqlQuote(cityFilter.value)}`);
    }
    if (categoryFilter.value !== 'ALL') {
        conditions.push(`aqi_category = ${sqlQuote(categoryFilter.value)}`);
    }
    if (pollutantFilter.value !== 'ALL') {
        conditions.push(`prominent_pollutant = ${sqlQuote(pollutantFilter.value)}`);
    }
    const minAqi = parseInt(minAqiFilter.value, 10);
    if (minAqi > 0) {
        conditions.push(`aqi >= ${minAqi}`);
    }

    const lines = ['SELECT *', 'FROM aqi_bulletins'];
    if (conditions.length) {
        lines.push(`WHERE ${conditions.join('\n  AND ')}`);
    }
    lines.push('ORDER BY date DESC', 'LIMIT 100;');

    const generatedSql = lines.join('\n');
    sqlInput.value = generatedSql;
    executeQuery(generatedSql);
});

// ---------------------------------------------------------------
// 3. Presets, run, reset, keyboard shortcut
// ---------------------------------------------------------------
function renderPresets() {
    PRESETS.forEach(preset => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'preset-btn';
        btn.textContent = preset.label;
        btn.disabled = true; // enabled once the database is loaded
        btn.addEventListener('click', () => {
            sqlInput.value = preset.sql;
            executeQuery(preset.sql);
        });
        presetContainer.appendChild(btn);
    });
}

runBtn.addEventListener('click', () => executeQuery(sqlInput.value));

resetBtn.addEventListener('click', () => {
    sqlInput.value = DEFAULT_QUERY;
    executeQuery(DEFAULT_QUERY);
});

sqlInput.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeQuery(sqlInput.value);
    }
});

// ---------------------------------------------------------------
// 4. Run a query
// ---------------------------------------------------------------
function executeQuery(query) {
    if (!db) return;

    const sql = String(query).trim();
    if (!sql) {
        resultsContent.innerHTML = '<div class="placeholder-text">Type a SQL query above, then choose Run query.</div>';
        resultsMeta.textContent = '';
        exportCsvBtn.disabled = true;
        return;
    }

    const startTime = performance.now();
    try {
        // exec() runs every statement in the editor and returns one result set per SELECT.
        // The last result set is shown.
        const results = db.exec(sql);
        const duration = (performance.now() - startTime).toFixed(1);

        if (!results.length) {
            lastColumns = [];
            lastRows = [];
            resultsContent.innerHTML = '<div class="placeholder-text">The query ran but returned no rows.</div>';
            resultsMeta.textContent = `0 rows in ${duration} ms`;
            exportCsvBtn.disabled = true;
            return;
        }

        const { columns, values } = results[results.length - 1];
        lastColumns = columns;
        lastRows = values;

        renderTable(columns, values);

        const total = values.length.toLocaleString();
        const shown = values.length > MAX_RENDER_ROWS ? `, showing the first ${MAX_RENDER_ROWS.toLocaleString()}` : '';
        resultsMeta.textContent = `${total} rows in ${duration} ms${shown}`;
        exportCsvBtn.disabled = false;
    } catch (err) {
        resultsContent.innerHTML = `<pre class="error-msg"><strong>SQL error:</strong> ${escapeHtml(err.message)}</pre>`;
        resultsMeta.textContent = '';
        exportCsvBtn.disabled = true;
    }
}

// ---------------------------------------------------------------
// 5. Render the results table
// ---------------------------------------------------------------
function renderTable(columns, rows) {
    const visible = rows.slice(0, MAX_RENDER_ROWS);

    let html = '<table><thead><tr>';
    columns.forEach((col, i) => {
        const numeric = visible.length > 0 && visible.every(r => r[i] === null || typeof r[i] === 'number');
        html += `<th${numeric ? ' class="num"' : ''}>${escapeHtml(col)}</th>`;
    });
    html += '</tr></thead><tbody>';

    visible.forEach(row => {
        html += '<tr>';
        row.forEach((val, i) => {
            html += renderCell(columns[i], val);
        });
        html += '</tr>';
    });
    html += '</tbody></table>';

    if (rows.length > MAX_RENDER_ROWS) {
        html += `<div class="truncation-note">Showing ${MAX_RENDER_ROWS.toLocaleString()} of ${rows.length.toLocaleString()} rows. Add a LIMIT or a WHERE clause to narrow the result, or download the CSV for every row.</div>`;
    }

    resultsContent.innerHTML = html;
}

function renderCell(column, val) {
    if (val === null || val === undefined) {
        return '<td><span class="null-value">NULL</span></td>';
    }
    if (typeof val === 'number') {
        return `<td class="num">${escapeHtml(val)}</td>`;
    }
    if (column === 'aqi_category') {
        const slug = String(val).toLowerCase().trim().replace(/\s+/g, '-');
        return `<td><span class="chip cat-${escapeHtml(slug)}">${escapeHtml(val)}</span></td>`;
    }
    return `<td>${escapeHtml(val)}</td>`;
}

// ---------------------------------------------------------------
// 6. Download the current results as CSV
// ---------------------------------------------------------------
exportCsvBtn.addEventListener('click', () => {
    if (!lastRows.length) return;

    const csvLines = [
        lastColumns.map(escapeCsv).join(','),
        ...lastRows.map(row => row.map(escapeCsv).join(','))
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aqi_query_results.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
});

function escapeCsv(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Start
initApp();