// server.js ---------------------------------------------------------
//  Vulnerable "GadgetShop" demo for the Week 5 SQL Injection lab.
//
//  !!  DELIBERATELY INSECURE.  RUN ON localhost ONLY.  NEVER DEPLOY.  !!
//
//  Two modes:
//    node server.js            -> VULNERABLE (string concatenation)
//    SECURE=1 node server.js   -> FIXED      (parameterized queries)
//
//  The SECURE mode is there so students can prove the same payloads
//  that broke the app now fail. Same UI, same endpoints.
// -------------------------------------------------------------------

const express = require('express');
const { buildDatabase, runQuery } = require('./db');

const SECURE = process.env.SECURE === '1';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.urlencoded({ extended: false }));

let db; // set after async DB build

// --- tiny HTML helpers --------------------------------------------
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title, body) {
  const banner = SECURE
    ? '<span class="rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1">🔒 SECURE MODE</span>'
    : '<span class="rounded-full bg-rose-100 text-rose-700 text-xs font-bold px-3 py-1">⚠ VULNERABLE MODE</span>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · PixelCart</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = { theme: { extend: { fontFamily: { sans: ['Inter','system-ui','sans-serif'] } } } };
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body class="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">

<header class="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
  <div class="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
    <a href="/" class="flex items-center gap-2 font-extrabold text-lg">
      <span class="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white">📱</span>
      <span>Pixel<span class="text-indigo-600">Cart</span></span>
    </a>
    <nav class="hidden sm:flex items-center gap-1 text-sm font-medium text-slate-600 ml-2">
      <a class="px-3 py-2 rounded-lg hover:bg-slate-100" href="/products">Shop</a>
      <a class="px-3 py-2 rounded-lg hover:bg-slate-100" href="/product?id=1">Deals</a>
      <a class="px-3 py-2 rounded-lg hover:bg-slate-100" href="/login">Account</a>
    </nav>
    <div class="ml-auto flex items-center gap-3">
      ${banner}
    </div>
  </div>
</header>

<main class="max-w-5xl mx-auto px-4 py-8">
${body}
</main>

<footer class="max-w-5xl mx-auto px-4 py-10 text-xs text-slate-400 border-t border-slate-200 mt-10">
  PixelCart teaching lab · the raw SQL executed is shown under each result so you can see how input flows into the query. Educational use on localhost only.
</footer>
</body>
</html>`;
}

// Collapsible "SQL executed" panel (dark, monospace).
function showSql(sql) {
  return `<details class="mt-6 group" open>
    <summary class="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-slate-700">▸ SQL executed (click to toggle)</summary>
    <pre class="mt-2 bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto text-[13px] leading-relaxed">${esc(sql)}</pre>
  </details>`;
}

// Raw result table, kept collapsible so UNION column mapping stays visible.
function resultTable(result) {
  if (!result.rows.length)
    return '<details class="mt-3"><summary class="cursor-pointer text-xs font-semibold text-slate-500">▸ Raw query result</summary><p class="mt-2 text-sm text-slate-500">No rows returned.</p></details>';
  const head = result.columns.map((c) => `<th class="px-3 py-2 text-left font-semibold text-slate-600">${esc(c)}</th>`).join('');
  const body = result.rows
    .map(
      (row, i) =>
        `<tr class="${i % 2 ? 'bg-slate-50' : 'bg-white'}">${row
          .map((c) => `<td class="px-3 py-2 border-t border-slate-100">${esc(c)}</td>`)
          .join('')}</tr>`
    )
    .join('');
  return `<details class="mt-3">
    <summary class="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-slate-700">▸ Raw query result (${result.rows.length} rows)</summary>
    <div class="mt-2 overflow-x-auto rounded-xl border border-slate-200">
      <table class="w-full text-sm"><thead class="bg-slate-100">${`<tr>${head}</tr>`}</thead><tbody>${body}</tbody></table>
    </div>
  </details>`;
}

// Product cards. Positionally maps row -> [id, name, description, price].
// When a UNION injection changes what those columns hold, the smuggled data
// shows up right inside the product cards — a realistic, visual demo.
function productCards(result) {
  if (!result.rows.length)
    return '<p class="col-span-full text-center text-slate-400 py-12">No products found.</p>';
  return result.rows
    .map((row) => {
      const name = esc(row[1]);
      const desc = esc(row[2]);
      const price = esc(row[3]);
      return `<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition">
        <div class="aspect-square rounded-xl bg-gradient-to-br from-indigo-100 via-slate-100 to-violet-100 grid place-items-center text-6xl mb-3">📱</div>
        <h3 class="font-semibold text-slate-800 truncate">${name}</h3>
        <p class="text-sm text-slate-500 line-clamp-2 min-h-[2.5rem]">${desc}</p>
        <div class="mt-3 flex items-center justify-between">
          <span class="text-indigo-600 font-extrabold">$${price}</span>
          <button class="text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3 py-1.5">Add to cart</button>
        </div>
      </div>`;
    })
    .join('');
}

function productGrid(result) {
  return `<div class="grid grid-cols-2 sm:grid-cols-3 gap-4">${productCards(result)}</div>`;
}

// --- routes --------------------------------------------------------

app.get('/', (req, res) => {
  const chip = (label, q) =>
    `<a href="/products?search=${encodeURIComponent(q)}" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-600 transition">${label}</a>`;
  res.send(
    page(
      'Home',
      `<section class="rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white p-8 sm:p-12 shadow-lg">
         <p class="uppercase tracking-widest text-xs font-semibold text-indigo-200">New season · free shipping</p>
         <h1 class="mt-2 text-3xl sm:text-4xl font-extrabold leading-tight">The phone you want,<br>at the price you like.</h1>
         <p class="mt-3 text-indigo-100 max-w-md">Flagships, budget picks and accessories. Search the catalog and grab a deal.</p>
         <form method="get" action="/products" class="mt-6 flex gap-2 max-w-md">
           <input name="search" placeholder="Search phones..." class="flex-1 rounded-xl px-4 py-3 text-slate-800 outline-none">
           <button class="rounded-xl bg-white text-indigo-700 font-semibold px-5 py-3 hover:bg-indigo-50">Search</button>
         </form>
       </section>

       <div class="mt-6 flex flex-wrap gap-2">
         ${chip('🔥 Flagship', 'Nova')}
         ${chip('💸 Budget', 'Budget')}
         ${chip('🔌 Accessories', 'Charger')}
         ${chip('All phones', '')}
       </div>

       <h2 class="mt-10 mb-4 text-lg font-bold text-slate-800">Featured</h2>
       ${productGrid(runQuery(db, 'SELECT id, name, description, price FROM products LIMIT 6'))}`
    )
  );
});

