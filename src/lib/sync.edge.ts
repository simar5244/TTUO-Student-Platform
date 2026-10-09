// Edge-bundle stub for sync.ts. instrumentation.ts dynamically imports
// ./lib/sync — the edge compiler can't dead-code that import, so webpack
// aliases this file in for the edge bundle (see next.config.ts). register()
// returns before calling it at runtime anyway.
export function startSyncLoop() {}
export async function runSync(): Promise<never> {
  throw new Error("sync is not available in the edge runtime");
}
export async function detectApplicationNow(): Promise<null> { return null; }
export async function rebuildProjections() { return 0; }
export async function refreshProjectionForUser() {}
export async function refreshProjectionForContact() {}
export function syncIntervalMinutes() { return 0; }
