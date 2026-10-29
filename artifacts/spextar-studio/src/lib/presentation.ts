const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isIdentityId = (value: unknown): boolean => typeof value === 'string' && uuid.test(value.trim());

export function identityLabel(name?: string | null, email?: string | null): string {
  for (const value of [name, email]) {
    if (typeof value === 'string' && value.trim() && !isIdentityId(value)) return value.trim();
  }
  return 'Unknown user';
}

export function documentVersionLabel(value?: string | null, prefix = false): string {
  const version = value?.trim();
  if (!version || ['—', '–', '-', 'unversioned'].includes(version.toLowerCase())) return 'Unversioned';
  return prefix && !/^v/i.test(version) ? `v${version}` : version;
}
