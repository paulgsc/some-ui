import type { JSX } from "react"
import { Button } from "@some-ui/shared"
import { cn } from "some-ui-utils"

import { MOBILE_HOME } from "@/lib/app-surface"
import { enterAccount } from "@/lib/auth/enter"

/**
 * `/auth` in the Android app, which has no sign-in: the phone has one person,
 * the device backend answers `GET /auth/session` signed in, and its passkey
 * routes answer `503` (src/lib/device-backend/handlers/account).
 *
 * The page is reached only when a device route answered `401` anyway, which
 * ends the session belief (`lib/auth/session`) and puts up the account banner
 * that links here. The belief is in memory, so the way back is a fresh load:
 * the backend then answers signed in again. That load is `enterAccount`'s, so
 * `redirect` gets the same same-origin check it gets on the web.
 *
 * The web's passkey screen (`routes/auth.tsx`) is not built into this app,
 * and with it go `lib/passkey` and the ceremonies (build.paths.ts).
 */
export const DeviceSessionLost = ({
  redirect = MOBILE_HOME,
}: {
  redirect?: string
}): JSX.Element => (
  <main
    className={cn(
      "mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6"
    )}
  >
    <h1 className={cn("text-xl font-semibold")}>
      This phone&apos;s data didn&apos;t answer
    </h1>
    <p className={cn("text-muted-foreground text-sm")}>
      Some UI keeps everything on this phone, and it lost track of it just now.
      Nothing was sent anywhere. Reloading the app usually brings it back.
    </p>
    <Button
      type="button"
      className={cn("self-start")}
      // "server": always a full load, never the router navigation.
      onClick={() => enterAccount(redirect, () => undefined, "server")}
    >
      Reload
    </Button>
  </main>
)
