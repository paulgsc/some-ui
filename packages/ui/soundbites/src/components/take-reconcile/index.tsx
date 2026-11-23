/**
 * The takes needing attention (HEARD3, #3075): every take home couldn't
 * hear well, grouped by code (`lib/reconcile/codes`). Each plays, shows
 * what home heard, and offers keep it, record it again, ask home to try it
 * again where home will (`components/hear-again`, #3339), or delete it,
 * where the build deletes that kind; and, where the build can open it, the
 * way back to what it was said for (`source`). Renders `lib/reconcile/model.ts`'s state and
 * forwards taps; its words are `lib/reconcile/words.ts`'s.
 *
 * Delete is the build's: `onDelete` opens its delete path (My data's, LA19),
 * which tells the runtime what went (`ports.deletes`).
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { assertNever, cn } from "@some-ui/core-utils"
import { Button, Chip, CHIP_BAR, Dot, Notice } from "@some-ui/shared"
import {
  HearAgainButton,
  HearAgainLines,
} from "@soundbites/components/hear-again"
import { PlayButton } from "@soundbites/components/take-library/parts"
import { Unpaired } from "@soundbites/components/unpaired"
import { HEAR_AGAIN_WORDS } from "@soundbites/lib/hear-again/words"
import { aboutOfRef } from "@soundbites/lib/library/compartments"
import { LIBRARY_WORDS } from "@soundbites/lib/library/words"
import type { ProblemCode } from "@soundbites/lib/reconcile/codes"
import {
  codeCounts,
  codesOf,
  groupByCode,
} from "@soundbites/lib/reconcile/codes"
import type {
  AttentionTake,
  ReconcileIntent,
  ReconcileState,
} from "@soundbites/lib/reconcile/model"
import type { ReconcilePorts } from "@soundbites/lib/reconcile/runtime"
import { createReconcile } from "@soundbites/lib/reconcile/runtime"
import { RECONCILE_WORDS } from "@soundbites/lib/reconcile/words"

const WORDS = RECONCILE_WORDS

type Dispatch = (intent: ReconcileIntent) => void

export type TakeReconcileProps = {
  /** Home, as the build reaches it, a player, and its deletes. Read once. */
  ports: ReconcilePorts
  /** The app's way to pairing, shown while this phone isn't paired (ST34). */
  pair: ReactNode
  /** Whether home deletes this kind of take; absent, none is offered. */
  deletable?: ((take: AttentionTake) => boolean) | undefined
  /** "Delete…": opens the build's delete path on the take. */
  onDelete?: ((take: AttentionTake) => void) | undefined
  /**
   * The way back to what the take was said for, to say it again, as the
   * build links it; null or absent for none.
   */
  source?: ((take: AttentionTake) => ReactNode) | undefined
  /**
   * Only these takes, by id (RETRY: the ones a render that couldn't finish
   * waits on), with a line over them (`banner`, its way to show all) and
   * what is said once none of them waits any more (`empty`). Absent, every
   * take needing attention.
   */
  only?:
    | {
        readonly ids: ReadonlySet<string>
        readonly banner: ReactNode
        readonly empty: ReactNode
      }
    | undefined
}

const codesOfTake = (take: AttentionTake): ReadonlyArray<ProblemCode> =>
  codesOf(take.verdict)

/** What kind of take it is: a Studio take by what it was for. */
const kindOf = (take: AttentionTake): string =>
  take.of === "studio"
    ? LIBRARY_WORDS.kinds[aboutOfRef(take.ref).kind].one
    : WORDS.of(take.of)

/** A code, with the dot that says it waits on the owner. */
const CodePill = ({ code }: { code: ProblemCode }): JSX.Element => (
  <span className="border-border bg-background inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs">
    <Dot meaning="attention" />
    {WORDS.codes[code].name}
  </span>
)

