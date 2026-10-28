const fixedOrigins = new Set([
  'http://127.0.0.1:4181',
  'http://127.0.0.1:4182',
  'http://127.0.0.1:4183',
]);

/** Permit only explicitly selected local test servers, never arbitrary hosts or API origins. */
export function localFixtureOrigins(origins: readonly string[]) {
  if (!origins.length || origins.some(origin => !fixedOrigins.has(origin))) {
    throw new Error('Only fixed loopback test-server origins are supported');
  }
  return new Set(origins);
}
