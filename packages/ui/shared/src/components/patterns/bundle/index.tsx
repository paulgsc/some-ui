/**
 * A bundle's parts (STUDIO ST26; RR13 #2688):
 * its cards, one item each, swiped between with the thumb (`BundleCards`),
 * each answer said and heard back on the take pattern's parts, and the look
 * over before Send (`BundleReview`). They render `@some-ui/voice-capture`'s
 * `bundleMachine` state and forward taps; what an item says (a question, a
 * ticket) is the screen's (`renderHead`, `label`), and the words are the screen's
 * table (`BundleWords`), so each surface keeps its own.
 *
 * The swipe is the shared pager's (`usePager`, GES5), beside the dots that
 * do the same. vitest's touches don't reproduce a phone's (CK7, #2386).
 */
import type { JSX, ReactNode } from "react"
import { useId } from "react"
import type {
  BundleIntent,
  BundleKind,
  BundleMachine,
  BundleNotice,
  BundleState,
  BundleTakes,
  TakePatternSnapshot,
} from "@some-ui/voice-capture"
import { takeItemView } from "@some-ui/voice-capture"
import { Keyboard, MicOff } from "lucide-react"

import { cn } from "../../../lib/utils"
import { Button } from "../../ui/button"
import type { ConfirmRequest } from "../../ui/confirm-sheet"
import { Notice } from "../../ui/notice"
import { usePager } from "../../ui/pager"
import { TakeItem, TakeRows } from "../take"

/** A bundle's words: one table per surface, in the person's terms. */
export type BundleWords = {
  /** Each dot above the cards, for a screen reader. */
  readonly dot: {
    readonly said: (n: number) => string
    readonly typed: (n: number) => string
    readonly failed: (n: number) => string
    readonly full: (n: number) => string
    readonly later: (n: number) => string
    readonly open: (n: number) => string
  }
  /** A card, for a screen reader: "Question 2 of 4". */
  readonly cardOf: (n: number, of: number) => string
  readonly prev: (n: number) => string
  readonly next: (n: number) => string
  readonly last: string
  /** Under a card's take button while nothing is said: needed, or can wait. */
  readonly unsaid: (required: boolean) => string
  readonly failed: {
    readonly title: string
    readonly line: string
    readonly again: string
    readonly later: string
    readonly type: string
  }
  /** No room for another take until home has the ones on this phone. */
  readonly full: { readonly title: string; readonly line: string }
  readonly unheard: { readonly type: string }
  readonly typing: {
    readonly mark: string
    readonly hint: string
    readonly left: (n: number) => string
    readonly voice: string
    readonly keep: string
  }
  readonly typed: { readonly mark: string; readonly sayInstead: string }
  readonly later: { readonly line: string; readonly sayNow: string }
  readonly saidCount: (n: number, of: number) => string
  readonly toReview: string
  readonly review: {
    readonly kept: string
    readonly playAll: string
    readonly stopAll: string
    readonly deleteAll: string
    readonly notSaid: string
    readonly typed: string
    readonly sayIt: string
    readonly delete: string
  }
  readonly confirm: {
    readonly answerTitle: string
    readonly answerLine: (label: string) => string
    /** An answer typed beside a take kept unheard (ST34): both go. */
    readonly besideLine: (label: string) => string
    readonly allTitle: string
    readonly allLine: string
    readonly yes: string
    readonly keep: string
  }
  readonly notice: Readonly<Record<BundleNotice, string>>
}

type Parts<K extends BundleKind> = {
  readonly machine: BundleMachine<K>
  readonly state: BundleState<K>
  readonly takes: BundleTakes
  readonly snapshot: TakePatternSnapshot
  readonly dispatch: (intent: BundleIntent<K>) => void
  readonly words: BundleWords
}

/** A dot's label: how its item stands. */
function dotLabel<K extends BundleKind>(
  { machine, state, words }: Pick<Parts<K>, "machine" | "state" | "words">,
  item: K["item"],
  n: number
): string {
  const mode = state.modes[item]
  if (mode?.kind === "failed") {
    return mode.full ? words.dot.full(n) : words.dot.failed(n)
  }
  const how = machine.answered(state, item)
  if (how !== null) return words.dot[how](n)
  return state.draft.later.includes(item)
    ? words.dot.later(n)
    : words.dot.open(n)
}

/** What the screen said once, closed by the person. */
export const BundleNoticeLine = ({
  notice,
  onDismiss,
  words,
}: {
  notice: BundleNotice | null
  onDismiss: () => void
  words: Pick<BundleWords, "notice">
}): JSX.Element | null =>
  notice === null ? null : (
    <Notice key={notice} onDismiss={onDismiss}>
      {words.notice[notice]}
    </Notice>
  )