const TakeCard = ({
  take,
  state,
  deletable,
  onDelete,
  source,
  dispatch,
}: {
  take: AttentionTake
  state: ReconcileState
  deletable: boolean
  onDelete: TakeReconcileProps["onDelete"]
  source: ReactNode
  dispatch: Dispatch
}): JSX.Element => {
  const { playback, acting } = state
  const here = playback.kind !== "quiet" && playback.id === take.id
  const codes = codesOfTake(take)
  const { language } = take.verdict
  const heard = take.heard ?? ""
  const busy = acting !== null || state.hearAgain.asking !== null
  return (
    <li className="bg-card border-border/50 flex flex-col gap-2 rounded-2xl border p-3">
      <div className="flex min-w-0 items-start gap-3">
        <PlayButton
          playing={here}
          loading={playback.kind === "loading"}
          onPress={() => dispatch({ type: "play", id: take.id })}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            {kindOf(take)}
          </p>
          <p className="text-muted-foreground text-xs">
            {WORDS.said(take.recordedAt)}
          </p>
          <p className="text-muted-foreground text-xs">{WORDS.heardLabel}</p>
          <p
            className={cn(
              "text-sm break-words italic",
              heard === "" && "text-muted-foreground"
            )}
          >
            {heard !== ""
              ? `“${heard}”`
              : take.verdict.kind === "failed"
                ? WORDS.neverHeard
                : WORDS.heardNothing}
          </p>
          {codes.includes("off_language") && language !== null && (
            <p className="text-muted-foreground text-xs">
              {WORDS.heardAs(language.heard, language.expected)}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {codes.map((code) => (
              <CodePill key={code} code={code} />
            ))}
          </div>
        </div>
      </div>
      <div
        role="group"
        aria-label={WORDS.actsLabel}
        className="flex flex-wrap gap-2"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => dispatch({ type: "act", id: take.id, act: "keep" })}
        >
          {WORDS.acts.keep}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => dispatch({ type: "act", id: take.id, act: "again" })}
        >
          {WORDS.acts.again}
        </Button>
        <HearAgainButton
          take={take}
          state={state}
          busy={busy}
          onAsk={() => dispatch({ type: "hearAgain", id: take.id })}
        />
        {deletable && onDelete !== undefined && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onDelete(take)}
          >
            {WORDS.acts.delete}
          </Button>
        )}
      </div>
      <HearAgainLines
        take={take}
        state={state}
        onDismiss={() => dispatch({ type: "hearAgainDismissed" })}
      />
      {source}
      {!deletable && (
        <p className="text-muted-foreground text-xs">{WORDS.keptForGood}</p>
      )}
      {acting?.id === take.id && <Notice>{WORDS.acting}</Notice>}
      {here && playback.kind === "loading" && (
        <Notice>{LIBRARY_WORDS.loading}</Notice>
      )}
      {state.unplayable === take.id && (
        <Notice
          tone="danger"
          onDismiss={() => dispatch({ type: "unplayableDismissed" })}
        >
          {LIBRARY_WORDS.unplayable}
        </Notice>
      )}
      {(state.said?.kind === "notTaken" || state.said?.kind === "busy") &&
        state.said.id === take.id && (
          <Notice
            tone="danger"
            onDismiss={() => dispatch({ type: "noticeDismissed" })}
          >
            {state.said.kind === "busy" ? WORDS.phoneBusy : WORDS.notTaken}
          </Notice>
        )}
    </li>
  )
}

/** The codes as chips, each with how many takes carry it. */
const CodeChips = ({
  counts,
  picked,
  onPick,
}: {
  counts: ReturnType<typeof codeCounts>
  picked: ProblemCode | null
  onPick: (code: ProblemCode | null) => void
}): JSX.Element | null => {
  if (counts.length < 2 && picked === null) return null
  return (
    <nav aria-label={WORDS.chips} className={CHIP_BAR}>
      {counts.map(({ code, count }) => (
        <Chip
          key={code}
          picked={picked === code}
          count={count}
          dot="attention"
          onTap={() => onPick(picked === code ? null : code)}
        >
          {WORDS.codes[code].name}
        </Chip>
      ))}
    </nav>
  )
}

/** What a read of home came to, when it didn't list takes. */
const Unread = ({
  state,
  dispatch,
  pair,
}: {
  state: ReconcileState
  dispatch: Dispatch
  pair: ReactNode
}): JSX.Element | null => {
  const { read } = state
  switch (read.kind) {
    case "reading": {
      return (
        <p className="text-muted-foreground text-sm">{LIBRARY_WORDS.reading}</p>
      )
    }
    case "read": {
      return null
    }
    case "unpaired": {
      return <Unpaired line={LIBRARY_WORDS.unpaired} pair={pair} />
    }
    case "away":
    case "busy":
    case "older":
    case "unreadable": {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{WORDS[read.kind]}</p>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => dispatch({ type: "readAgain" })}
          >
            {LIBRARY_WORDS.readAgain}
          </Button>
        </div>
      )
    }
    default: {
      return assertNever(read)
    }
  }
}

