import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local-dev workaround: on this machine, the browser can't reach the API
  // directly on :8000 (curl can, browser can't — even in a clean incognito
  // window with every extension disabled, pointing at a proxy/firewall/
  // policy layer specific to the browser, not this app). Routing API calls
  // through Next's own server removes the browser-to-:8000 hop entirely —
  // the browser only ever talks to same-origin :3000, and Next forwards
  // server-side, where curl already proved it works. Paired with
  // NEXT_PUBLIC_API_URL=/api-proxy in apps/web/.env; every lib/*.ts file
  // already builds its URL as `${API_URL}/path`, so this needs no changes
  // there. Remove if the underlying browser/network issue gets fixed
  // directly instead — this is a workaround, not the correct end state.
  async rewrites() {
    const target = process.env.LOCAL_API_PROXY_TARGET ?? "http://127.0.0.1:8000";
    return [{ source: "/api-proxy/:path*", destination: `${target}/:path*` }];
  },
};

export default nextConfig;
