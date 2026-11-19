/**
 * The interview week's pages under a router of their own (IW8), at the
 * paths the app serves them on, for its screen test and its fit on the
 * phone page (`tests/ui-fit/phone-page/interview.tsx`): the layout's
 * runtime over `ports`, and each page as its route renders it.
 */
import type { JSX } from "react"
import { MemoryRouted } from "@/test-support/memory-routed"
import { createRootRoute, createRoute, Outlet } from "@tanstack/react-router"

import type { SayRung } from "@/lib/interview-week/ladder"
import type { InterviewWeekPorts } from "@/lib/interview-week/runtime"
import {
  AloudPage,
  QuestionPage,
  SayPage,
  StudyPage,
} from "@/components/jobs/interview/ladder"
import { ReadPage, ReadsPage } from "@/components/jobs/interview/reads"
import { InterviewWeekRuntime } from "@/components/jobs/interview/run"
import { HowPage, QuestionsPage } from "@/components/jobs/interview/way-in"
import { InterviewPage } from "@/components/jobs/interview/week"

// The tree's type is the router's to infer: written out, it is every route's.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function interviewTree(ports: InterviewWeekPorts) {
  const root = createRootRoute()
  const layout = createRoute({
    getParentRoute: () => root,
    path: "/jobs/interview",
    component: () => (
      <InterviewWeekRuntime ports={ports}>
        <Outlet />
      </InterviewWeekRuntime>
    ),
  })
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- as the tree's
  const page = (path: string, component: () => JSX.Element) =>
    createRoute({ getParentRoute: () => layout, path, component })
  const question = createRoute({
    getParentRoute: () => layout,
    path: "/q/$question",
  })
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- as the tree's
  const step = (path: string, component: () => JSX.Element) =>
    createRoute({ getParentRoute: () => question, path, component })
  const say = createRoute({
    getParentRoute: () => question,
    path: "/say",
    // As the say route reads it.
    validateSearch: (search): { rung: SayRung } => ({
      rung: search.rung === "cues" ? "cues" : "own",
    }),
    component: function Say() {
      return (
        <SayPage id={say.useParams().question} rung={say.useSearch().rung} />
      )
    },
  })
  const reads = createRoute({ getParentRoute: () => layout, path: "/reads" })
  const read = createRoute({
    getParentRoute: () => reads,
    path: "/$card",
    component: function Read() {
      return <ReadPage id={read.useParams().card} />
    },
  })
  return root.addChildren([
    layout.addChildren([
      page("/", InterviewPage),
      page("/questions", QuestionsPage),
      page("/how", HowPage),
      question.addChildren([
        step("/", () => {
          return <QuestionPage id={question.useParams().question} />
        }),
        step("/study", () => {
          return <StudyPage id={question.useParams().question} />
        }),
        step("/aloud", () => {
          return <AloudPage id={question.useParams().question} />
        }),
        say,
      ]),
      reads.addChildren([
        createRoute({
          getParentRoute: () => reads,
          path: "/",
          component: ReadsPage,
        }),
        read,
      ]),
    ]),
  ])
}

export type RoutedInterviewProps = {
  /** Made once, on mount. */
  ports: () => InterviewWeekPorts
  path?: string
}

/** The week's pages opened at `path`. */
export const RoutedInterview = ({
  ports,
  path = "/jobs/interview",
}: RoutedInterviewProps): JSX.Element => (
  <MemoryRouted initialTree={() => interviewTree(ports())} initialPath={path} />
)
