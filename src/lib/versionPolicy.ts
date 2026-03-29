/** Parse `major.minor.patch` (ignores prerelease suffix for comparison). */
export function parseVersionParts(version: string): number[] {
  const core = version.split(/[+]/)[0]?.split("-")[0]?.trim() ?? "";
  if (!core) return [];
  return core.split(".").map((x) => {
    const n = parseInt(x, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** True if `current` is strictly older than `minimum` (semver-like numeric tuple compare). */
export function isVersionBelowMinimum(
  current: string,
  minimum: string | undefined,
): boolean {
  if (!minimum?.trim()) return false;
  const a = parseVersionParts(current);
  const b = parseVersionParts(minimum);
  if (a.length === 0 || b.length === 0) return false;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const da = a[i] ?? 0;
    const db = b[i] ?? 0;
    if (da < db) return true;
    if (da > db) return false;
  }
  return false;
}
