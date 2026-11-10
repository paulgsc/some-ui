import type { JSX } from "react"
import { useState } from "react"
import { RustRounds, RustWeek, WEEK_WORDS } from "@some-ui/rust-rounds"
import { Button } from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"

import { askHeard } from "@/lib/home-link/heard"
import { homeHoldsWeekSend } from "@/lib/home-link/rust-kept"
import { ideaHome } from "@/lib/idea-hearing"
import { phoneRustRoundsPorts, phoneRustWeekPorts } from "@/lib/rust-rounds"

/**
 * Rust Rounds (#2231). Opened from Practice Home's card, it lands on the
 * week open now (RR13, #2688): its brief, a card per ticket, a take per
 * ticket, looked over and sent home together. While this phone holds no
 * week from home, and from the brief's "The rounds from before" until RR20
 * retires them, it is the cards (#2235): small programs and what rustc
 * really did with them, with no length and no end.
 *
 * The week's ports reach home in two ways only: whether home is in reach,
 * read from the voice lane's last run (`ideaHome`), and the words home heard
 * in a take sent (`askHeard`, one `GET /voice-notes/:id/heard` per take
 * without words, each time the week opens already sent). They also read
 * whether home holds a send of the week, from what the link last heard
 * (`homeHoldsWeekSend`, RR22), never asking home. They are handed in here, not by `lib/rust-rounds`: `lib/home-link`'s voice lane imports that
 * module, so it can't import the link back.
 */
const PhoneRustRounds = (): JSX.Element => {
  // Made once per mount: the session and the week read them once.
  const [ports] = useState(() => ({
    rounds: phoneRustRoundsPorts(),
    week: phoneRustWeekPorts({
      home: ideaHome,
      heard: askHeard,
      homeHolds: homeHoldsWeekSend,
    }),
  }))
  const [rounds, setRounds] = useState(false)
  if (ports.week === null || rounds) return <RustRounds ports={ports.rounds} />
  return (
    <RustWeek
      ports={ports.week}
      onRounds={() => setRounds(true)}
      back={
        <Button asChild variant="outline">
          <Link to="/practice">{WEEK_WORDS.backToPractice}</Link>
        </Button>
      }
    />
  )
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