// ---- 1) String-context injection: /products?search=... ----
// Vulnerable query (4 visible columns -> ideal for UNION):
//   SELECT id, name, description, price FROM products
//   WHERE name LIKE '%<search>%'
app.get('/products', (req, res) => {
  const search = req.query.search || '';
  const form = `
    <form method="get" action="/products" class="flex gap-2 mb-6">
      <input name="search" placeholder="Search phones..." value="${esc(search)}"
        class="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-400">
      <button class="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-3">Search</button>
    </form>`;

  if (!('search' in req.query)) {
    const all = runQuery(db, 'SELECT id, name, description, price FROM products');
    return res.send(page('Shop', form + productGrid(all)));
  }

  try {
    let result, sqlShown;
    if (SECURE) {
      const sql = "SELECT id, name, description, price FROM products WHERE name LIKE '%' || ? || '%'";
      const stmt = db.prepare(sql);
      stmt.bind([search]);
      const rows = [];
      while (stmt.step()) rows.push(stmt.get());
      const columns = stmt.getColumnNames();
      stmt.free();
      result = { columns, rows };
      sqlShown = sql + '\n-- bound param: ' + JSON.stringify(search);
    } else {
      const sql =
        "SELECT id, name, description, price FROM products WHERE name LIKE '%" +
        search +
        "%'";
      result = runQuery(db, sql);
      sqlShown = sql;
    }
    const heading = `<p class="text-sm text-slate-500 mb-4">${result.rows.length} result(s) for "<b>${esc(search)}</b>"</p>`;
    res.send(page('Shop', form + heading + productGrid(result) + showSql(sqlShown) + resultTable(result)));
  } catch (e) {
    res.send(
      page(
        'Shop',
        form +
          `<div class="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 p-4 text-sm">DB error: ${esc(e.message)}</div>` +
          showSql('(query raised an error — useful signal for error-based injection)')
      )
    );
  }
});

