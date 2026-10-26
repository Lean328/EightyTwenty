/** Locally unique ids for client-side records (cart lines, mock rows). Not cryptographically random. */
export function localId(prefix = ''): string {
  return prefix + (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
}
