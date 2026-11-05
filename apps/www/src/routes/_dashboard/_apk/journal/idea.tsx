import type { JSX } from "react"
import { useEffect, useState } from "react"
import type { WingLink } from "@some-ui/soundbites"
import {
  keptIdeasForHome,
  keptIdeaStore,
  NewIdeaPage,
  STUDIO_WORDS,
} from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import { ideaHome } from "@/lib/idea-hearing"
import { keepIdeas, sendingStore } from "@/lib/idea-keeping"
import { ideaBundleTakes } from "@/lib/idea-takes"
import { PairHomeLink } from "@/components/pair-home-link"

const StudioLink: WingLink = ({ className, children }) => (
  <Link to="/journal" className={className}>
    {children}
  </Link>
)

/**
 * The phone's desk of a new idea's takes, home as its screen says where the
 * idea goes, and the ideas kept, each Send told to the home link so the idea
 * goes home whole (ST26): in the Android app only, so no other build carries
 * the desk or the home link (`build.paths.ts`).
 */
const phone =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? {
        takes: ideaBundleTakes,
        home: ideaHome,
        ideas: sendingStore(keptIdeaStore()),
      }
    : null

/**
 * New idea, in the Studio wing (STUDIO ST26): one bundle, its answers said
 * as takes that wait on the phone until the whole idea is sent. It records
 * only in the Android app.
 */
const IdeaRoute = (): JSX.Element | null => {
  // The desk's runtime is the phone's one; built when the page first shows.
  const [takes] = useState(() => phone?.takes() ?? null)
  useEffect(() => {
    if (phone !== null) keepIdeas({ forHome: keptIdeasForHome(phone.ideas) })
  }, [])
  if (phone === null || takes === null) return null
  return (
    <NewIdeaPage
      takes={takes}
      ports={{ home: phone.home, ideas: phone.ideas }}
      backLink={StudioLink}
      pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
    />
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/idea")({
  component: IdeaRoute,
})
