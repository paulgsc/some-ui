/**
 * Called first thing by `main.tsx`: in the device build, `fetch` is wrapped
 * before the app renders, which is before anything issues a request (every
 * `file_host` caller reads the global `fetch` at call time, not at import).
 *
 * A function to call, not an import for its side effect: www's build sets
 * `moduleSideEffects: false` (vite.config.ts), which drops an import that
 * binds nothing - silently, with a clean build log. The first version of
 * this module was exactly that import, and shipped an APK with no backend.
 *
 * Everything heavy - the native SQLite plugin, the schema, the handlers, the
 * bundled corpus - is behind a dynamic import, so the LAN and Pages builds
 * carry none of it, and the device build opens the database on the first
 * `file_host` request rather than before the first paint.
 */
import { DEVICE_BACKEND } from "@/lib/data-mode"
import type { DeviceBackend } from "@/lib/device-backend/interceptor"
import { installDeviceFetch } from "@/lib/device-backend/interceptor"
import { resolveFileHostBase } from "@/lib/file-host-config"

let opening: Promise<DeviceBackend> | null = null

/**
 * Opens the database once; every request waits on the same promise. Also
 * how device-only UI (the sync from home) reaches the same database.
 */
export function deviceBackend(): Promise<DeviceBackend> {
  opening ??= (async (): Promise<DeviceBackend> => {
    const [{ openCapacitorSqlite }, { openDeviceBackend }] = await Promise.all([
      import("@/lib/device-backend/capacitor-sqlite"),
      import("@/lib/device-backend/backend"),
    ])
    return openDeviceBackend(await openCapacitorSqlite())
  })()
  return opening
}

/**
 * The `file_host` base the device backend answers for: whatever base this page
 * resolves (`lib/file-host-config`), joined onto its origin. Every caller
 * resolves the same one, so the backend answers on an `https:` page (the
 * same-origin proxy path) and on an `http:` one (`http://localhost:3000/...`,
 * the Android dev loop's) alike. Apart from the install so a test can pin that.
 */
export function deviceFileHostBase(): URL | undefined {
  const base = resolveFileHostBase()
  return base === undefined ? undefined : new URL(base, window.location.origin)
}

/** Installs the device backend in the device build; a no-op in any other. */
export function bootDeviceBackend(): void {
  if (!DEVICE_BACKEND || typeof window === "undefined") return
  const base = deviceFileHostBase()
  if (base === undefined) return
  installDeviceFetch(base, deviceBackend)
}
