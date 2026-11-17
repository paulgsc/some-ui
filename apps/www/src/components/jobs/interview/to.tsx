/**
 * The interview week's pages as its links name them (IW8,
 * paulgsc/some-ui#3175): the one place they are routes. The pages are the
 * Android app's alone, so a link is one only where the build carries them
 * (`hasAudience("apk")`, AUDIENCES.md A3); elsewhere it is its words.
 */
import type { JSX, ReactNode } from "react"
import { assertNever } from "@some-ui/core-utils"
import { Link, useNavigate } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"

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
      readonly rung: "cues" | "own"
    }

/** A link to `to`, carrying `className`. */
export const To = ({
  to,
  className,
  children,
}: {
  to: Page
  className?: string
  children: ReactNode
}): JSX.Element => {
  if (!hasAudience("apk")) return <span className={className}>{children}</span>
  const link = { className, children }
  switch (to.page) {
    case "interview": {
      return <Link to="/jobs/interview" {...link} />
    }
    case "reads": {
      return <Link to="/jobs/interview/reads" {...link} />
    }
    case "read": {
      return (
        <Link
          to="/jobs/interview/reads/$card"
          params={{ card: to.card }}
          {...link}
        />
      )
    }
    case "question": {
      return (
        <Link
          to="/jobs/interview/q/$question"
          params={{ question: to.question }}
          {...link}
        />
      )
    }
    case "study": {
      return (
        <Link
          to="/jobs/interview/q/$question/study"
          params={{ question: to.question }}
          {...link}
        />
      )
    }
    case "aloud": {
      return (
        <Link
          to="/jobs/interview/q/$question/aloud"
          params={{ question: to.question }}
          {...link}
        />
      )
    }
    case "say": {
      return (
        <Link
          to="/jobs/interview/q/$question/say"
          params={{ question: to.question }}
          search={{ rung: to.rung }}
          {...link}
        />
      )
    }
    default: {
      return assertNever(to)
    }
  }
}

/** Opens a question's page, or a read's. */
export function useOpenItem(): (
  to: Page & { page: "question" | "read" }
) => void {
  const navigate = useNavigate()
  return (to) => {
    if (!hasAudience("apk")) return
    void (to.page === "question"
      ? navigate({
          to: "/jobs/interview/q/$question",
          params: { question: to.question },
        })
      : navigate({
          to: "/jobs/interview/reads/$card",
          params: { card: to.card },
        }))
  }
}
