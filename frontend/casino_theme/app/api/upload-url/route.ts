// Proxies to the FastAPI backend's authenticated /storage/upload-url
// endpoint. This exists because:
//  1) blackjackTable.tsx's upload button runs in the browser and can't
//     hold the Object Storage secret key, so the presigned URL has to be
//     minted server-side.
//  2) This app has no login UI yet, so there's no real per-user token to
//     attach -- we log in as one shared demo account instead. Every
//     upload from this app lands under that one account's storage prefix
//     until real auth exists. Not real per-user separation; fine for a
//     hackathon demo, not something to carry further without building
//     actual login first.
//
// Runs server-side only (Route Handlers never ship to the browser), so
// BACKEND_URL/DEMO_ACCOUNT_* are safe here without a NEXT_PUBLIC_ prefix.

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000"
const DEMO_EMAIL = process.env.DEMO_ACCOUNT_EMAIL ?? "demo@hackrice-study-app.com"
const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD ?? "hackrice-demo-password"
const DEMO_USERNAME = process.env.DEMO_ACCOUNT_USERNAME ?? "hackrice_demo"

// Cached across requests on this server process. Access tokens last 8h
// (backend/core/config.py ACCESS_TOKEN_EXPIRE_MINUTES) -- plenty for a
// demo session; no need for real expiry tracking here.
let cachedToken: string | null = null

async function login(): Promise<string | null> {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/login/access-token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: DEMO_EMAIL, password: DEMO_PASSWORD }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.access_token ?? null
}

async function signup(): Promise<void> {
  await fetch(`${BACKEND_URL}/api/v1/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: DEMO_EMAIL, username: DEMO_USERNAME, password: DEMO_PASSWORD }),
  })
  // Ignore the response: a 400 "already exists" just means a previous
  // request (or server restart) already created this account -- fine.
}

async function getDemoToken(): Promise<string> {
  if (cachedToken) return cachedToken
  let token = await login()
  if (!token) {
    // First run: the demo account doesn't exist on the backend yet.
    await signup()
    token = await login()
  }
  if (!token) throw new Error("Could not authenticate the demo account against the backend")
  cachedToken = token
  return token
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const filename = searchParams.get("filename")
  const contentType = searchParams.get("contentType") ?? searchParams.get("content_type")
  if (!filename) {
    return Response.json({ error: "filename is required" }, { status: 400 })
  }

  try {
    let token = await getDemoToken()
    const params = new URLSearchParams({ filename })
    if (contentType) params.set("content_type", contentType)

    let backendRes = await fetch(`${BACKEND_URL}/api/v1/storage/upload-url?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (backendRes.status === 401) {
      // Cached token went stale (e.g. backend restarted with a new
      // SECRET_KEY) -- re-authenticate once and retry.
      cachedToken = null
      token = await getDemoToken()
      backendRes = await fetch(`${BACKEND_URL}/api/v1/storage/upload-url?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }

    if (!backendRes.ok) {
      const detail = await backendRes.text()
      return Response.json({ error: `Backend rejected the upload-url request: ${detail}` }, { status: backendRes.status })
    }

    const data = await backendRes.json()
    return Response.json(data)
  } catch (err) {
    console.error("upload-url route error:", err)
    return Response.json({ error: "Could not reach the backend" }, { status: 502 })
  }
}
