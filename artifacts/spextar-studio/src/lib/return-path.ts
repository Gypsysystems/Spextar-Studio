/** Accept only same-app paths. Never permit external/protocol-relative redirects. */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
    || /[\\\u0000-\u0020\u007f]/.test(value) || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) return '/workspaces';
  try {
    const url = new URL(value, 'https://studio.invalid');
    const decodedPath = decodeURIComponent(url.pathname);
    if (url.origin !== 'https://studio.invalid' || decodedPath === '/sign-in' || decodedPath.startsWith('/sign-in/')) return '/workspaces';
    // Fragments are not needed by Studio routes and may contain auth material.
    return url.pathname + url.search;
  } catch { return '/workspaces'; }
}
