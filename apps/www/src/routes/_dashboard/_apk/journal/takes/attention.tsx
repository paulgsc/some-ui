import type { ComponentProps, JSX } from "react"
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
import { z } from "zod"

import { isKind } from "@/lib/my-data"
import { renderName } from "@/lib/renders"
import type { AttentionSearch, OnlySearch } from "@/lib/renders/again"
import { AGAIN_WORDS, onlyOf } from "@/lib/renders/again"
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
/**
 * Just the takes a render that couldn't finish waits on (RETRY), from its
 * Run it again page: whose they are, the way to every take, and the way back.
 */
const onlyFor = (
  only: OnlySearch
): NonNullable<ComponentProps<typeof TakeReconcile>["only"]> => {
  const essay = renderName({ feed: only.feed, key: only.key })
  const back = (
    <Link
      to="/journal/renders/$feed/$key"
      params={{ feed: only.feed, key: only.key }}
      className={LINK}
    >
      {AGAIN_WORDS.back}
    </Link>
  )
  return {
    ids: new Set(only.takes),
    banner: (
      <div className="bg-muted flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm">
        <span>{AGAIN_WORDS.only(only.takes.length, essay)}</span>
        <Link to="/journal/takes/attention" className={LINK}>
          {AGAIN_WORDS.showAll}
        </Link>
      </div>
    ),
    empty: (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{AGAIN_WORDS.onlyDone}</p>
        {back}
      </div>
    ),
  }
}

const Reconcile = ({
  ports,
  only,
}: {
  ports: NonNullable<typeof PORTS>
  only: OnlySearch | null
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
        only={only === null ? undefined : onlyFor(only)}
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
 * hear well, or just those a render waits on (RETRY), by what went wrong, each to hear and keep, record again, ask
 * home to try again (#3339), or delete through My data's delete path, with
 * the way back to what it was said for. The Android app's alone
 * (`build.paths.ts`).
 */
const Attention = (): JSX.Element => {
  const only = onlyOf(Route.useSearch())
  return (
    <StudioPage heading={RECONCILE_WORDS.heading} back="takes">
      {PORTS !== null && (
        // A new set of takes is a new list, read afresh.
        <Reconcile
          key={only === null ? "all" : only.takes.join(",")}
          ports={PORTS}
          only={only}
        />
      )}
    </StudioPage>
  )
}

/**
 * The takes a render waits on, from its Run it again page (RETRY): at most
 * what home lists at once. Read leniently: anything else in the address is
 * no filter, and the page shows every take as before. Here, not in
 * `lib/renders`, since the route tree ships in every build.
 */
const OnlySchema = z.object({
  takes: z.array(z.string().min(1).max(200)).min(1).max(100),
  feed: z.string().min(1).max(64),
  key: z.string().min(1).max(200),
})

function readAttentionSearch(search: Record<string, unknown>): AttentionSearch {
  const read = OnlySchema.safeParse(search)
  return read.success ? read.data : {}
}

export const Route = createFileRoute(
  "/_dashboard/_apk/journal/takes/attention"
)({ validateSearch: readAttentionSearch, component: Attention })
