// Resolve the externally-visible origin behind a proxy. Server actions pass
// `await headers()`; route handlers pass `request.headers`. Either way, prefer
// X-Forwarded-* (set by Vercel + most reverse proxies) and fall back to Host.
export function resolveOrigin(h: Headers): string {
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}
