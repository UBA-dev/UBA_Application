import type { NextConfig } from "next";

// NOTE: this project previously had a next.config.ts wrapped with
// @serwist/next (PWA/service worker support) sitting inside public/ by
// mistake, so Next.js was never actually reading it — the "Install app"
// PWA feature has never been active in production. @serwist/next also
// doesn't support Turbopack (Next.js 16's default bundler) yet, so it
// can't simply be re-enabled here without a separate migration to
// @serwist/turbopack or an explicit webpack build. Left out for now so
// this fix stays focused on the firebase-admin crash below; re-adding
// PWA support is a follow-up, not a blocker.
const nextConfig: NextConfig = {
  // firebase-admin (used by every secured API route) pulls in jwks-rsa ->
  // jose, and jose ships ESM-only in newer versions. Turbopack's default
  // server bundling trips over that require()/ESM mismatch at runtime
  // ("ERR_REQUIRE_ESM"), which crashes any route that imports
  // firebase-admin before it can even return a response. Marking it
  // external tells Next.js to load it with Node's native require() at
  // runtime instead of bundling it, which sidesteps the interop bug.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