/**
 * Nothing was kept for a card. Voice didn't come through, so it can be said
 * again; or (`full`) the phone has no room for another take until home has
 * the ones it holds, so saying it again would fail the same way.
 */
const Failed = <K extends BundleKind>({
  item,
  full,
  active,
  typing,
  dispatch,
  words,
}: {
  item: K["item"]
  full: boolean
  /** Its card is the one on screen: only that one says why. */
  active: boolean
  typing: boolean
  dispatch: Parts<K>["dispatch"]
  words: BundleWords
}): JSX.Element => (
  <div className="flex flex-col gap-3">
    {active && (
      <Notice tone="danger">
        <span className="flex gap-2">
          <MicOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="space-y-1">
            <span className="block font-bold">
              {full ? words.full.title : words.failed.title}
            </span>
            <span className="text-muted-foreground block">
              {full ? words.full.line : words.failed.line}
            </span>
          </span>
        </span>
      </Notice>
    )}
    {!full && (
      <Button size="lg" onClick={() => dispatch({ type: "tap", item })}>
        {words.failed.again}
      </Button>
    )}
    <div className={cn("grid gap-2", typing && "grid-cols-2")}>
      <Button
        variant="outline"
        onClick={() => dispatch({ type: "later", item })}
      >
        {words.failed.later}
      </Button>
      {typing && (
        <Button
          variant="outline"
          className="border-dashed"
          onClick={() => dispatch({ type: "typeInstead", item })}
        >
          {words.failed.type}
        </Button>
      )}
    </div>
  </div>
)

const Typing = <K extends BundleKind>({
  item,
  text,
  max,
  dispatch,
  words,
}: {
  item: K["item"]
  text: string
  max: number
  dispatch: Parts<K>["dispatch"]
  words: BundleWords
}): JSX.Element => {
  const id = useId()
  return (
    <div
      data-typing="fallback"
      className="border-border flex flex-col gap-2 rounded-2xl border-2 border-dashed p-3"
    >
      <p className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
        <Keyboard className="size-4" aria-hidden="true" />
        {words.typing.mark}
      </p>
      <label htmlFor={id} className="text-muted-foreground text-sm">
        {words.typing.hint}
      </label>
      <textarea
        id={id}
        value={text}
        rows={3}
        maxLength={max}
        onChange={(event) =>
          dispatch({ type: "typed", item, text: event.currentTarget.value })
        }
        className="bg-background border-border focus-visible:ring-ring rounded-xl border p-3 text-base focus-visible:ring-2 focus-visible:outline-none"
      />
      <p className="text-muted-foreground text-xs">
        {words.typing.left(max - text.length)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => dispatch({ type: "tap", item })}
        >
          {words.typing.voice}
        </Button>
        <Button
          disabled={text.trim() === ""}
          onClick={() => dispatch({ type: "keepTyped", item })}
        >
          {words.typing.keep}
        </Button>
      </div>
    </div>
  )
}

const Typed = <K extends BundleKind>({
  item,
  text,
  dispatch,
  words,
}: {
  item: K["item"]
  text: string
  dispatch: Parts<K>["dispatch"]
  words: BundleWords
}): JSX.Element => (
  <div className="flex flex-col gap-2">
    <div
      data-typing="kept"
      className="border-border flex flex-col gap-1 rounded-2xl border-2 border-dashed p-3"
    >
      <p className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
        {words.typed.mark}
      </p>
      <p className="text-base">{text}</p>
    </div>
    <Button size="lg" onClick={() => dispatch({ type: "tap", item })}>
      {words.typed.sayInstead}
    </Button>
  </div>
)

type CardProps<K extends BundleKind> = Parts<K> & {
  item: K["item"]
  n: number
  active: boolean
  /** What the card says of its item, above its take. */
  head: ReactNode
  /** Where it sits beside the card on screen, and the finger's travel. */
  offset: {
    readonly cards: number
    readonly px: number
    readonly easing: boolean
  }
}

