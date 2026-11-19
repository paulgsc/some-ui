/**
 * The interview week's pages as its links name them (IW8,
 * paulgsc/some-ui#3175): the one place they are routes. The pages are the
 * Android app's alone, so a link is one only where the build carries them
 * (`hasAudience("apk")`, AUDIENCES.md A3); elsewhere it is its words.
 */
import type { JSX, ReactNode } from "react"
import { assertNever } from "@some-ui/core-utils"
import type { LinkOptions } from "@tanstack/react-router"
import { Link, linkOptions, useNavigate } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import type { SayRung } from "@/lib/interview-week/ladder"
import { CardRoute } from "@/components/card-route"

/** A page of the week. */
export type Page =
  | { readonly page: "interview" | "reads" }
  | { readonly page: "read"; readonly card: string }
  | {
      readonly page: "question" | "study" | "aloud"
      readonly question: string
    }
  | {
      readonly page: "say"
      readonly question: string
      readonly rung: SayRung
    }

/** Where a page of the week is: the one place its route is named. */
function routeOf(to: Page): LinkOptions {
  switch (to.page) {
    case "interview": {
      return linkOptions({ to: "/jobs/interview" })
    }
    case "reads": {
      return linkOptions({ to: "/jobs/interview/reads" })
    }
    case "read": {
      return linkOptions({
        to: "/jobs/interview/reads/$card",
        params: { card: to.card },
      })
    }
    case "question": {
      return linkOptions({
        to: "/jobs/interview/q/$question",
        params: { question: to.question },
      })
    }
    case "study": {
      return linkOptions({
        to: "/jobs/interview/q/$question/study",
        params: { question: to.question },
      })
    }
    case "aloud": {
      return linkOptions({
        to: "/jobs/interview/q/$question/aloud",
        params: { question: to.question },
      })
    }
    case "say": {
      return linkOptions({
        to: "/jobs/interview/q/$question/say",
        params: { question: to.question },
        search: { rung: to.rung },
      })
    }
    default: {
      return assertNever(to)
    }
  }
}

/**
 * A link to `to`, carrying `className`. With `card`, it is a card that opens
 * something (`CardRoute`, #3234), its words stacked;
 * `"brand"` for the card a page leads with. Where the build carries no pages
 * to open, the words stay plain: a card that opens nothing never takes the
 * card link's look (C630).
 */
export const To = ({
  to,
  card,
  className,
  children,
}: {
  to: Page
  card?: "card" | "brand"
  className?: string
  children: ReactNode
}): JSX.Element => {
  if (!hasAudience("apk")) return <span className={className}>{children}</span>
  return card === undefined ? (
    <Link {...routeOf(to)} className={className}>
      {children}
    </Link>
  ) : (
    <CardRoute {...routeOf(to)} tone={card} className={className}>
      {children}
    </CardRoute>
  )
}

/** Opens a question's page, or a read's. */
export function useOpenItem(): (
  to: Page & { page: "question" | "read" }
) => void {
  const navigate = useNavigate()
  return (to) => {
    if (!hasAudience("apk")) return
    void navigate(routeOf(to))
  }
}
