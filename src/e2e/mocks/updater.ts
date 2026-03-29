/** Minimal shapes so AppUpdateDialog compiles without resolving the real plugin (avoids alias cycle). */
export type DownloadEvent = {
  event: string;
  data: { chunkLength?: number; contentLength?: number };
};

export type Update = {
  version: string;
  currentVersion?: string;
  body?: string;
  close: () => Promise<void>;
  downloadAndInstall: (cb?: (ev: DownloadEvent) => void) => Promise<void>;
};

type E2EUpdateSpec = {
  version: string;
  currentVersion?: string;
  body?: string;
} | null;

export async function check(): Promise<Update | null> {
  const w = globalThis as unknown as { __PLAYWRIGHT__?: { update?: E2EUpdateSpec } };
  const spec = w.__PLAYWRIGHT__?.update;
  if (spec === undefined || spec === null) return null;

  return {
    version: spec.version,
    currentVersion: spec.currentVersion ?? "0.0.1",
    body: spec.body ?? "",
    close: async () => {},
    downloadAndInstall: async (_cb?: (ev: DownloadEvent) => void) => {},
  };
}
