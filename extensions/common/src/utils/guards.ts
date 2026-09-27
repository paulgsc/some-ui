/**
 * The first narrowing step at every `unknown` boundary an extension has:
 * `runtime.onMessage` payloads, `storage.local.get` results, and the return
 * value of an injected script. Per-field checks follow at the call site.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