export const TakeReconcile = ({
  ports,
  pair,
  deletable,
  onDelete,
  source,
  only,
}: TakeReconcileProps): JSX.Element => {
  /* eslint-disable-next-line owner-guard/no-mount-snapshot -- the runtime is made once per mount, as Studio's screens' are */
  const [runtime] = useState(() => createReconcile(ports))
  useEffect(() => runtime.attach(), [runtime])
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const [picked, setPicked] = useState<ProblemCode | null>(null)
  const { dispatch } = runtime
  const page = state.read.kind === "read" ? state.read.page : null
  const listed = page?.takes ?? []
  const takes =
    only === undefined ? listed : listed.filter(({ id }) => only.ids.has(id))
  const counts = codeCounts(takes, codesOfTake)
  // A code picked that no take carries any more shows them all again.
  const pick = counts.some(({ code }) => code === picked) ? picked : null
  const card = (take: AttentionTake): JSX.Element => (
    <TakeCard
      key={take.id}
      take={take}
      state={state}
      deletable={deletable?.(take) ?? false}
      onDelete={onDelete}
      source={source?.(take) ?? null}
      dispatch={dispatch}
    />
  )
  return (
    <div className="flex flex-col gap-4">
      <Unread state={state} dispatch={dispatch} pair={pair} />
      {page !== null && only?.banner}
      {/* None of them listed says none waits only when home listed all. */}
      {page !== null &&
        only !== undefined &&
        takes.length === 0 &&
        page.total <= listed.length &&
        only.empty}
      {page !== null &&
        only === undefined &&
        takes.length === 0 &&
        page.total === 0 && (
          <p className="text-muted-foreground text-sm">{WORDS.none}</p>
        )}
      {page !== null &&
        takes.length === 0 &&
        (only === undefined ? page.total > 0 : page.total > listed.length) && (
          <div className="flex flex-col gap-2">
            <p className="text-sm">{WORDS.noneShown(page.total)}</p>
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => dispatch({ type: "readAgain" })}
            >
              {LIBRARY_WORDS.readAgain}
            </Button>
          </div>
        )}
      {page !== null && takes.length > 0 && (
        <>
          {only === undefined && (
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {WORDS.shown(takes.length, page.total)}
            </p>
          )}
          <CodeChips
            counts={counts}
            picked={pick}
            onPick={(code) => {
              // What plays stops if its row leaves with its Stop.
              const { playback } = state
              const playing = takes.find(
                ({ id }) => playback.kind !== "quiet" && playback.id === id
              )
              if (
                playing !== undefined &&
                code !== null &&
                !codesOfTake(playing).includes(code)
              ) {
                dispatch({ type: "stop" })
              }
              setPicked(code)
            }}
          />
          {pick !== null ? (
            <ul className="flex flex-col gap-2">
              {takes
                .filter((take) => codesOfTake(take).includes(pick))
                .map(card)}
            </ul>
          ) : (
            groupByCode(takes, codesOfTake).map(({ code, takes: group }) => (
              <section key={code} className="flex flex-col gap-2">
                <h2 className="flex justify-between gap-2 text-sm font-bold">
                  <span>{WORDS.codes[code].name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {group.length}
                  </span>
                </h2>
                <p className="text-muted-foreground text-xs">
                  {WORDS.codes[code].line}
                </p>
                <ul className="flex flex-col gap-2">{group.map(card)}</ul>
              </section>
            ))
          )}
        </>
      )}
      {state.said?.kind === "kept" && (
        <Notice onDismiss={() => dispatch({ type: "noticeDismissed" })}>
          {WORDS.done[state.said.act]}
        </Notice>
      )}
      {state.hearAgain.said?.kind === "settled" &&
        !takes.some(({ id }) => id === state.hearAgain.said?.id) && (
          <Notice onDismiss={() => dispatch({ type: "hearAgainDismissed" })}>
            {HEAR_AGAIN_WORDS.said.settled}
          </Notice>
        )}
      {state.said?.kind === "settled" && (
        <Notice onDismiss={() => dispatch({ type: "noticeDismissed" })}>
          {WORDS.settled}
        </Notice>
      )}
    </div>
  )
}

export type AttentionWayInProps = {
  /** Home, as the build reaches it. Read once. */
  ports: ReconcilePorts
  /** The way to the page, around the tile's body. */
  wayIn: (body: ReactNode) => ReactNode
}

/**
 * The way in to the takes needing attention, on Takes' first page (HEARD3):
 * how many wait, with the dot that says they wait on the owner. It shows
 * only while home lists one; otherwise nothing.
 */
export const AttentionWayIn = ({
  ports,
  wayIn,
}: AttentionWayInProps): JSX.Element | null => {
  /* eslint-disable-next-line owner-guard/no-mount-snapshot -- the runtime is made once per mount, as Studio's screens' are */
  const [runtime] = useState(() => createReconcile(ports))
  useEffect(() => runtime.attach(), [runtime])
  const { read } = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  if (read.kind !== "read" || read.page.total === 0) return null
  return (
    <>
      {wayIn(
        <span className="flex w-full flex-col gap-1.5">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-bold">
              <Dot meaning="attention" className="size-2.5" />
              {WORDS.heading}
            </span>
            <span className="text-2xl leading-none font-bold tabular-nums">
              {read.page.total}
            </span>
          </span>
          <span className="text-sm">{WORDS.wayIn(read.page.total)}</span>
          <span className="text-muted-foreground text-xs">
            {WORDS.wayInLine}
          </span>
        </span>
      )}
    </>
  )
}
