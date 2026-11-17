/**
 * The phone's sign-in (SIGNIN1, #3087). `SignInMark`, in the header beside
 * the gear, says at a glance whether this phone is signed in to home, and
 * opens a sheet that says where and since when; signed in is paired with
 * home and known there (`lib/home-link/sign-in-words`). It is a fixed-size
 * icon, so nothing beside it moves as its look changes (HS1).
 * `SignInWatch`, mounted by the app shell on every screen (the session
 * player's too, where the header steps aside), runs the watch that asks
 * home (`lib/home-link/standing`) and says once, as a `Notice`, that home
 * doesn't know the phone. Neither sends anything itself. Their words are
 * `lib/home-link/sign-in-words`' alone.
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
import { SIGN_IN, signInView, TONE_OF } from "@/lib/home-link/sign-in-words"
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

/** The watch, and the notice when home doesn't know the phone. */
export const SignInWatch = (): JSX.Element | null => {
  useEffect(() => watchStanding({ link: homeLink(), doc: document }), [])
  const { link } = useHomeLink()
  if (link.kind !== "paired" || link.standing.kind !== "forgotten") return null
  return (
    <Notice key={link.standing.at} tone="warning" dismissible>
      {SIGN_IN.lostNotice}
    </Notice>
  )
}

/** The mark in the header, for the link as it is. */
export const SignInMark = (): JSX.Element => (
  <SignInMarkView state={useHomeLink()} />
)

/**
 * The mark for a given state of the link: what `SignInMark` draws, and what
 * the ui-fit phone page draws in each look.
 */
export const SignInMarkView = ({
  state,
}: {
  state: HomeLinkState
}): JSX.Element => {
  const [open, setOpen] = useState(false)
  const view = signInView(state)
  const Icon = ICONS[view.signedIn]
  const tone = TONES[TONE_OF[view.signedIn]]

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
