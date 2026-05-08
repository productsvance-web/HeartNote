import type { NextConfig } from 'next';

// Cache-Control: no-store + must-revalidate on auth-sensitive routes.
// Disables browser BFCache so back-navigation never serves a stale auth-state
// page — closes a class of session-bleed UX bugs.
//
// iOS Safari caveat: historically less strict about no-store than Chrome/Edge.
// If iOS testing later reveals BFCache leakage, augment with a client-side
// `pageshow` reload listener on auth-sensitive pages.
const NO_STORE_HEADERS = [
  {
    key: 'Cache-Control',
    value: 'no-store, must-revalidate',
  },
];

const nextConfig: NextConfig = {
  // Next.js 16 blocks dev resources (HMR, _next/static) from non-localhost origins
  // by default. Phones on the LAN need their IP allow-listed for the JS bundle
  // to load and React to hydrate. Wildcard the local /24 so this survives
  // DHCP IP changes on the same router.
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '10.0.0.29',
    '10.0.0.*',
    '192.168.*.*',
    // Cloudflare Quick Tunnels (free, ephemeral). URLs are random per session
    // — wildcard the subdomain so we don't have to update this on each spin-up.
    '*.trycloudflare.com',
  ],

  async headers() {
    // `/me/:path*` and `/auth/:path*` use zero-or-more segment matching, so
    // `/me` (bare) is covered by `/me/:path*`. No need for both.
    return [
      { source: '/login', headers: NO_STORE_HEADERS },
      { source: '/onboarding', headers: NO_STORE_HEADERS },
      { source: '/me/:path*', headers: NO_STORE_HEADERS },
      { source: '/auth/:path*', headers: NO_STORE_HEADERS },
      // Family share snapshots: not auth-sensitive, but each request must
      // re-fetch from the DB so revoked/expired tokens stop resolving the
      // moment they're revoked. BFCache would let a sister navigate back
      // to a stale snapshot after the caregiver pulled the link.
      { source: '/s/:path*', headers: NO_STORE_HEADERS },
    ];
  },
};

export default nextConfig;
