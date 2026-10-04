import type { FC } from "react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { ArtifactSwitcher } from "@leetype/components/round/artifact-switcher"
import type {
  ArtifactId,
  SwitchableArtifact,
} from "@leetype/components/round/artifact-switcher"
import { BudgetDisplay } from "@leetype/components/round/budget-display"
import { ConstraintDiff } from "@leetype/components/round/constraint-diff"
import { DiffSetChoices } from "@leetype/components/round/diff-set-choices"
import { GenerateRound } from "@leetype/components/round/generate-round"
import {
  NoteButton,
  NoteComposer,
} from "@leetype/components/round/note-composer"
import { RecordedRuns } from "@leetype/components/round/recorded-runs"
import { RoundChoices } from "@leetype/components/round/round-choices"
import { RoundFeedback } from "@leetype/components/round/round-feedback"
import { RoundOutcome } from "@leetype/components/round/round-outcome"
import { SourcePanel } from "@leetype/components/round/source-panel"
import { shuffledBySeed } from "@leetype/lib/leetype/deterministic-random"
import { buildRoundPrompt } from "@leetype/lib/leetype/generation"
import type { Ledger } from "@leetype/lib/leetype/ledger"
import { mergeLedgers, recordObservations } from "@leetype/lib/leetype/ledger"
import { observationsOfCommitment } from "@leetype/lib/leetype/ledger/observation"
import type { EntryReading } from "@leetype/lib/leetype/ledger/state"
import {
  LEDGER_STATE_COPY,
  readEntry,
  touchedIn,
  whatIsLeft,
} from "@leetype/lib/leetype/ledger/state"
import type { LedgerStore } from "@leetype/lib/leetype/ledger/store"
import { createLedgerStore } from "@leetype/lib/leetype/ledger/store"
import type { RoundNote } from "@leetype/lib/leetype/notes"
import { NOTE_KIND_COPY } from "@leetype/lib/leetype/notes"
import { isListening } from "@leetype/lib/leetype/notes/composer"
import type { Dictation } from "@leetype/lib/leetype/notes/dictation"
import { webSpeechDictation } from "@leetype/lib/leetype/notes/dictation"
import {
  browserComposerPorts,
  createNoteComposer,
} from "@leetype/lib/leetype/notes/runtime"
import type { NoteStore } from "@leetype/lib/leetype/notes/store"
import { createNoteStore } from "@leetype/lib/leetype/notes/store"
import type { PastedRoundStore } from "@leetype/lib/leetype/pasted-round"
import { createPastedRoundStore } from "@leetype/lib/leetype/pasted-round"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { rewriteKeyOf, rewriteOf } from "@leetype/lib/leetype/rewrite"
import type { AssembledRound } from "@leetype/lib/leetype/round-assembly"
import {
  assembleRound,
  lintAuthoredRounds,
} from "@leetype/lib/leetype/round-assembly"
import type { RoundCycleState } from "@leetype/lib/leetype/round-cycle"
import { nextRoundCycleState } from "@leetype/lib/leetype/round-cycle"
import { serializeRound } from "@leetype/lib/leetype/round-export"
import {
  ROUND_PROBE_PROMPT,
  roundProbeOf,
} from "@leetype/lib/leetype/round-probe"
import type {
  RoundRuns,
  RoundRunsLoader,
} from "@leetype/lib/leetype/round-runs"
import { resolveRoundRuns, variantOf } from "@leetype/lib/leetype/round-runs"
import { nextRound } from "@leetype/lib/leetype/round-sampler"
import {
  keptRoundOf,
  ROUND_SHELF_WORDS,
  shelfKeyOf,
} from "@leetype/lib/leetype/shelf"
import type { Round } from "@leetype/types/authored-round"
import type { Commitment } from "@leetype/types/commitment"
import type { ShelfPort } from "@some-ui/shared"
import { Button, KeepOnShelf, KeptShelf } from "@some-ui/shared"
import { Sparkles } from "lucide-react"
import { cn } from "some-ui-utils"