// ---- 2) Numeric-context injection: /product?id=... ----
// Vulnerable query (no quotes around id):
//   SELECT id, name, description, price FROM products WHERE id = <id>
app.get('/product', (req, res) => {
  const id = req.query.id ?? '1';
  try {
    let result, sqlShown;
    if (SECURE) {
      const sql = 'SELECT id, name, description, price FROM products WHERE id = ?';
      const stmt = db.prepare(sql);
      stmt.bind([Number(id)]);
      const rows = [];
      while (stmt.step()) rows.push(stmt.get());
      const columns = stmt.getColumnNames();
      stmt.free();
      result = { columns, rows };
      sqlShown = sql + '\n-- bound param: ' + JSON.stringify(Number(id));
    } else {
      const sql = 'SELECT id, name, description, price FROM products WHERE id = ' + id;
      result = runQuery(db, sql);
      sqlShown = sql;
    }
    res.send(
      page(
        'Product',
        `<a href="/products" class="text-sm text-indigo-600 hover:underline">&larr; Back to shop</a>
         <div class="mt-4">${productGrid(result)}</div>` +
          showSql(sqlShown) +
          resultTable(result)
      )
    );
  } catch (e) {
    res.send(
      page(
        'Product',
        `<div class="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 p-4 text-sm">DB error: ${esc(e.message)}</div>`
      )
    );
  }
});

// ---- 3) Authentication bypass: POST /login ----
// Vulnerable query:
//   SELECT id, username, is_admin FROM users
//   WHERE username = '<u>' AND password = '<p>'
const loginForm = `
  <div class="max-w-sm mx-auto">
    <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 class="text-xl font-bold text-slate-800">Sign in to PixelCart</h1>
      <p class="text-sm text-slate-500 mt-1 mb-5">Access your orders and deals.</p>
      <form method="post" action="/login" class="space-y-3">
        <input name="username" placeholder="Username"
          class="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400">
        <input name="password" type="password" placeholder="Password"
          class="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-400">
        <button class="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3">Log in</button>
      </form>
    </div>
  </div>`;

app.get('/login', (req, res) => {
  res.send(page('Login', loginForm));
});

app.post('/login', (req, res) => {
  const u = req.body.username || '';
  const p = req.body.password || '';
  try {
    let result, sqlShown;
    if (SECURE) {
      const sql = 'SELECT id, username, is_admin FROM users WHERE username = ? AND password = ?';
      const stmt = db.prepare(sql);
      stmt.bind([u, p]);
      const rows = [];
      while (stmt.step()) rows.push(stmt.get());
      const columns = stmt.getColumnNames();
      stmt.free();
      result = { columns, rows };
      sqlShown = sql + `\n-- bound params: ${JSON.stringify([u, p])}`;
    } else {
      const sql =
        "SELECT id, username, is_admin FROM users WHERE username = '" +
        u +
        "' AND password = '" +
        p +
        "'";
      result = runQuery(db, sql);
      sqlShown = sql;
    }

    const ok = result.rows.length > 0;
    const msg = ok
      ? `<div class="max-w-sm mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 p-6 text-center">
           <div class="text-3xl">✅</div>
           <p class="mt-2 font-bold text-emerald-800">Login OK — welcome ${esc(result.rows[0][1])}!</p>
         </div>`
      : `<div class="max-w-sm mx-auto rounded-2xl bg-rose-50 border border-rose-200 p-6 text-center">
           <div class="text-3xl">❌</div>
           <p class="mt-2 font-bold text-rose-800">Invalid credentials.</p>
         </div>`;
    res.send(page('Login', msg + showSql(sqlShown) + resultTable(result)));
  } catch (e) {
    res.send(
      page(
        'Login',
        `<div class="max-w-sm mx-auto rounded-xl bg-amber-50 border border-amber-200 text-amber-800 p-4 text-sm">DB error: ${esc(e.message)}</div>`
      )
    );
  }
});

// --- boot ----------------------------------------------------------
buildDatabase().then((database) => {
  db = database;
  app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`  PixelCart SQLi lab running: http://localhost:${PORT}`);
    console.log(`  Mode: ${SECURE ? 'SECURE (parameterized)' : 'VULNERABLE'}`);
    console.log('  For educational use on localhost only. Do not deploy.');
    console.log('='.repeat(60));
  });
});
