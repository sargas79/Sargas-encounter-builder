/** Small shared helpers used by several apps/services. */

export function randomHexSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(16);
}

/** Split a comma/semicolon/newline separated list, trimming entries; lowercased by default. */
export function splitList(value: string, lowercase = true): string[] {
  return value
    .split(/[,;\n]+/)
    .map((s) => (lowercase ? s.trim().toLowerCase() : s.trim()))
    .filter(Boolean);
}

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
