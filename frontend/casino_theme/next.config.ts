import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Export to plain HTML/JS so the Electron app can serve the UI itself.
  // A packaged .exe has no `next dev` to point at, and every page here is a
  // client component with no server actions or route handlers, so there is
  // nothing that needs a Node server at runtime. `next dev` still works
  // normally for development.
  output: "export",
  // Assets are served from the app's own loopback server (see
  // frontend/main.js), so relative paths keep working no matter which
  // port that server lands on.
  images: { unoptimized: true },
  // There are two package.json/lockfile pairs under frontend/ -- this
  // Next app, and the Electron shell that loads it. Without an explicit
  // root, Turbopack picks the Electron one (it's the outer directory) and
  // warns on every build. Pin it to this app.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