const Card = <K extends BundleKind>({
  machine,
  state,
  takes,
  snapshot,
  dispatch,
  words,
  item,
  n,
  active,
  head,
  offset,
}: CardProps<K>): JSX.Element => {
  const { spec } = machine
  const answers = machine.answersOf(state, item)
  const recording =
    snapshot.take.kind !== "idle" && snapshot.answers === answers
  const card = machine.cardView(state, item, recording)
  const of = spec.items.length
  const view = takeItemView(
    snapshot,
    state.takes,
    answers,
    takes.pattern.options
  )
  return (
    <section
      aria-label={words.cardOf(n, of)}
      aria-hidden={!active}
      inert={!active}
      data-card={item}
      className={cn(
        "col-start-1 row-start-1 flex min-w-0 flex-col gap-3 px-1",
        offset.easing && "transition-transform duration-200 ease-out"
      )}
      style={{
        transform: `translateX(calc(${offset.cards * 100}% + ${offset.px}px))`,
      }}
    >
      {head}
      {card.kind === "failed" && (
        <Failed
          item={item}
          full={card.full}
          active={active}
          typing={spec.typing}
          dispatch={dispatch}
          words={words}
        />
      )}
      {card.kind === "typing" && (
        <Typing
          item={item}
          text={card.text}
          max={spec.typedMax}
          dispatch={dispatch}
          words={words}
        />
      )}
      {card.kind === "typed" && (
        <Typed
          item={item}
          text={card.words}
          dispatch={dispatch}
          words={words}
        />
      )}
      {card.kind === "later" && (
        <div className="flex flex-col gap-2">
          <p className="bg-card rounded-2xl p-3 text-sm">{words.later.line}</p>
          <Button size="lg" onClick={() => dispatch({ type: "tap", item })}>
            {words.later.sayNow}
          </Button>
        </div>
      )}
      {(card.kind === "take" || card.kind === "unheard") && (
        <>
          <TakeItem
            view={view}
            size="large"
            onTap={() => dispatch({ type: "tap", item })}
            onPlay={(take) => dispatch({ type: "play", take })}
            onRedo={() => dispatch({ type: "tap", item })}
            onLetGo={() => dispatch({ type: "askDelete", item })}
          />
          {view.current.length === 0 && !recording && (
            <p className="text-muted-foreground text-center text-sm">
              {words.unsaid(spec.required(item))}
            </p>
          )}
        </>
      )}
      {card.kind === "unheard" && (
        <Button
          variant="outline"
          className="border-dashed"
          onClick={() => dispatch({ type: "typeInstead", item })}
        >
          <Keyboard className="size-4" aria-hidden="true" />
          {words.unheard.type}
        </Button>
      )}
      <p className="text-muted-foreground flex justify-between text-xs">
        <span>{n > 1 ? words.prev(n - 1) : ""}</span>
        <span>{n < of ? words.next(n + 1) : words.last}</span>
      </p>
    </section>
  )
}

export type BundleCardsProps<K extends BundleKind> = Parts<K> & {
  /** What a card says of its item, above its take: a question, a ticket. */
  renderHead: (item: K["item"], n: number) => ReactNode
}

/** The cards, one per item, swiped between, with a dot for each. */
export const BundleCards = <K extends BundleKind>(
  props: BundleCardsProps<K>
): JSX.Element => {
  const { machine, state, dispatch, words, renderHead } = props
  const { items } = machine.spec
  const { attach, offset, dragging } = usePager({
    canPrev: state.index > 0,
    canNext: state.index < items.length - 1,
    held: state.busy,
    onPage: (to) => dispatch({ type: "swipe", to }),
  })
  return (
    <div className="flex flex-col gap-3">
      <nav className="flex items-center justify-center gap-1">
        {items.map((item, i) => {
          const how = machine.answered(state, item)
          const failed = state.modes[item]?.kind === "failed"
          return (
            <button
              key={item}
              type="button"
              aria-label={dotLabel(props, item, i + 1)}
              aria-current={i === state.index ? "step" : undefined}
              disabled={state.busy}
              onClick={() => dispatch({ type: "go", index: i })}
              className="flex h-7 w-11 items-center justify-center"
            >
              <span
                data-dot={how ?? (failed ? "failed" : "open")}
                className={cn(
                  "h-2.5 rounded-full border-2",
                  i === state.index ? "w-6" : "w-2.5",
                  how === "said"
                    ? "bg-brand border-brand"
                    : how === "typed"
                      ? "bg-muted-foreground border-muted-foreground border-dashed"
                      : failed
                        ? "border-destructive"
                        : "border-muted-foreground/60"
                )}
              />
            </button>
          )
        })}
      </nav>
      <div ref={attach} data-swipe="cards">
        {/* The cards share one cell, each moved sideways by its distance
            from the card on screen, so the row clips them and none of them
            is wider than the phone. */}
        <div className="grid overflow-hidden">
          {items.map((item, i) => (
            <Card
              key={item}
              {...props}
              item={item}
              n={i + 1}
              active={i === state.index}
              head={renderHead(item, i + 1)}
              offset={{
                cards: i - state.index,
                px: offset,
                easing: !dragging,
              }}
            />
          ))}
        </div>
      </div>
      <p className="text-muted-foreground text-center text-xs">
        {words.saidCount(machine.answeredCount(state), items.length)}
      </p>
      <Button
        variant="outline"
        size="lg"
        disabled={state.busy}
        onClick={() => dispatch({ type: "review" })}
      >
        {words.toReview}
      </Button>
      <BundleNoticeLine
        notice={state.notice}
        onDismiss={() => dispatch({ type: "noticeDismissed" })}
        words={words}
      />
    </div>
  )
}

