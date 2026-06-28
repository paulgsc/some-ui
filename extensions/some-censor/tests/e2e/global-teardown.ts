/**
 * BOYO — Playwright global teardown.
 * Nothing to do — Chromium is managed by the fixture's launchPersistentContext,
 * which closes cleanly when the context closes.
 */
export default async function globalTeardown(): Promise<void> {}
