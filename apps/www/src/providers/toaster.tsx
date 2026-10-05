import type { JSX } from "react"
import { useIsMobile } from "some-ui-utils"
import { Toaster } from "sonner"

/**
 * The app's one toast surface (`sonner`, where `interactive` intents report,
 * `lib/intent/presentation.ts`). On a phone, from the top: the bottom holds
 * the tab bar and the thumb, and a toast may cover content but not the
 * controls (`docs/session-viewport/05-the-mobile-shell.md` §4). Bottom-right
 * on a wide screen. `useIsMobile`, not sonner's breakpoint, decides.
 */
export const AppToaster = (): JSX.Element => {
  const isMobile = useIsMobile()
  return <Toaster position={isMobile ? "top-center" : "bottom-right"} />
}
