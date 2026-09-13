# Deploying the backend

The desktop app is only half the product. It ships the UI inside the
installer, but every account, document, study session and AI call lives in
`backend/` — so until that is running somewhere reachable, an installed
copy has nothing to talk to and login fails immediately.

This is also where **every secret lives**. None of them belong in the
installer: it is distributed to other people, and anything inside it is
readable by anyone who downloads it.

## Where each secret goes

| Secret | Lives in | Why there |
|---|---|---|
| `GOOGLE_API_KEY` | `backend/.env` **on the server** | Every Gemini call is made server-side. The app never sees this key. |
| `GEMINI_MODEL` | `backend/.env` on the server | Same request path. |
| `SECRET_KEY` | `backend/.env` on the server | Signs the login tokens. |
| `VULTR_*` | `backend/.env` on the server | Only `services/storage.py` touches object storage. |
| `smartspectraApiKey` | each user's own `config.json` | Per-person, never bundled — see below. |

`backend/.env` is gitignored. It is never committed, and it is never part
of a build.

## 1. Create a Vultr compute instance

Object storage is not a server. If you already have Vultr Object Storage
credentials, those are for *storing files* — they give you nowhere to run
FastAPI. You need a separate Compute instance.

1. <https://my.vultr.com/> → **Products → Compute → Deploy Server**
2. Shared CPU, smallest plan, **Ubuntu 24.04**. Pick a region near you.
3. Once it boots, note the public IP and SSH in.

## 2. Install and run the backend

```bash
ssh root@YOUR_SERVER_IP

apt update && apt install -y python3-venv python3-pip git nginx
git clone https://github.com/Clee2951/HackRice.git
cd HackRice
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

Create `backend/.env` on the server:

```bash
cat > backend/.env <<'EOF'
SECRET_KEY=PASTE_A_FRESH_64_CHAR_HEX_STRING
GOOGLE_API_KEY=PASTE_YOUR_GEMINI_KEY
GEMINI_MODEL=PASTE_A_MODEL_NAME_FROM_AI_STUDIO

# Optional: Vultr Object Storage for uploaded originals. Leave blank and
# documents are stored in the database instead -- the app works either way.
VULTR_STORAGE_ENDPOINT=https://REGION.vultrobjects.com
VULTR_ACCESS_KEY=
VULTR_SECRET_KEY=
VULTR_STORAGE_BUCKET=
EOF
```

Generate the secret key with:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Test it before going further:

```bash
.venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
# from your laptop:  curl http://YOUR_SERVER_IP:8000/api/health
```

## 3. Keep it running

`uvicorn` in a terminal dies when you log out. A systemd unit does not:

```bash
cat > /etc/systemd/system/studyloop.service <<'EOF'
[Unit]
Description=Study Loop API
After=network.target

[Service]
WorkingDirectory=/root/HackRice
ExecStart=/root/HackRice/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl enable --now studyloop
systemctl status studyloop
```

## 4. Put HTTPS in front of it

Worth doing even for a demo: the app sends a bearer token on every
request, and over plain HTTP that token crosses the network in clear text
on whatever Wi-Fi the machine is on.

```bash
apt install -y certbot python3-certbot-nginx

cat > /etc/nginx/sites-available/studyloop <<'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN;
    # Matches MAX_UPLOAD_BYTES in backend/core/config.py; nginx's 1 MB
    # default would reject a normal PDF before FastAPI ever saw it.
    client_max_body_size 12M;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

ln -s /etc/nginx/sites-available/studyloop /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d YOUR_DOMAIN
```

No domain? Skip certbot and use `http://YOUR_SERVER_IP` — it works, it is
just unencrypted. Say so if you demo it.

## 5. Point the installers at it

In GitHub: **Settings → Secrets and variables → Actions → Variables →
New repository variable**

```
Name:  BACKEND_URL
Value: https://your-domain   (or http://YOUR_SERVER_IP)
```

Then tag a release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

CI builds both installers with that URL compiled in and publishes them to
a GitHub Release. **Set the variable before tagging** — a release built
without it defaults to `127.0.0.1:8000` and reaches nothing on anyone
else's machine.

## Object storage: two things to fix first

If you are reusing the Vultr Object Storage credentials from the team's
earlier work, both of these apply.

**The keys are public.** They were committed to a public repository in a
`.env.example`, so anyone who has looked at it can read, overwrite, or
delete that bucket. Rotate them in the Vultr dashboard (**Products →
Object Storage → your subscription → S3 Credentials → Regenerate**) and
use the new pair. Committing a rotated key back into a repo puts you
straight back here.

**The bucket name in that file is not a bucket name.** `Rice Hackaton
2026` contains spaces and capitals, and S3 bucket names allow only
lowercase letters, digits, hyphens and periods (3–63 characters). That
string is the *subscription* display name. Get the real bucket name from
the **Buckets** tab, or create one — `hackrice-documents` is fine.

Object storage is optional. Leave the four `VULTR_*` values blank and
uploaded documents are stored in the database instead; everything else
behaves identically.

## The camera key stays with each user

`smartspectraApiKey` is deliberately not part of any of this. It goes in
`config.json` in the app's own data folder, on each person's machine:

- Windows — `%APPDATA%/Study Loop/config.json`
- macOS — `~/Library/Application Support/Study Loop/config.json`

```json
{ "smartspectraApiKey": "their-own-key" }
```

Bundling one key into the installer would hand the same secret to everyone
who downloads it, which the SDK's own documentation warns against. Without
a key the app runs normally and reports the camera as unavailable.

That same file also accepts `backendUrl`, which overrides whatever was
compiled in — useful for pointing an already-installed copy at a different
server without rebuilding.
