/**
 * Called first thing by `main.tsx`: in the device build, `fetch` is wrapped
 * before anything issues a request (callers read the global at call time).
 *
 * A function, not a side-effect import: `moduleSideEffects: false`
 * (vite.config.ts) silently drops an import that binds nothing, which once
 * shipped an APK with no backend.
 *
 * Everything heavy (the SQLite plugin, schema, handlers, bundled corpus) is
 * dynamically imported: other builds carry none of it, and the database opens
 * on the first `file_host` request, not before first paint.
 */
import type { DeviceBackend } from "@/lib/device-backend/interceptor"
import { installDeviceFetch } from "@/lib/device-backend/interceptor"
import { DeviceStorageError } from "@/lib/device-backend/sql"
import { resolveFileHostBase } from "@/lib/file-host-config"

let opening: Promise<DeviceBackend> | null = null

/**
 * The line the native log gets once the database has opened: the launch
 * test (apps/mobile launch/launch-test.sh) waits for it.
 */
export const DEVICE_STORAGE_OPENED = "device storage: opened"

async function open(): Promise<DeviceBackend> {
  const [
    { openCapacitorSqlite },
    { openDeviceBackend },
    { installNativeLog, writeNativeLog },
  ] = await Promise.all([
    import("@/lib/device-backend/capacitor-sqlite"),
    import("@/lib/device-backend/backend"),
    import("@/lib/native-log"),
  ])
  // Before the database: a failure to open it is the first thing to tell.
  installNativeLog()
  const backend = await openDeviceBackend(await openCapacitorSqlite())
  writeNativeLog(DEVICE_STORAGE_OPENED)
  return backend
}

/**
 * Opens the database once; every request waits on the same promise. Also
 * how device-only UI (the sync from home) reaches the same database.
 *
 * A failed open is kept only when no retry in this process can help (the
 * plugin never loaded: `DeviceStorageError`, not `retryable`). Any other is
 * forgotten, so the next request opens again rather than repeating an
 * answer that "Try again" was promised could change.
 */
export function deviceBackend(): Promise<DeviceBackend> {
  opening ??= open().catch((error: unknown) => {
    if (!(error instanceof DeviceStorageError) || error.error.retryable) {
      opening = null
    }
    throw error
  })
  return opening
}

/**
 * The `file_host` base the device backend answers for: whatever base this
 * page resolves (`lib/file-host-config`), on its origin, so it works on an
 * `https:` page (the proxy path) and an `http:` one (the Android dev loop).
 * Separate from the install so a test can pin it.
 */
export function deviceFileHostBase(): URL | undefined {
  const base = resolveFileHostBase()
  return base === undefined ? undefined : new URL(base, window.location.origin)
}

/** Installs the device backend in the device build; a no-op in any other. */
export function bootDeviceBackend(): void {
  if (
    import.meta.env.VITE_DEVICE_BACKEND !== "true" ||
    typeof window === "undefined"
  )
    return
  const base = deviceFileHostBase()
  if (base === undefined) return
  installDeviceFetch(base, deviceBackend)
}
