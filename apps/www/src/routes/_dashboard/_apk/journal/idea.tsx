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
 * New idea, in the Studio wing (STUDIO ST26): one bundle, its answers said
 * as takes that wait on the phone until the whole idea is sent.
 */
const IdeaRoute = (): JSX.Element => {
  // The desk's runtime is the phone's one; built when the page first shows.
  const [takes] = useState(ideaBundleTakes)
  return (
    <NewIdeaPage
      takes={takes}
      ports={{ home: ideaHome }}
      backLink={StudioLink}
    />
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/idea")({
  component: IdeaRoute,
})
