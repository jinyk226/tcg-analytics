import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without this, Next infers the root
  // by walking up to the nearest lockfile and can pick a stray one above the
  // repo (e.g. an accidental ~/package-lock.json).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
