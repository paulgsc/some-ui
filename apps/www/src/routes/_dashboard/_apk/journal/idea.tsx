import type { JSX } from "react"
import { useState } from "react"
import type { WingLink } from "@some-ui/soundbites"
import { NewIdeaPage } from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import { ideaHome } from "@/lib/idea-hearing"
import { ideaBundleTakes } from "@/lib/idea-takes"

const StudioLink: WingLink = ({ className, children }) => (
  <Link to="/journal" className={className}>
    {children}
  </Link>
)

/**
 * The phone's desk of a new idea's takes, and home as its screen says where
 * the idea goes: in the Android app only, so no other build carries the desk
 * or the home link (`build.paths.ts`).
 */
const phone =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? { takes: ideaBundleTakes, home: ideaHome }
    : null

/**
 * New idea, in the Studio wing (STUDIO ST26): one bundle, its answers said
 * as takes that wait on the phone until the whole idea is sent. It records
 * only in the Android app.
 */
const IdeaRoute = (): JSX.Element | null => {
  // The desk's runtime is the phone's one; built when the page first shows.
  const [takes] = useState(() => phone?.takes() ?? null)
  if (phone === null || takes === null) return null
  return (
    <NewIdeaPage
      takes={takes}
      ports={{ home: phone.home }}
      backLink={StudioLink}
    />
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/idea")({
  component: IdeaRoute,
})
