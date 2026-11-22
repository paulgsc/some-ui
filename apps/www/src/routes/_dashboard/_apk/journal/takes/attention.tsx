import type { JSX } from "react"
import { useEffect } from "react"
import { assertNever } from "@some-ui/core-utils"
import type { AttentionTake } from "@some-ui/soundbites"
import {
  phoneSoundbiteKeeping,
  RECONCILE_WORDS,
  sourceOf,
  STUDIO_WORDS,
  TakeReconcile,
} from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import { isKind } from "@/lib/my-data"
import { keepSoundbites } from "@/lib/soundbite-keeping"
import { reconcilePorts } from "@/lib/take-reconcile/ports"
import { PairHomeLink } from "@/components/pair-home-link"
import {
  DeleteSheetView,
  useDeleting,
} from "@/components/settings/device-my-data-delete"
import { StudioPage } from "@/components/studio/layout"

/** The page's ports, in the Android app alone (`build.paths.ts`). */
const PORTS =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? reconcilePorts() : null

const LINK =
  "text-brand self-start text-sm font-semibold underline-offset-4 hover:underline"

/**
 * Under a take, the way back to what it was said for, to say it again
 * (#3339): a spoken card's part, an interview week's question, or the card
 * it read aloud. A question or card no longer this week's says so there.
 */
const toSource = (take: AttentionTake): JSX.Element | null => {
  const source = sourceOf(take)
  if (source === null) return null
  const words = RECONCILE_WORDS.source[source.kind]
  switch (source.kind) {
    case "spoken": {
      return (
        <Link
          to="/journal/spoken/$card/$part"
          params={{ card: source.card, part: String(source.part + 1) }}
          className={LINK}
        >
          {words}
        </Link>
      )
    }
    case "question": {
      return (
        <Link
          to="/jobs/interview/q/$question"
          params={{ question: source.question }}
          className={LINK}
        >
          {words}
        </Link>
      )
    }
    case "read": {
      return (
        <Link
          to="/jobs/interview/reads/$card"
          params={{ card: source.card }}
          className={LINK}
        >
          {words}
        </Link>
      )
    }
    default: {
      return assertNever(source)
    }
  }
}

/**
 * The reconciling, its Delete… on My data's one sheet (LA19): on a take of
 * any kind home couldn't hear (#3076, HEARD4).
 */
const Reconcile = ({
  ports,
}: {
  ports: NonNullable<typeof PORTS>
}): JSX.Element => {
  const { sheet, deleting } = useDeleting()
  // A soundbite deleted here lets its copy go through their store, which
  // the soundbites' own page may not have handed in yet (HEARD4).
  useEffect(() => {
    keepSoundbites(phoneSoundbiteKeeping())
  }, [])
  return (
    <>
      <TakeReconcile
        ports={ports}
        pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
        deletable={(take) => isKind(take.of)}
        source={toSource}
        onDelete={(take) => {
          if (isKind(take.of)) deleting.ask(take.of, [take.id])
        }}
      />
      <DeleteSheetView
        sheet={sheet}
        onConfirm={deleting.confirm}
        onClose={deleting.close}
      />
    </>
  )
}

/**
 * Takes › Needs your attention (HEARD3, #3075): every take home couldn't
 * hear well, by what went wrong, each to hear and keep, record again, ask
 * home to try again (#3339), or delete through My data's delete path, with
 * the way back to what it was said for. The Android app's alone
 * (`build.paths.ts`).
 */
const Attention = (): JSX.Element => (
  <StudioPage heading={RECONCILE_WORDS.heading} back="takes">
    {PORTS !== null && <Reconcile ports={PORTS} />}
  </StudioPage>
)

export const Route = createFileRoute(
  "/_dashboard/_apk/journal/takes/attention"
)({ component: Attention })
