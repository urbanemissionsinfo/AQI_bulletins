// === CONFIGURATION ===
// Primary location of the SQLite file, relative to index.html.
// If it is not found there, the fallbacks below are tried in order.
const DB_FILE_PATH = '../data/Processed/aqi-bulletins.db';
const DB_FALLBACK_PATHS = [
    'aqi-bulletins.db',
    'data/aqi-bulletins.db',
    'data/Processed/aqi-bulletins.db'
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
        // Compares cities fairly: only days with at least 5 reporting stations count,
        // and cities need 100+ such days. CPCB "Poor" starts at AQI 201.
        label: 'Most polluted cities (share of Poor or worse days)',
        sql: `SELECT city,
       COUNT(*) AS well_covered_days,
       SUM(aqi >= 201) AS poor_or_worse_days,
       ROUND(100.0 * SUM(aqi >= 201) / COUNT(*), 1) AS pct_poor_or_worse,
       SUM(aqi >= 401) AS severe_days,
       ROUND(AVG(aqi), 1) AS mean_aqi,
       MAX(aqi) AS peak_aqi
FROM aqi_bulletins
WHERE no_stations >= 5 AND aqi IS NOT NULL
GROUP BY city
HAVING COUNT(*) >= 100
ORDER BY pct_poor_or_worse DESC
LIMIT 25;`
    },
    {
        // Pivots month of year into columns, so winter peaks and monsoon dips show up per city.
        label: 'Seasonal fingerprint (mean AQI by month, per city)',
        sql: `SELECT city,
       COUNT(*) AS days,
       ROUND(AVG(CASE WHEN SUBSTR(date, 6, 2) = '01' THEN aqi END)) AS jan,
       ROUND(AVG(CASE WHEN SUBSTR(date, 6, 2) = '02' THEN aqi END)) AS feb,
       ROUND(AVG(CASE WHEN SUBSTR(date, 6, 2) = '03' THEN aqi END)) AS mar,
       ROUND(AVG(CASE WHEN SUBSTR(date, 6, 2) = '04' THEN aqi END)) AS apr,
       ROUND(AVG(CASE WHEN SUBSTR(date, 6, 2) = '05' THEN aqi END)) AS may,
       ROUND(AVG(CASE WHEN SUBSTR(date, 6, 2) = '06' THEN aqi END)) AS jun,
       ROUND(AVG(CASE WHEN SUBSTR(date, 6, 2) = '07' THEN aqi END)) AS jul,
       ROUND(AVG(CASE WHEN SUBSTR(date, 6, 2) = '08' THEN aqi END)) AS aug,
       ROUND(AVG(CASE WHEN SUBSTR(date, 6, 2) = '09' THEN aqi END)) AS sep,
       ROUND(AVG(CASE WHEN SUBSTR(date, 6, 2) = '10' THEN aqi END)) AS oct,
       ROUND(AVG(CASE WHEN SUBSTR(date, 6, 2) = '11' THEN aqi END)) AS nov,
       ROUND(AVG(CASE WHEN SUBSTR(date, 6, 2) = '12' THEN aqi END)) AS dec
FROM aqi_bulletins
WHERE aqi IS NOT NULL AND no_stations >= 5
GROUP BY city
HAVING COUNT(*) >= 365
ORDER BY AVG(aqi) DESC
LIMIT 20;`
    },
    {
        // Only years with 300+ daily records are used, so partial years do not
        // distort the first-versus-latest comparison.
        label: 'Who improved? Earliest vs latest full year',
        sql: `WITH yearly AS (
    SELECT city,
           SUBSTR(date, 1, 4) AS year,
           COUNT(*) AS days,
           AVG(aqi) AS mean_aqi
    FROM aqi_bulletins
    WHERE aqi IS NOT NULL
    GROUP BY city, year
    HAVING COUNT(*) >= 300
),
bounds AS (
    SELECT city, MIN(year) AS first_year, MAX(year) AS last_year
    FROM yearly
    GROUP BY city
    HAVING MIN(year) < MAX(year)
)
SELECT b.city,
       b.first_year,
       ROUND(f.mean_aqi, 1) AS first_year_mean,
       b.last_year,
       ROUND(l.mean_aqi, 1) AS last_year_mean,
       ROUND(l.mean_aqi - f.mean_aqi, 1) AS change_in_aqi,
       ROUND(100.0 * (l.mean_aqi - f.mean_aqi) / f.mean_aqi, 1) AS pct_change
FROM bounds b
JOIN yearly f ON f.city = b.city AND f.year = b.first_year
JOIN yearly l ON l.city = b.city AND l.year = b.last_year
ORDER BY change_in_aqi;`
    },
    {
        // Looks only at Poor-or-worse days and finds each city's leading pollutant on them.
        label: 'What drives bad days in each city?',
        sql: `WITH bad_days AS (
    SELECT city, prominent_pollutant, COUNT(*) AS days
    FROM aqi_bulletins
    WHERE aqi >= 201 AND prominent_pollutant IS NOT NULL
    GROUP BY city, prominent_pollutant
),
ranked AS (
    SELECT city,
           prominent_pollutant,
           days,
           SUM(days) OVER (PARTITION BY city) AS total_bad_days,
           RANK() OVER (PARTITION BY city ORDER BY days DESC) AS rnk
    FROM bad_days
)
SELECT city,
       prominent_pollutant AS leading_pollutant,
       days AS days_as_leading,
       total_bad_days AS poor_or_worse_days,
       ROUND(100.0 * days / total_bad_days, 1) AS share_pct
FROM ranked
WHERE rnk = 1 AND total_bad_days >= 30
ORDER BY total_bad_days DESC;`
    },
    {
        // Gaps-and-islands: consecutive dates share the same (date number minus row number),
        // so grouping on that value gives each unbroken run of bad days.
        label: 'Longest runs of Very Poor or Severe days',
        sql: `WITH bad AS (
    SELECT city,
           date,
           julianday(date) - ROW_NUMBER() OVER (PARTITION BY city ORDER BY date) AS run_id
    FROM aqi_bulletins
    WHERE aqi >= 301
)
SELECT city,
       MIN(date) AS run_start,
       MAX(date) AS run_end,
       COUNT(*) AS consecutive_days
FROM bad
GROUP BY city, run_id
ORDER BY consecutive_days DESC, run_start DESC
LIMIT 25;`
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

const filterPanel = document.getElementById('filterPanel');
const cityFilter = document.getElementById('cityFilter');
const dateGroup = document.getElementById('dateGroup');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const categoryChecks = document.getElementById('categoryChecks');
const pollutantChecks = document.getElementById('pollutantChecks');
const stationsFilter = document.getElementById('stationsFilter');
const sortFilter = document.getElementById('sortFilter');
const limitFilter = document.getElementById('limitFilter');
const matchCount = document.getElementById('matchCount');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');

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
        presetContainer.querySelectorAll('button').forEach(b => { b.disabled = false; });

        setupFilters();
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

// The seven pollutants CPCB reports as "prominent". The data column can hold several of
// them in one value (for example "PM2.5, PM10"), so each is matched with LIKE '%name%'.
const POLLUTANTS = [
    { label: 'PM2.5', patterns: ['PM2.5'] },
    { label: 'PM10',  patterns: ['PM10'] },
    { label: 'NO\u2082', patterns: ['NO2'] },
    { label: 'SO\u2082', patterns: ['SO2'] },
    { label: 'CO',    patterns: ['CO'] },
    { label: 'O\u2083', patterns: ['O3'] },
    { label: 'NH\u2083', patterns: ['NH3'] }
];

// CPCB AQI bands, shown next to each category so the numbers are clear to everyone
const CATEGORY_RANGES = {
    'good': '0\u201350',
    'satisfactory': '51\u2013100',
    'moderate': '101\u2013200',
    'poor': '201\u2013300',
    'very poor': '301\u2013400',
    'severe': '401\u2013500'
};

const SORT_OPTIONS = {
    newest:  'date DESC',
    oldest:  'date ASC',
    highest: 'aqi DESC, date DESC',
    lowest:  'aqi IS NULL, aqi ASC, date DESC',
    city:    'city ASC, date DESC'
};

let dataMinDate = '';
let dataMaxDate = '';
let dateHasTime = false;

function sqlQuote(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function categoryRank(name) {
    const i = CATEGORY_ORDER.indexOf(String(name).toLowerCase());
    return i === -1 ? CATEGORY_ORDER.length : i;
}

function likeClauses(patterns) {
    return patterns.map(p => `prominent_pollutant LIKE '%${p}%'`);
}

function setupFilters() {
    populateCities();
    buildCategoryChecks();
    buildPollutantChecks();
    setupDateRange();

    applyFiltersBtn.disabled = false;
    clearFiltersBtn.disabled = false;
    updateMatchCount();
}

function populateCities() {
    try {
        const res = db.exec('SELECT DISTINCT city FROM aqi_bulletins WHERE city IS NOT NULL ORDER BY city ASC;');
        (res.length ? res[0].values : []).forEach(([city]) => {
            const opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            cityFilter.appendChild(opt);
        });
    } catch (e) {
        console.warn('Could not list cities:', e);
    }
}

function buildCategoryChecks() {
    try {
        const res = db.exec('SELECT DISTINCT aqi_category FROM aqi_bulletins WHERE aqi_category IS NOT NULL;');
        const values = (res.length ? res[0].values.map(r => r[0]) : [])
            .sort((a, b) => categoryRank(a) - categoryRank(b));

        values.forEach(val => {
            const lower = String(val).toLowerCase().trim();
            const label = document.createElement('label');
            label.className = 'check';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = val;

            const chip = document.createElement('span');
            chip.className = `chip cat-${lower.replace(/\s+/g, '-')}`;
            chip.textContent = val;

            label.append(input, chip);

            if (CATEGORY_RANGES[lower]) {
                const range = document.createElement('span');
                range.className = 'range';
                range.textContent = `AQI ${CATEGORY_RANGES[lower]}`;
                label.append(range);
            }
            categoryChecks.appendChild(label);
        });
    } catch (e) {
        console.warn('Could not list AQI categories:', e);
    }
}

function buildPollutantChecks() {
    POLLUTANTS.forEach((p, index) => {
        let count = 0;
        try {
            const res = db.exec(`SELECT COUNT(*) FROM aqi_bulletins WHERE ${likeClauses(p.patterns).join(' OR ')};`);
            count = res[0].values[0][0];
        } catch (e) {
            console.warn(`Could not count ${p.label}:`, e);
        }

        const label = document.createElement('label');
        label.className = 'check' + (count === 0 ? ' is-disabled' : '');

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = String(index);
        input.disabled = count === 0;

        const name = document.createElement('span');
        name.textContent = p.label;

        const range = document.createElement('span');
        range.className = 'range';
        range.textContent = count === 0 ? 'none in data' : `${count.toLocaleString()} days`;

        label.title = count === 0 ? `${p.label} does not appear in this dataset` : '';
        label.append(input, name, range);
        pollutantChecks.appendChild(label);
    });
}

function setupDateRange() {
    try {
        const res = db.exec('SELECT MIN(SUBSTR(date, 1, 10)), MAX(SUBSTR(date, 1, 10)), MAX(LENGTH(date)) FROM aqi_bulletins;');
        const [min, max, maxLen] = res[0].values[0];
        const isoDate = /^\d{4}-\d{2}-\d{2}$/;

        if (!isoDate.test(min || '') || !isoDate.test(max || '')) {
            dateGroup.hidden = true; // dates are not in YYYY-MM-DD form, so skip the date picker
            return;
        }
        dataMinDate = min;
        dataMaxDate = max;
        dateHasTime = maxLen > 10;

        dateFrom.min = dateTo.min = min;
        dateFrom.max = dateTo.max = max;
        dateFrom.value = min;
        dateTo.value = max;
    } catch (e) {
        dateGroup.hidden = true;
        console.warn('Could not read the date range:', e);
    }
}

// Collect the WHERE conditions that match what the person has chosen
function collectFilters() {
    const conditions = [];

    if (cityFilter.value !== 'ALL') {
        conditions.push(`city = ${sqlQuote(cityFilter.value)}`);
    }

    if (!dateGroup.hidden) {
        const from = dateFrom.value;
        const to = dateTo.value;
        if (from && to && from > to) {
            return { conditions, error: 'The start date is after the end date.' };
        }
        const col = dateHasTime ? 'SUBSTR(date, 1, 10)' : 'date';
        if (from && from !== dataMinDate) conditions.push(`${col} >= ${sqlQuote(from)}`);
        if (to && to !== dataMaxDate) conditions.push(`${col} <= ${sqlQuote(to)}`);
    }

    const categories = [...categoryChecks.querySelectorAll('input:checked')].map(i => i.value);
    if (categories.length === 1) {
        conditions.push(`aqi_category = ${sqlQuote(categories[0])}`);
    } else if (categories.length > 1) {
        conditions.push(`aqi_category IN (${categories.map(sqlQuote).join(', ')})`);
    }

    const pollutantClauses = [...pollutantChecks.querySelectorAll('input:checked')]
        .flatMap(i => likeClauses(POLLUTANTS[Number(i.value)].patterns));
    if (pollutantClauses.length === 1) {
        conditions.push(pollutantClauses[0]);
    } else if (pollutantClauses.length > 1) {
        conditions.push(`(${pollutantClauses.join('\n       OR ')})`);
    }

    const minStations = parseInt(stationsFilter.value, 10);
    if (minStations > 0) {
        conditions.push(`no_stations >= ${minStations}`);
    }

    return { conditions, error: null };
}

function buildFilterSql() {
    const { conditions, error } = collectFilters();
    if (error) return { error };

    const lines = ['SELECT *', 'FROM aqi_bulletins'];
    conditions.forEach((c, i) => lines.push((i === 0 ? 'WHERE ' : '  AND ') + c));
    lines.push(`ORDER BY ${SORT_OPTIONS[sortFilter.value] || SORT_OPTIONS.newest}`);

    const limit = parseInt(limitFilter.value, 10);
    if (limit > 0) {
        lines.push(`LIMIT ${limit};`);
    } else {
        lines[lines.length - 1] += ';';
    }
    return { sql: lines.join('\n') };
}

// Live count under the filters, so people know what they will get before running it
function updateMatchCount() {
    if (!db) return;
    const { conditions, error } = collectFilters();

    if (error) {
        matchCount.textContent = error;
        matchCount.classList.add('warn');
        return;
    }
    matchCount.classList.remove('warn');

    try {
        const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
        const n = db.exec(`SELECT COUNT(*) FROM aqi_bulletins${where};`)[0].values[0][0];
        matchCount.textContent = n === 0
            ? 'No records match these filters.'
            : `${n.toLocaleString()} matching ${n === 1 ? 'record' : 'records'}`;
    } catch (e) {
        matchCount.textContent = '';
        console.warn('Could not count matches:', e);
    }
}

function clearFilters() {
    cityFilter.value = 'ALL';
    if (!dateGroup.hidden) {
        dateFrom.value = dataMinDate;
        dateTo.value = dataMaxDate;
    }
    filterPanel.querySelectorAll('input[type="checkbox"]').forEach(i => { i.checked = false; });
    stationsFilter.value = '0';
    sortFilter.value = 'newest';
    limitFilter.value = '100';
    updateMatchCount();
}

filterPanel.addEventListener('change', updateMatchCount);
clearFiltersBtn.addEventListener('click', clearFilters);

applyFiltersBtn.addEventListener('click', () => {
    const { sql, error } = buildFilterSql();
    if (error) {
        matchCount.textContent = error;
        matchCount.classList.add('warn');
        return;
    }
    sqlInput.value = sql;
    executeQuery(sql);
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