export type BundleReviewProps<K extends BundleKind> = Parts<K> & {
  /** What the bundle is, above its answers; Change, if it has one, is here. */
  header: ReactNode
  /** An item's name above its answer. */
  label: (item: K["item"]) => ReactNode
  /** What an unsaid item's row says, when the surface says more than "Not said yet". */
  notSaid?: (item: K["item"]) => ReactNode
  /** Under the answers, above Send: where home is, the way to pairing. */
  beforeSend?: ReactNode
  /** Send's label. */
  send: string
  /** What Send still needs, said; null when nothing. */
  needs: ReactNode
}

/** The answers looked over, played in order, and sent together. */
export const BundleReview = <K extends BundleKind>(
  props: BundleReviewProps<K>
): JSX.Element => {
  const { machine, state, takes, snapshot, dispatch, words } = props
  return (
    <div className="flex flex-col gap-4">
      {props.header}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          disabled={!machine.canPlayAll(state)}
          onClick={() => dispatch({ type: "playAll" })}
        >
          {state.playAll === null ? words.review.playAll : words.review.stopAll}
        </Button>
        <Button
          variant="secondary"
          className="text-destructive"
          onClick={() => dispatch({ type: "askDeleteAll" })}
        >
          {words.review.deleteAll}
        </Button>
      </div>
      <ol className="flex flex-col gap-3">
        {machine.spec.items.map((item) => {
          const how = machine.answered(state, item)
          const typed = state.draft.typed[item]
          // Words typed beside a take kept unheard show with that take (ST34).
          const take = how === "said" || machine.standsBeside(state, item)
          return (
            <li key={item} className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{props.label(item)}</p>
              {take && (
                <TakeRows
                  view={takeItemView(
                    snapshot,
                    state.takes,
                    machine.answersOf(state, item),
                    takes.pattern.options
                  )}
                  onPlay={(each) => dispatch({ type: "play", take: each })}
                  onRedo={() => dispatch({ type: "tap", item })}
                  onLetGo={() => dispatch({ type: "askDelete", item })}
                />
              )}
              {how === "typed" && typed !== undefined && (
                <div className="border-border flex flex-col gap-2 rounded-2xl border-2 border-dashed p-3">
                  <p className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
                    {words.review.typed}
                  </p>
                  <p>{typed}</p>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dispatch({ type: "tap", item })}
                    >
                      {words.typed.sayInstead}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => dispatch({ type: "askDelete", item })}
                    >
                      {words.review.delete}
                    </Button>
                  </div>
                </div>
              )}
              {how === null && (
                <div className="bg-card flex items-center justify-between rounded-2xl p-3">
                  <span className="text-muted-foreground text-sm">
                    {props.notSaid?.(item) ?? words.review.notSaid}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => dispatch({ type: "tap", item })}
                  >
                    {words.review.sayIt}
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {props.beforeSend}
      <Button
        size="lg"
        disabled={props.needs !== null}
        onClick={() => dispatch({ type: "send" })}
      >
        {props.send}
      </Button>
      {props.needs !== null && <Notice>{props.needs}</Notice>}
      <BundleNoticeLine
        notice={state.notice}
        onDismiss={() => dispatch({ type: "noticeDismissed" })}
        words={words}
      />
    </div>
  )
}

/** The permanent step the bundle asks about, as the confirm sheet asks it. */
export function bundleConfirm<K extends BundleKind>(
  { machine, state, dispatch, words }: Omit<Parts<K>, "takes" | "snapshot">,
  label: (item: K["item"]) => string
): ConfirmRequest | null {
  const { confirm } = state
  if (confirm === null) return null
  const onConfirm = (): void => dispatch({ type: "confirmed" })
  return confirm.kind === "all"
    ? {
        title: words.confirm.allTitle,
        description: words.confirm.allLine,
        confirm: words.confirm.yes,
        keep: words.confirm.keep,
        onConfirm,
      }
    : {
        title: words.confirm.answerTitle,
        description: (machine.standsBeside(state, confirm.item)
          ? words.confirm.besideLine
          : words.confirm.answerLine)(label(confirm.item)),
        confirm: words.confirm.yes,
        keep: words.confirm.keep,
        onConfirm,
      }
}
