# Connecting the backend to a MySQL database

The backend now speaks MySQL (schema in `vultr-mysql-schema.md`), but
`DATABASE_URL` still defaults to local SQLite if unset, so nothing breaks
for anyone who hasn't done this setup.

**What we actually ended up running:** a self-hosted MySQL on a plain
Vultr VPS the team already had (Ubuntu, `root@<ip>`), not the Managed
Database product this doc originally assumed. See "What we actually did"
near the bottom for the exact steps and current connection details. The
Managed Database walkthrough below is kept for reference in case the team
switches to it later (it's a meaningfully different, more turnkey setup
-- managed backups, enforced TLS with a provided CA cert, a dashboard
firewall instead of manual `ufw`).

## What we actually did (self-hosted on a plain Vultr VPS)

The team already had a Vultr VPS (`root@96.30.193.80`, Ubuntu). Steps
taken, for reference/reproducing on another box:

1. **Installed MySQL**: `sudo apt update && sudo apt install -y mysql-server`,
   then `sudo systemctl enable --now mysql`.
2. **Created a dedicated app database + user** (never expose `root` over
   the network) via `sudo mysql`:
   ```sql
   CREATE DATABASE hackrice CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'hackrice_app'@'%' IDENTIFIED BY '<generated with: openssl rand -base64 24>';
   GRANT ALL PRIVILEGES ON hackrice.* TO 'hackrice_app'@'%';
   FLUSH PRIVILEGES;
   ```
3. **Made MySQL listen publicly**, not just on localhost: changed
   `bind-address` in `/etc/mysql/mysql.conf.d/mysqld.cnf` from
   `127.0.0.1` to `0.0.0.0`, then `sudo systemctl restart mysql`.
4. **Opened the firewall port**: `sudo ufw allow 3306/tcp` (checked
   `sudo ufw status` first to confirm SSH/22 was already allowed --
   enabling ufw without that first would have locked out SSH access to
   the box entirely). No TLS/CA cert involved here (unlike the Managed
   Database product below) -- traffic to this DB is unencrypted. Acceptable
   for a hackathon demo; would need `require_secure_transport` + a real
   cert for anything beyond that.
5. **Set `DATABASE_URL` in `backend/.env`**:
   ```
   DATABASE_URL=mysql+pymysql://hackrice_app:<password>@96.30.193.80:3306/hackrice
   ```
6. Ran `Base.metadata.create_all(bind=engine)` once by hand to create the
   7 tables (`users`, `documents`, `document_objects`, `studysession`,
   `recallattempt`, `chatmessage`, `wellbeingreading`) -- `main.py`'s
   lifespan also does this automatically on every backend startup, so
   this only mattered for confirming it worked before running the app.
7. **Verified with a live end-to-end run** (signup → upload → session →
   chat → wellbeing → recall → advance) against the real Gemini API and
   this real database -- caught and fixed a real bug in the process (see
   "MySQL compatibility fixes" in `vultr-mysql-schema.md`: `Float`
   columns silently losing timestamp precision on MySQL). Tables were
   dropped and recreated once after that fix to pick up the corrected
   column types, then truncated to leave the shared DB clean for the team.

If you're setting this up on a fresh box, the same 7 steps apply --
just substitute your own IP/password.

## Managed Database walkthrough (reference only -- not what we're running)

The steps below describe Vultr's **Managed Database** product instead,
kept in case the team switches to it later for the turnkey backups/TLS/
firewall it provides.

### 1. Create the database on Vultr

1. https://my.vultr.com/ → **Products → Databases → Add Database**.
2. Engine: **MySQL** (pick the latest offered version). Plan: the cheapest
   tier is plenty for a hackathon demo.
3. Pick the region closest to wherever the backend actually runs (your
   laptop while demoing, or wherever it's deployed) -- managed-DB egress
   latency is real over a home connection.
4. Wait for status to flip to **Running** (a few minutes).

### 2. Get connection details

On the instance's **Overview** tab, Vultr shows: host, port, user (default
`vultradmin`), password, and default database name. There's also a
**Connection Details** section with:
- A ready-made `mysql://...` connection string.
- A **Download CA certificate** button -- get this file. Vultr enforces
  TLS on managed databases; without the CA cert, PyMySQL's connection will
  fail (or you'd have to explicitly disable TLS verification, which you
  should not do for anything with real user data in it).

Save the downloaded cert somewhere in the repo that's already gitignored,
e.g. `backend/vultr-ca.pem` (add it to `.gitignore` if it isn't covered
already -- it's not a secret by itself, but keep credentials and certs out
of git as a habit).

### 3. Allow your IP

Managed Databases are firewalled by default. On the **Access Control**
tab, add the public IP of whichever machine will run the backend (your
laptop's current public IP -- `curl ifconfig.me` -- or `0.0.0.0/0`
temporarily if convenient for a demo, tightened afterward).

### 4. Point the backend at it

In `backend/.env` (not `.env.example` -- that's the committed template):

```
DATABASE_URL=mysql+pymysql://vultradmin:<password>@<host>:<port>/<database>?ssl_ca=backend/vultr-ca.pem
```

Then from the repo root, with `.venv-local` active:

```bash
pip install -r backend/requirements.txt   # installs PyMySQL
python -m uvicorn backend.main:app --reload
```

`Base.metadata.create_all()` in `main.py`'s lifespan runs on startup and
will create all tables fresh on the new database -- there's nothing to
migrate since this Vultr instance has never had this schema before.

### 5. Verify

```bash
curl http://127.0.0.1:8000/api/health
```

Then run through a signup → login → upload → session flow (Swagger UI at
`/docs` is the easiest way) and check the tables actually populated, e.g.
via the Vultr dashboard's **phpMyAdmin**-style query tool if it offers
one, or `mysql -h <host> -P <port> -u vultradmin -p --ssl-ca=backend/vultr-ca.pem <database>`
locally.

## Notes / gotchas

- **Tests are unaffected.** `tests/test_backend.py` hardcodes
  `DATABASE_URL=sqlite://` (in-memory) regardless of what's in `.env`, so
  the test suite never touches the real database. Good -- don't change
  that.
- **Idle disconnects.** `backend/db/session.py` sets `pool_pre_ping=True`
  for any non-SQLite engine, since both self-hosted and managed remote
  databases can close idle connections; without it you'd occasionally see
  a "MySQL server has gone away" error on the first query after a lull.
- **This DB is shared by the whole team.** Everyone's backend should point
  `DATABASE_URL` at the same `96.30.193.80` instance -- don't spin up a
  second one per person, or you'll each be looking at different data.
- **document_id / object_id are per-user/per-document counters, not
  global autoincrement.** MySQL has no native "auto-increment scoped to a
  second column" -- `document_service.next_document_id()` computes
  max+1 and `create_document()` retries once on a rare race. Fine at
  hackathon scale; a high-concurrency production version would want a
  proper sequence table with row locking instead.
