# Connecting the backend to Vultr Managed Database (MySQL)

The backend now speaks MySQL (schema below), but nothing points at a real
Vultr instance yet -- `DATABASE_URL` still defaults to local SQLite if
unset, so nothing breaks for anyone who hasn't done this setup.

## 1. Create the database on Vultr

1. https://my.vultr.com/ → **Products → Databases → Add Database**.
2. Engine: **MySQL** (pick the latest offered version). Plan: the cheapest
   tier is plenty for a hackathon demo.
3. Pick the region closest to wherever the backend actually runs (your
   laptop while demoing, or wherever it's deployed) -- managed-DB egress
   latency is real over a home connection.
4. Wait for status to flip to **Running** (a few minutes).

## 2. Get connection details

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

## 3. Allow your IP

Managed Databases are firewalled by default. On the **Access Control**
tab, add the public IP of whichever machine will run the backend (your
laptop's current public IP -- `curl ifconfig.me` -- or `0.0.0.0/0`
temporarily if convenient for a demo, tightened afterward).

## 4. Point the backend at it

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

## 5. Verify

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
  the test suite never touches the real Vultr instance. Good -- don't
  change that.
- **Idle disconnects.** `backend/db/session.py` sets `pool_pre_ping=True`
  for any non-SQLite engine specifically because managed databases close
  idle connections; without it you'd occasionally see a
  "MySQL server has gone away" error on the first query after a lull.
- **document_id / object_id are per-user/per-document counters, not
  global autoincrement.** MySQL has no native "auto-increment scoped to a
  second column" -- `document_service.next_document_id()` computes
  max+1 and `create_document()` retries once on a rare race. Fine at
  hackathon scale; a high-concurrency production version would want a
  proper sequence table with row locking instead.
