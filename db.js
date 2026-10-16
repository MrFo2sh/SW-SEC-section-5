// db.js  -----------------------------------------------------------
// Builds an in-memory SQLite database using sql.js (pure WASM, no native build).
// The DB is re-seeded every time the server starts, so students can break it
// freely and just restart to reset.
// -------------------------------------------------------------------

const initSqlJs = require('sql.js');

// Seed data. The "secret" columns (password, credit_card) are what students
// will try to exfiltrate with a UNION-based injection.
const USERS = [
  // id, username, password,         email,                is_admin, credit_card
  [1, 'admin',   'S3cr3t_Adm1n!',   'admin@shop.local',   1, '4111-1111-1111-1111'],
  [2, 'alice',   'alice1990',        'alice@shop.local',   0, '5500-0000-0000-0004'],
  [3, 'bob',     'qwerty',           'bob@shop.local',     0, '3400-0000-0000-009'],
  [4, 'charlie', 'P@ssw0rd123',      'charlie@shop.local', 0, '6011-0000-0000-0004'],
];

const PRODUCTS = [
  // id, name,          description,                               price, category
  [1, 'Nova X Pro',     '6.7" OLED 120Hz, 256GB, triple camera',   899.0, 'flagship'],
  [2, 'Galaxo S25',     'Snapdragon Elite, 512GB, 200MP camera',  1099.0, 'flagship'],
  [3, 'Fruit Phone 15', '6.1" Super Retina, 128GB, A17 chip',      999.0, 'flagship'],
  [4, 'Nova Lite',      '6.1" display, 128GB, big battery',        299.0, 'budget'],
  [5, 'BudgetOne A3',   'Entry level 4G, 64GB, dual SIM',          149.0, 'budget'],
  [6, 'Fast Charger 65W','USB-C GaN charger + braided cable',       29.99,'accessories'],
];

async function buildDatabase() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE users (
      id          INTEGER PRIMARY KEY,
      username    TEXT,
      password    TEXT,
      email       TEXT,
      is_admin    INTEGER,
      credit_card TEXT
    );
    CREATE TABLE products (
      id          INTEGER PRIMARY KEY,
      name        TEXT,
      description TEXT,
      price       REAL,
      category    TEXT
    );
  `);

  const insU = db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)');
  USERS.forEach((r) => insU.run(r));
  insU.free();

  const insP = db.prepare('INSERT INTO products VALUES (?,?,?,?,?)');
  PRODUCTS.forEach((r) => insP.run(r));
  insP.free();

  return db;
}

// Run a raw SQL string and return { columns, rows } or throw the DB error.
// sql.js .exec() returns [] for statements with no result set.
function runQuery(db, sql) {
  const res = db.exec(sql);
  if (res.length === 0) return { columns: [], rows: [] };
  return { columns: res[0].columns, rows: res[0].values };
}

module.exports = { buildDatabase, runQuery };
