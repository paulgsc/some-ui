import type { JSX } from "react"
import { useIsMobile } from "some-ui-utils"
import { Toaster } from "sonner"

/**
 * The app's one toast surface (`sonner`, where `interactive` intents report -
 * `lib/intent/presentation.ts`), on the overlay plane.
 *
 * On a phone toasts come from the top. The bottom of a phone screen is where
 * persistent navigation lives - the lesson CRM's tab bar, and a thumb - so a
 * toast there sat over the controls a person reaches for next, for as long
 * as it showed. A toast may paint over content because it goes away
 * (`docs/session-viewport/05-the-mobile-shell.md` §4); it should not paint
 * over the one row of controls while it is there. On a wide screen the
 * bottom-right corner is out of the way, as before.
 *
 * `useIsMobile` is the workspace's one answer to "is this a phone", not
 * sonner's own breakpoint.
 */
export const AppToaster = (): JSX.Element => {
  const isMobile = useIsMobile()
  return <Toaster position={isMobile ? "top-center" : "bottom-right"} />
}
