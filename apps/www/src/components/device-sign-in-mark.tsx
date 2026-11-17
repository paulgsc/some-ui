/**
 * The phone's sign-in mark (SIGNIN1, #3087): on every screen of the
 * Android app, beside the gear, whether this phone is signed in to home,
 * at a glance, and a sheet that says where and since when. Signed in is
 * paired with home and known there (`lib/home-link/sign-in-words`); home
 * stopping knowing the phone is said once as a `Notice`, never a line in
 * the layout (HS1). The mark is a fixed-size icon, so nothing beside it
 * moves as its look changes. It reads the link and sends nothing; the
 * watch that asks home (`lib/home-link/standing`) runs while it is mounted.
 * Its words are `lib/home-link/sign-in-words`' alone.
 */
import type { JSX } from "react"
import { useEffect, useState } from "react"
import { cn } from "@some-ui/core-utils"
import {
  Notice,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
  CircleDashed,
  UserRound,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react"

import { pageOf } from "@/lib/front-desk"
import type { HomeLinkState } from "@/lib/home-link"
import { homeLink, useHomeLink } from "@/lib/home-link"
import type { SignedIn } from "@/lib/home-link/sign-in-words"
import {
  SIGN_IN,
  signInView,
  toneOfSignedIn,
} from "@/lib/home-link/sign-in-words"
import { watchStanding } from "@/lib/home-link/standing"

const ICONS: Readonly<Record<SignedIn, LucideIcon>> = {
  reading: CircleDashed,
  in: UserRoundCheck,
  away: UserRoundCheck,
  out: UserRound,
  lost: UserRoundX,
}

const TONES = {
  quiet: "text-muted-foreground",
  ok: "text-success",
  warn: "text-warning",
} as const

/** Asks home at the watch's moments while the mark is mounted. */
function useStandingWatch(): void {
  useEffect(() => watchStanding({ link: homeLink(), doc: document }), [])
}

/** The phone's sign-in mark, asking home at the watch's moments. */
export const SignInMark = (): JSX.Element => {
  useStandingWatch()
  return <SignInMarkView state={useHomeLink()} />
}

/**
 * The mark for a given state of the link, asking nothing: what
 * `SignInMark` draws, and what the ui-fit phone page draws in each look.
 */
export const SignInMarkView = ({
  state,
}: {
  state: HomeLinkState
}): JSX.Element => {
  const [open, setOpen] = useState(false)
  const view = signInView(state)
  const Icon = ICONS[view.signedIn]
  const tone = TONES[toneOfSignedIn(view.signedIn)]
  const { link } = state
  const lostAt =
    link.kind === "paired" && link.standing.kind === "forgotten"
      ? link.standing.at
      : null

  return (
    <>
      <button
        type="button"
        aria-label={view.label}
        data-signed-in={view.signedIn}
        onClick={() => setOpen(true)}
        className={cn(
          "hover:bg-accent flex size-10 shrink-0 items-center justify-center rounded-md",
          tone
        )}
      >
        <Icon aria-hidden className="size-5" />
      </button>
      {/* Said once per loss; hidden while the sheet says it first. */}
      {lostAt !== null && (
        <Notice
          key={lostAt}
          tone="warning"
          dismissible
          className={open ? "hidden" : undefined}
        >
          {SIGN_IN.lostNotice}
        </Notice>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          data-scroll-intent="long-form"
          className={
            // scroll-intent: long-form — the notes outgrow a phone held
            // sideways, so the sheet scrolls.
            "max-h-[85dvh] overflow-y-auto rounded-t-3xl px-5 pt-6 pb-8"
          }
        >
          <SheetHeader className="px-0 text-left">
            <SheetTitle className="text-xl">{SIGN_IN.title}</SheetTitle>
            <SheetDescription className={cn("text-base break-words", tone)}>
              {view.line}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-3">
            {view.notes.map((note) => (
              <p key={note} className="text-muted-foreground text-sm">
                {note}
              </p>
            ))}
            <Link
              to={pageOf("home")}
              onClick={() => setOpen(false)}
              className="self-start text-base font-semibold underline underline-offset-4"
            >
              {view.action}
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
