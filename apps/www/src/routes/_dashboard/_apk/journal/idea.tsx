import type { JSX } from "react"
import type { IdeaListener } from "@some-ui/soundbites"
import { IdeaCapture, STUDIO_WORDS } from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import { deviceListener } from "@/lib/device-listen"

const WORDS = STUDIO_WORDS.idea

/** The phone's recognizer in the Android app; typed words elsewhere. */
const ports: { listener: IdeaListener } | undefined =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? { listener: deviceListener }
    : undefined

/** New idea, in the Studio wing (STUDIO ST18). */
const IdeaRoute = (): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4">
    <h1 className="text-muted-foreground text-sm font-bold tracking-wider uppercase">
      {WORDS.heading}
    </h1>
    <IdeaCapture
      ports={ports}
      back={
        <Link
          to="/journal"
          className="text-muted-foreground text-sm underline underline-offset-4"
        >
          {WORDS.back}
        </Link>
      }
    />
  </div>
)

export const Route = createFileRoute("/_dashboard/_apk/journal/idea")({
  component: IdeaRoute,
})
