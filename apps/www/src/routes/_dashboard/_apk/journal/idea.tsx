import type { JSX } from "react"
import type { IdeaListener, WingLink } from "@some-ui/soundbites"
import { NewIdeaPage } from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import { deviceListener } from "@/lib/device-listen"

/** The phone's recognizer in the Android app; typed words elsewhere. */
const ports: { listener: IdeaListener } | undefined =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? { listener: deviceListener }
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
