import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // There are two package.json/lockfile pairs under frontend/ -- this
  // Next app, and the Electron shell that loads it. Without an explicit
  // root, Turbopack picks the Electron one (it's the outer directory) and
  // warns on every build. Pin it to this app.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
