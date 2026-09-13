// uiServer.js
// Serves the exported Next.js UI (casino_theme's `output: "export"` build)
// over loopback for the Electron window to load.
//
// Loopback HTTP rather than file:// on purpose. Next's client-side router
// fetches its own RSC payloads (the .txt files beside each page) when
// navigating from the table to the reader, and those fetches are subject to
// the page's origin: under file:// every one of them is a cross-origin
// request to an opaque origin and is blocked, so the app loads and then
// refuses to navigate. Over http://127.0.0.1 it is an ordinary same-origin
// app.
//
// Split out of main.js so the routing can be tested directly -- it is the
// one piece of packaging behaviour with real logic in it, and launching a
// whole Electron app to check a 404 is a poor trade.

const fs = require("fs");
const http = require("http");
const path = require("path");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Map a request path to a file inside uiDir, or null if it escapes.
 *
 * Next exports `/reader` as both `reader.html` and `reader/index.html`, and
 * asset requests arrive as plain paths, so all three shapes are tried. The
 * containment check is what stops a `..` in the URL from reading outside
 * the UI directory -- this server is loopback-only, but it is still a
 * server, and path traversal is exactly the bug not to ship in one. */
function resolveUiFile(uiDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null; // Malformed percent-encoding.
  }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const base = path.resolve(uiDir);
  for (const candidate of [relative, `${relative}.html`, path.join(relative, "index.html")]) {
    const full = path.resolve(base, candidate);
    if (full !== base && !full.startsWith(base + path.sep)) continue;
    try {
      if (fs.statSync(full).isFile()) return full;
    } catch {
      // Not this shape; try the next.
    }
  }
  return null;
}

/** Start the server and resolve with its base URL.
 *
 * Port 0 lets the OS pick a free one, so two copies can run at once and
 * nothing collides with whatever else the user has listening. Bound to
 * 127.0.0.1, never 0.0.0.0 -- this should not become reachable from the
 * network just because someone installed the app. */
function startUiServer(uiDir) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(uiDir)) {
      reject(new Error(`UI build not found at ${uiDir}. Run \`npm run build\` in frontend/casino_theme.`));
      return;
    }
    const server = http.createServer((req, res) => {
      const file = resolveUiFile(uiDir, req.url || "/");
      if (!file) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": CONTENT_TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(file).pipe(res);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, server });
    });
  });
}

module.exports = { startUiServer, resolveUiFile, CONTENT_TYPES };