/** Each artifact's tab label, also how a margin note names where it was raised. */
const ARTIFACT_LABELS: Readonly<Record<ArtifactId, string>> = {
  algorithm: "Program",
  constraintDiff: "Bounds",
  budget: "Budget",
  diffSet: "Rewrites",
  optionSet: "Which proposition?",
  runResult: "Runs",
}

/** Decorrelates consecutive rounds' seeds; the same stride `ReadingSession` uses per step. */
const ROUND_SEED_STRIDE = 0x9e3779b9

/** Separates a draw's seed from the same round's presentation seed. */
const DRAW_SEED_SALT = 0x5bd1e995

/** The seed of the session's `index`-th round (0-based): presentation order and distractors. */
function roundSeedOf(seed: number, index: number): number {
  return (seed ^ Math.imul(index + 1, ROUND_SEED_STRIDE)) >>> 0
}

/**
 * A session id for the ledger's observations: one per mount and one per
 * Restart. L3's session boundary compares these, together with time
 * (`SPACED_RETRIEVAL_MIN_GAP_MS`).
 */
function newSessionId(): string {
  const [random] = crypto.getRandomValues(new Uint32Array(1))
  return `s-${Date.now().toString(36)}-${(random ?? 0).toString(36)}`
}

type RoundSessionProps = {
  /**
   * The rounds to draw from: the served corpus in `server` mode, the
   * bundled one otherwise (`Leetype` decides). A round that fails
   * `lintAuthoredRounds` is skipped rather than played.
   */
  rounds: ReadonlyArray<Round>
  /** Session term supplied by the composer/scene, in milliseconds. */
  sessionDurationMs?: number
  /** Deterministic override for tests, previews, and replaying an ordering bug. */
  sessionSeed?: number
  /** Fired once, when the term is spent. */
  onSessionComplete?: () => void
  /** Where the learner's own round is held; `sessionStorage` unless a test passes one. */
  pastedStore?: PastedRoundStore
  /** Where the ledger is kept; `localStorage` unless a test passes one. */
  ledgerStore?: LedgerStore
  /**
   * The learner shelf, where the host has one (`lib/leetype/shelf`): their
   * own round can be kept on their account, and a kept one replayed.
   * Absent, nothing offers to keep, and the session is otherwise the same.
   */
  shelf?: ShelfPort
  /**
   * The host's source of a round's recorded runs (`lib/leetype/round-runs`,
   * X2): `apps/www` fetches `GET /leetype/rounds/:id/runs` in `server` mode.
   * Absent, rejecting, or answering for other bytes, the bundled transcript
   * is used when it matches the round; otherwise the round shows no runs and
   * plays the same. Never called for the learner's own round.
   */
  loadRuns?: RoundRunsLoader
  /** Where margin notes are kept (canon Rem. 3.7); `localStorage` unless a test passes one. */
  noteStore?: NoteStore
  /**
   * What turns a spoken note into text. Absent, the browser's own
   * recognizer where it has one (`webSpeechDictation`); the Android app
   * passes the phone's. `null` offers typing only.
   */
  dictation?: Dictation | null
  className?: string
}

type Play = {
  readonly round: Round
  readonly assembled: AssembledRound
  /** Whether this is the learner's own round rather than the corpus's. */
  readonly own: boolean
  readonly seed: number
}

type Progress = {
  /** Index into the play's presentation order, once a diff is chosen. */
  readonly picked: number | null
  /** The cycle's state after `(d, p)`, once the proposition is committed. */
  readonly outcome: Exclude<
    RoundCycleState,
    { phase: "posingDiffSelection" }
  > | null
}

const FRESH: Progress = { picked: null, outcome: null }

type SummaryRow = {
  readonly id: PropositionId
  readonly title: string
  readonly reading: EntryReading
}

