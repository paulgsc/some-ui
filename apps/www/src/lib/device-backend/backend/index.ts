/**
 * The device backend, assembled: the route table, and a database brought up
 * to date and seeded before the first request is answered.
 */
import { seedBundledCorpus } from "@/lib/device-backend/bundled-corpus"
import { accountRoutes } from "@/lib/device-backend/handlers/account"
import { contentRoutes } from "@/lib/device-backend/handlers/content"
import { sessionRoutes } from "@/lib/device-backend/handlers/sessions"
import { shelfRoutes } from "@/lib/device-backend/handlers/shelf"
import type { DeviceBackend } from "@/lib/device-backend/interceptor"
import type { DeviceRoute } from "@/lib/device-backend/router"
import { createRouter } from "@/lib/device-backend/router"
import { migrate } from "@/lib/device-backend/schema"
import type { SqlDriver } from "@/lib/device-backend/sql"

/** Every route the device answers; anything else is `file_host`'s 404. */
export const DEVICE_ROUTES: ReadonlyArray<DeviceRoute> = [
  ...accountRoutes,
  ...sessionRoutes,
  ...shelfRoutes,
  ...contentRoutes,
]

export async function openDeviceBackend(
  db: SqlDriver,
  now: () => number = Date.now
): Promise<DeviceBackend> {
  await migrate(db)
  await seedBundledCorpus(db, now())
  return { router: createRouter(DEVICE_ROUTES), context: { db, now } }
}
