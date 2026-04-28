import type { NextConfig } from 'next';

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
  ],
};

export default nextConfig;
