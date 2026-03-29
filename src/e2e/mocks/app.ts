/** Playwright E2E — see `globalThis.__PLAYWRIGHT__` in `e2e/app-update.spec.ts`. */
export async function getVersion(): Promise<string> {
  const w = globalThis as unknown as { __PLAYWRIGHT__?: { appVersion?: string } };
  return w.__PLAYWRIGHT__?.appVersion ?? "0.0.25";
}
