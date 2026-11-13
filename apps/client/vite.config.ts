import { defineConfig } from "vite";

// Listen on every interface so the game can be opened from other devices on the
// LAN or the tailnet (http://<tailscale-ip-or-name>:5173). `.ts.net` allows
// Tailscale MagicDNS host names through Vite's host check.
const share = { host: true, port: 5173, strictPort: true, allowedHosts: [".ts.net"] };

export default defineConfig({ server: share, preview: share });