/**
 * The session-complete screen's view of the margin notes raised this
 * session (canon Rem. 3.7), so the learner can read back what got in the
 * way. Words only, and no count of them.
 */
const NotesSummary: FC<{ notes: ReadonlyArray<RoundNote> }> = ({ notes }) => {
  if (notes.length === 0) return null
  return (
    <section aria-label="Your notes" className="w-full min-w-0 text-left">
      <p className="text-sm font-medium text-foreground">
        What you noted this session
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {notes.map(({ id, kind, text, anchor }) => (
          <li
            key={id}
            className="min-w-0 rounded-lg border border-border/60 px-3 py-2"
          >
            <p className="text-pretty text-sm font-medium text-foreground">
              {NOTE_KIND_COPY[kind].label}
            </p>
            <p className="text-pretty text-xs text-muted-foreground">
              {ARTIFACT_LABELS[anchor.artifact]}
              {anchor.own ? ", your round" : ""}
              {anchor.committed ? ", after answering" : ""}
            </p>
            {text !== "" && (
              <p className="text-pretty text-sm text-muted-foreground">
                {text}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The session-complete screen's view of the ledger: each entry this
 * session presented, its state in Cor. 10.1's words, and for an entry not
 * yet demonstrated which of Def. 10.2's conjuncts are still open. Words
 * only: no figure that could add `recognized` and `demonstrated` together.
 */
const LedgerSummary: FC<{ rows: ReadonlyArray<SummaryRow> }> = ({ rows }) => {
  if (rows.length === 0) return null
  return (
    <section aria-label="Your ledger" className="w-full min-w-0 text-left">
      <p className="text-sm font-medium text-foreground">
        What this session put in your ledger
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map(({ id, title, reading }) => {
          if (reading.state === "unseen") return null
          const open =
            reading.state === "exposed" ? [] : whatIsLeft(reading.demonstration)
          return (
            <li
              key={id}
              className="min-w-0 rounded-lg border border-border/60 px-3 py-2"
            >
              <p className="text-pretty text-sm font-medium text-foreground">
                {title}
              </p>
              <p className="text-pretty text-sm text-muted-foreground">
                {LEDGER_STATE_COPY[reading.state]}
              </p>
              {open.length > 0 && (
                <p className="text-pretty text-xs text-muted-foreground">
                  Still open: {open.join("; ")}.
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Rounds that pass the authored-round lint and open on a diff selection. */
function playable(rounds: ReadonlyArray<Round>): Array<Round> {
  return rounds.filter((round) => {
    if (lintAuthoredRounds([round]).length > 0) return false
    try {
      return assembleRound(round).initialState.phase === "posingDiffSelection"
    } catch {
      return false
    }
  })
}

/**
 * The phone's round surface (#1440, the Leetype cutover): one round at a
 * time, one artifact at a time (`ArtifactSwitcher`, Def. 9.2 / Rem. 9.2),
 * driven by `lib/leetype/round-cycle`.
 *
 * ```text
 * A, C → C′, B, D        the round opens inadmissible at C′ (Def. 8.1 case 2)
 * pick d                 DiffSetChoices, one-shot
 * name p                 RoundChoices, one-shot; verdict p = μ(d) (Thm. 6.1)
 * next state             RoundOutcome: fits, a rescue question, or an explanation question
 * ```
 *
 * # What this surface never shows
 *
 * No completion fraction, no "k of N", no end of the corpus (Prop. 8.1):
 * rounds cycle for as long as the session term lasts, and only the term
 * ends it. Progress is unconditional (Ax. 9.1): "Next round" is available
 * the moment `(d, p)` is committed, right or wrong.
 *
 * # Recorded runs (X2, #1223)
 *
 * Once `(d, p)` is committed, a "Runs" artifact shows what `A` and the
 * chosen `A + d` did at `C` and at `C′` (`RecordedRuns`), when the round has
 * a transcript recorded for its exact bytes (`resolveRoundRuns`). Never
 * before the commitment: a run of each rewrite at `C′` would give the
 * answer away. Never for the learner's own round: nobody recorded it. And
 * never as the grade: the cycle's state comes from the cost graphs alone,
 * and a round with no transcript is complete without one (Rem. 8.0).
 *
 * # Which round comes next (L4, #1230)
 *
 * `nextRound` (`lib/leetype/round-sampler`) draws each corpus round from
 * the ledger, the corpus and the session seed, at the moment the previous
 * round is left (or the session opens): a confident error brings back a
 * round that tells the confused pair apart, an abstention a plainer
 * instance, a correct answer a new rewrite of the same proposition
 * (Prop. 9.1). Every round keeps a positive weight, so nothing is ever
 * unreachable and nothing is withheld (Thm. 9.1, Ax. 9.1); an empty or
 * cleared ledger draws uniformly (Thm. 7.2). Within a round, `D`'s
 * presentation order is shuffled by the round's own seed, so position
 * never says which diff is admissible (the corpus authors it first).
 *
 * # The ledger (L1–L3, #1227–#1229)
 *
 * Each `(d, p)` commitment is filed into the ledger
 * (`observationsOfCommitment`, `recordObservations`) under this session's
 * id and persisted through `ledgerStore`, silently (Prop. 7.2). Nothing
 * here reads it except the draw and the four-state list on the
 * session-complete screen, which says only what Cor. 10.1 allows: the
 * state's name, and for a recognized entry which of Def. 10.2's conjuncts
 * are still open. No percentage, streak, level or count of rounds against
 * a total. The learner's own round is played but never filed: its JSON
 * carried every μ, so it was answered with the key in hand (Ax. 9.2).
 *
 * # The learner's own round
 *
 * "Make your own round" opens `GenerateRound`. A round it accepts plays
 * next, is held for the session (`lib/leetype/pasted-round`), and plays
 * first again after a reload. Its id is namespaced so it can never be
 * confused with a corpus round of the same name.
 *
 * Where the host passes a `shelf`, the learner's own round can be kept on
 * their account ("Keep on this account", one tap per round), and the
 * generator lists what they kept: a kept round replayed goes through the
 * paste's own check and then plays exactly as a pasted one does.
 *
 * # Margin notes (canon Rem. 3.7)
 *
 * A Note button sits beside the tabs at every moment. It opens an inline
 * panel on whatever artifact is showing: one tap on a kind saves the note,
 * and words, spoken or typed, are optional. The composer is a runtime
 * outside React (`lib/leetype/notes/runtime`); this component only renders
 * its state. Notes go into the prompt "Make your own" copies, and onto the
 * session-complete screen, and nowhere else: neither the ledger nor the
 * draw reads them (Prop. 3.4).
 */
export const RoundSession: FC<RoundSessionProps> = ({
  rounds,
  sessionDurationMs = 10 * 60_000,
  sessionSeed,
  onSessionComplete,
  pastedStore,
  ledgerStore,
  shelf,
  loadRuns,
  noteStore,
  dictation,
  className,
}) => {
  const [notes] = useState(() => noteStore ?? createNoteStore())
  const [recognizer] = useState(() =>
    dictation === undefined ? webSpeechDictation() : dictation
  )
  const [composer] = useState(() =>
    createNoteComposer(browserComposerPorts(notes, recognizer))
  )
  useEffect(() => composer.attach(), [composer])
  const noteButtonRef = useRef<HTMLButtonElement>(null)
  const finishingHintId = useId()
  const returnFocusToNote = useCallback((): void => {
    noteButtonRef.current?.focus()
  }, [])
  const noteState = useSyncExternalStore(
    composer.subscribe,
    composer.getSnapshot
  )
  const [seed] = useState(
    () => sessionSeed ?? crypto.getRandomValues(new Uint32Array(1))[0]!
  )
  const [store] = useState(() => pastedStore ?? createPastedRoundStore())
  const [ledgers] = useState(() => ledgerStore ?? createLedgerStore())
  const corpus = useMemo(() => playable(rounds), [rounds])

  /**
   * The ledger and the clock the current corpus round is drawn under. Set
   * when a round is left (and at mount and Restart), never on a commit, so
   * filing the learner's answer cannot redraw the round they are on.
   */
  const [drawBasis, setDrawBasis] = useState<{
    readonly ledger: Ledger
    readonly now: number
  }>(() => ({ ledger: ledgers.get(), now: Date.now() }))
  /** The live ledger: `drawBasis.ledger` plus this round's commitment, if any. */
  const [ledger, setLedger] = useState<Ledger>(() => drawBasis.ledger)
  const [sessionId, setSessionId] = useState(newSessionId)

  /** Rounds played so far this session, own rounds included; also the seed stride. */
  const [played, setPlayed] = useState(0)
  const [own, setOwn] = useState<Round | null>(() => store.get())
  // What "Keep on this account" sends: the one serialization of a round.
  const ownBody = useMemo(
    () => (own === null ? null : serializeRound(own)),
    [own]
  )
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<Progress>(FRESH)
  const [recent, setRecent] = useState<ReadonlyArray<string>>([])

  /** When the term ran out, or null while the session is on. */
  const [finishedAt, setFinishedAt] = useState<number | null>(null)
  const finished = finishedAt !== null
  const [sessionClockMs, setSessionClockMs] = useState(0)
  const [sessionGeneration, setSessionGeneration] = useState(0)
  const onSessionCompleteRef = useRef(onSessionComplete)
  useEffect(() => {
    onSessionCompleteRef.current = onSessionComplete
  }, [onSessionComplete])

  useEffect(() => {
    // Anchored at mount, for the reason `ReadingSession`'s clock is: the
    // orchestrator removes this scene at its own `start_time + duration`.
    const startedAt = performance.now()
    const update = (): void => {
      setSessionClockMs(
        Math.min(performance.now() - startedAt, sessionDurationMs)
      )
    }
    update()
    const timer = window.setInterval(update, 250)
    return (): void => window.clearInterval(timer)
  }, [sessionDurationMs, sessionGeneration])

  useEffect(() => {
    if (finished || sessionClockMs < sessionDurationMs) return
    // The term running out is an external fact the orchestrator's clock
    // owns, the same shape and justification as `ReadingSession`'s own
    // end-of-session effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFinishedAt(Date.now())
    // The round surface is gone: a note open on it closes with it.
    composer.dispatch({ type: "roundLeft" })
    onSessionCompleteRef.current?.()
  }, [finished, sessionClockMs, sessionDurationMs, composer])

  const drawn = useMemo(
    () =>
      nextRound(
        drawBasis.ledger,
        corpus,
        (roundSeedOf(seed, played) ^ DRAW_SEED_SALT) >>> 0,
        drawBasis.now
      ),
    [drawBasis, corpus, seed, played]
  )

  const play = useMemo((): Play | null => {
    const roundSeed = roundSeedOf(seed, played)
    const round = own ?? drawn
    if (round === undefined) return null
    try {
      return {
        round,
        assembled: assembleRound(round),
        own: own !== null,
        seed: roundSeed,
      }
    } catch {
      return null
    }
  }, [own, drawn, played, seed])

  const order = useMemo(
    () =>
      play === null
        ? []
        : shuffledBySeed(
            play.assembled.diffOptions.map((_, index) => index),
            play.seed
          ),
    [play]
  )
  const presented = useMemo(
    () =>
      play === null
        ? []
        : order.map((index) => play.assembled.diffOptions[index]!),
    [play, order]
  )
  const pickedOption =
    progress.picked === null ? undefined : presented[progress.picked]
  const probe = useMemo(
    () =>
      pickedOption === undefined || play === null
        ? null
        : roundProbeOf(pickedOption.member, play.seed),
    [pickedOption, play]
  )

  /**
   * The current corpus round's transcript, tagged with the round it belongs
   * to, so a late answer for a round already left is never shown against
   * the next one. Fetched when the round opens, shown only after the
   * commitment (below).
   */
  const [runs, setRuns] = useState<{
    readonly round: Round
    readonly transcript: RoundRuns
  } | null>(null)
  const runsRound = play === null || play.own ? null : play.round
  useEffect(() => {
    if (runsRound === null) return
    let live = true
    void resolveRoundRuns(runsRound, loadRuns).then((transcript) => {
      if (live && transcript !== null) {
        setRuns({ round: runsRound, transcript })
      }
    })
    return (): void => {
      live = false
    }
  }, [runsRound, loadRuns])

  const handleCommit = useCallback(
    (commitment: Commitment): void => {
      if (play === null || pickedOption === undefined || probe === null) return
      const initial = play.assembled.initialState
      if (initial.phase !== "posingDiffSelection") return
      setProgress((current) => ({
        ...current,
        outcome: nextRoundCycleState(initial, {
          kind: "selectDiff",
          diff: pickedOption,
          commitment,
        }),
      }))
      // Ax. 9.2: the learner's own round was answered with its key in hand.
      if (play.own) return
      // Another tab may have stored evidence since this one last read; fold
      // it in first, or this whole-value write would erase it (Codex, #1599).
      const next = recordObservations(
        mergeLedgers(ledger, ledgers.get()),
        observationsOfCommitment({
          answerId: probe.answerId,
          presented: probe.options.map(({ id }) => id),
          commitment,
          roundId: play.round.id,
          rewriteKey: rewriteKeyOf(
            rewriteOf(play.round.graph, pickedOption.graph)
          ),
          sessionId,
          at: Date.now(),
        })
      )
      setLedger(next)
      ledgers.set(next)
    },
    [play, pickedOption, probe, ledger, ledgers, sessionId]
  )

  const handleNext = useCallback((): void => {
    composer.dispatch({ type: "roundLeft" })
    if (play !== null) {
      setRecent((ids) => [play.round.id, ...ids].slice(0, 5))
    }
    setOwn(null)
    setPlayed((count) => count + 1)
    setDrawBasis({ ledger, now: Date.now() })
    setProgress(FRESH)
  }, [play, ledger, composer])

  const handleOwnRound = useCallback(
    (round: Round): void => {
      composer.dispatch({ type: "roundLeft" })
      store.set(round)
      setOwn(round)
      setGenerating(false)
      setProgress(FRESH)
    },
    [store, composer]
  )

  // A fresh session, as `ReadingSession`'s restart is: the counters, the
  // draw and the recent-rounds history all start over (review finding on
  // #1598), under a new session id. The ledger carries over; it is the
  // learner's, not the session's. The learner's own round stays held; it
  // is the session store's, and plays first again the way it does after a
  // reload.
  const handleRestart = useCallback((): void => {
    composer.dispatch({ type: "roundLeft" })
    setFinishedAt(null)
    setSessionClockMs(0)
    setSessionGeneration((generation) => generation + 1)
    setProgress(FRESH)
    setPlayed(0)
    setDrawBasis({ ledger, now: Date.now() })
    setSessionId(newSessionId())
    setRecent([])
    setOwn(store.get())
    setGenerating(false)
  }, [store, ledger, composer])

  const summary = useMemo(
    () =>
      finishedAt === null
        ? []
        : touchedIn(ledger, sessionId).map((id) => ({
            id,
            title: PROPOSITION_REGISTER[id].title,
            reading: readEntry(id, ledger, finishedAt),
          })),
    [finishedAt, ledger, sessionId]
  )

  const sessionNotes =
    finishedAt === null
      ? []
      : notes
          .list(finishedAt)
          .filter(({ anchor }) => anchor.sessionId === sessionId)

  if (finished) {
    const page =
      // scroll-intent: reading-page — the ledger list can be taller than a
      // phone held sideways; the page scrolls, nothing inside it does.
      "flex h-full flex-col overflow-y-auto px-4 py-6"
    return (
      <div data-scroll-intent="reading-page" className={cn(page, className)}>
        <div className="m-auto flex w-full max-w-lg flex-col items-center gap-4 text-center">
          <div>
            <p className="text-base font-medium text-foreground">
              Session complete
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {played} {played === 1 ? "round" : "rounds"} played
            </p>
          </div>
          <LedgerSummary rows={summary} />
          <NotesSummary notes={sessionNotes} />
          <Button onClick={handleRestart} size="lg">
            Restart
          </Button>
        </div>
      </div>
    )
  }

  const column =
    // scroll-intent: reading-page — the phone's one vertical scroll, for
    // the reason `ReadingSession` gives; nothing nested scrolls vertically.
    "mx-auto flex h-full w-full max-w-lg flex-col gap-4 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1"

  if (play === null) {
    return (
      // scroll-intent: reading-page — the same one-column page as the round
      // itself; the form is taller than a phone.
      <div data-scroll-intent="reading-page" className={cn(column, className)}>
        <p className="text-sm text-muted-foreground">
          No rounds are available right now. You can make your own.
        </p>
        <GenerateRound
          buildPrompt={(request) =>
            buildRoundPrompt({
              ...request,
              recent,
              notes: notes.list(Date.now()),
            })
          }
          onStart={handleOwnRound}
        />
        {shelf && (
          <KeptShelf
            shelf={shelf}
            words={ROUND_SHELF_WORDS}
            replay={{ read: keptRoundOf, play: handleOwnRound }}
          />
        )}
      </div>
    )
  }

  const { round } = play
  const artifacts: Array<SwitchableArtifact> = [
    {
      id: "algorithm",
      label: ARTIFACT_LABELS.algorithm,
      content: <SourcePanel algorithm={round.algorithm} />,
    },
    {
      id: "constraintDiff",
      label: ARTIFACT_LABELS.constraintDiff,
      content: <ConstraintDiff diff={round.constraintDiff} />,
    },
    {
      id: "budget",
      label: ARTIFACT_LABELS.budget,
      content: <BudgetDisplay budget={round.budget} />,
    },
    {
      id: "diffSet",
      label: ARTIFACT_LABELS.diffSet,
      content: (
        <DiffSetChoices
          options={presented}
          language={round.algorithm.language}
          picked={progress.picked}
          onPick={(index) =>
            setProgress((current) => ({ ...current, picked: index }))
          }
        />
      ),
    },
  ]
  if (probe !== null) {
    artifacts.push({
      id: "optionSet",
      label: ARTIFACT_LABELS.optionSet,
      content: (
        <div className="flex flex-col gap-4">
          <RoundChoices
            prompt={ROUND_PROBE_PROMPT}
            options={probe.options}
            answerId={probe.answerId}
            onCommit={handleCommit}
          />
          {progress.outcome !== null && (
            <>
              <RoundFeedback
                justification={probe.justification}
                {...(probe.gloss === undefined ? {} : { gloss: probe.gloss })}
              />
              <RoundOutcome state={progress.outcome} seed={play.seed} />
            </>
          )}
        </div>
      ),
    })
  }
  const pickedIndex =
    progress.picked === null ? undefined : order[progress.picked]
  if (
    progress.outcome !== null &&
    pickedIndex !== undefined &&
    !play.own &&
    runs !== null &&
    runs.round === round
  ) {
    artifacts.push({
      id: "runResult",
      label: ARTIFACT_LABELS.runResult,
      content: (
        <RecordedRuns
          transcript={runs.transcript}
          chosen={variantOf(pickedIndex)}
          dimensions={round.constraintDiff.after.map(
            (constraint) => constraint.dimension
          )}
        />
      ),
    })
  }
  const focusId: ArtifactId | undefined =
    probe !== null ? "optionSet" : undefined
  const roundKey = `${play.own ? "own" : "corpus"}:${round.id}:${played}`

  return (
    // scroll-intent: reading-page — the phone's one vertical scroll, for the
    // reason `ReadingSession` gives; the switcher shows one artifact at a
    // time inside it, and nothing nested scrolls vertically.
    <div data-scroll-intent="reading-page" className={cn(column, className)}>
      {generating && (
        <>
          <GenerateRound
            buildPrompt={(request) =>
              buildRoundPrompt({
                ...request,
                recent,
                notes: notes.list(Date.now()),
              })
            }
            onStart={handleOwnRound}
            onCancel={() => setGenerating(false)}
          />
          {shelf && (
            <KeptShelf
              shelf={shelf}
              words={ROUND_SHELF_WORDS}
              replay={{ read: keptRoundOf, play: handleOwnRound }}
            />
          )}
        </>
      )}
      {/* Hidden, not unmounted, while the generator is open: a committed
          `RoundChoices` holds its one-shot state itself, and remounting it
          would re-enable a commitment already made (review finding on
          #1598). */}
      <div hidden={generating} className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 items-center justify-between gap-3 px-1">
          <span className="text-sm font-medium text-foreground">
            {play.own ? "Your round" : `Round ${played + 1}`}
          </span>
          {isListening(noteState.composer) && (
            <span
              id={finishingHintId}
              className="ml-auto text-xs text-muted-foreground"
            >
              Finishing your spoken note…
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 gap-1.5"
            // The generator hides the round, the note's Stop and Done with
            // it, and its own actions read the notes: while words are still
            // being turned into text it waits, and otherwise the open note
            // is closed first (what was typed is already saved).
            disabled={isListening(noteState.composer)}
            aria-describedby={
              isListening(noteState.composer) ? finishingHintId : undefined
            }
            onClick={() => {
              composer.dispatch({ type: "donePressed" })
              setGenerating(true)
            }}
          >
            <Sparkles className="size-4" aria-hidden="true" /> Make your own
          </Button>
        </div>

        {play.own && shelf && ownBody !== null && (
          <KeepOnShelf
            // Each own round is its own question: back to "Keep". Keyed on
            // its bytes, not only `roundKey`: a second own round can share
            // the first's id and `played` (review, #1600).
            key={`${roundKey}:${ownBody}`}
            shelf={shelf}
            words={ROUND_SHELF_WORDS}
            shelfKey={shelfKeyOf(round.id)}
            body={ownBody}
          />
        )}

        <ArtifactSwitcher
          artifacts={artifacts}
          roundId={roundKey}
          focusId={focusId}
          ariaLabel="Round"
          renderHeaderAction={(current) => (
            <NoteButton
              ref={noteButtonRef}
              label={current.label}
              open={noteState.composer.phase !== "closed"}
              onPress={() =>
                composer.dispatch({
                  type: "notePressed",
                  anchor: {
                    roundId: round.id,
                    own: play.own,
                    artifact: current.id,
                    picked: pickedIndex ?? null,
                    committed: progress.outcome !== null,
                    sessionId,
                  },
                })
              }
            />
          )}
          headerPanel={
            <NoteComposer
              state={noteState}
              dispatch={composer.dispatch}
              recognizer={recognizer?.recognizer ?? null}
              onFocusReturn={returnFocusToNote}
              className="mt-2"
            />
          }
          // Grows into the rest of the screen, so the whole of it is
          // something to swipe on rather than the strip a short artifact
          // draws. `grow`, not `flex-1`: its basis is its content, so a long
          // artifact makes the page scroll instead of being squeezed into
          // what is left of it (`min-h-0` is then moot, and keeps the
          // fit-the-box lint quiet).
          className="min-h-0 grow"
        />

        {progress.outcome !== null && (
          <div className="shrink-0 pb-2 pt-1">
            <Button className="w-full" size="lg" onClick={handleNext}>
              Next round
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
