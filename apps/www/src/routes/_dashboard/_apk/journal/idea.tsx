import type { JSX } from "react"
import type { IdeaListener, WingLink } from "@some-ui/soundbites"
import { homeHearing, NewIdeaPage } from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import { phoneIdeaListener } from "@/lib/idea-hearing"

/**
 * In the Android app, each answer said as a take home hears, or the phone's
 * recognizer on a phone not paired with home (`lib/idea-hearing`); typed
 * words elsewhere.
 */
const ports: { listener: IdeaListener } | undefined =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? { listener: phoneIdeaListener(homeHearing) }
    : undefined

const StudioLink: WingLink = ({ className, children }) => (
  <Link to="/journal" className={className}>
    {children}
  </Link>
)

/** New idea, in the Studio wing (STUDIO ST18). */
const IdeaRoute = (): JSX.Element => (
  <NewIdeaPage ports={ports} backLink={StudioLink} />
)

export const Route = createFileRoute("/_dashboard/_apk/journal/idea")({
  component: IdeaRoute,
})
