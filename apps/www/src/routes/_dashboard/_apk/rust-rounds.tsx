import type { JSX } from "react"
import { useState } from "react"
import { RustRounds } from "@some-ui/rust-rounds"
import { createFileRoute } from "@tanstack/react-router"

import { phoneRustRoundsPorts } from "@/lib/rust-rounds"

/**
 * Rust Rounds (#2231, #2235): small Rust programs and what rustc really did
 * with them, said out loud. Opened from Practice Home's card, it lands on
 * the card left last, or one tap from the first. There is no length to pick
 * and no end: leaving is just leaving, and everything done is already kept.
 */
const PhoneRustRounds = (): JSX.Element => {
  // Made once per mount: the session reads them once.
  const [ports] = useState(() => phoneRustRoundsPorts())
  return <RustRounds ports={ports} />
}

/**
 * The phone's alone: the flag is read inline, so other builds drop the
 * session's storage and microphone (vite-env.d.ts, VITE_DEVICE_BACKEND).
 */
const RustRoundsRoute = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <PhoneRustRounds /> : null

export const Route = createFileRoute("/_dashboard/_apk/rust-rounds")({
  component: RustRoundsRoute,
})
