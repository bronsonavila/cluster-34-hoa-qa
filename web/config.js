// Chat webhook URL the UI calls.
// - Local dev: the localhost default below.
// - VPS: the cloud nginx container regenerates this file at startup from
//   N8N_PUBLIC_URL, so you do not edit it by hand for production.
window.N8N_WEBHOOK_URL =
  'http://localhost:5678/webhook/c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f/chat'

// Optional Cloudflare Web Analytics beacon token. This committed file is the
// local-dev default; in the cloud the web container regenerates config.js from
// scratch at startup, adding a `window.CF_BEACON_TOKEN = '...'` line when the
// CF_BEACON_TOKEN env var is set. index.html injects the beacon only if the
// token is present, so local dev (no token) loads no analytics.
