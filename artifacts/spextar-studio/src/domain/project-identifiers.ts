/** Presentation-safe helpers shared by forms and adapters; no fixture/storage imports. */
export function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '')
    .trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 48);
}

export function suggestKey(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  let key = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '');
  if (!/^[A-Z]/.test(key)) key = `P${key}`;
  // Project keys require at least two characters.
  return (key || 'PRJ').padEnd(2, 'X').slice(0, 6);
}
