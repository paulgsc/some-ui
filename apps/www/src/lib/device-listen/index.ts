/**
 * Studio's idea capture and Watch's spoken notes hear the owner through the
 * app's `Listen` plugin (STUDIO ST18 and ST5; apps/mobile's README,
 * "Hearing an idea"). Every call goes through `callForeign` (F1); a build or
 * phone without the recognizer, its offline language, or the microphone
 * answers `unavailable`, and the question takes typed words.
 *
 * **LS1: a tap that starts or stops listening is answered in human time.**
 *
 * - _Claim:_ a listening says it is ready, or ends as `notStarted`, within
 *   `readyMs` of starting (`promptMs` once the microphone prompt is up); a
 *   stop ends it within `stopMs`, with the words heard so far; and a
 *   listening that is ready ends within `listenMs`.
 * - _Family:_ the recognizer's answers (ready never, ready then silent,
 *   ready then words, results after stop, results never after stop, an
 *   error, the prompt up) × the calls (start, stop, cancel) × when they
 *   come (before ready, after ready, after stop).
 * - _Proof:_ `index.test.ts` ("LS1"), over a plugin that withholds each
 *   callback; `lib/idea`'s machine test ("LS1") takes each ending to a
 *   screen that says it. Declared for #2324.
 *
 * `callForeign` bounds a call; the two timers here bound an event the plugin
 * sends during one (ready) or after one (the words after a stop), which no
 * call's deadline can.
 *
 * The recognizer borrows the phone's one microphone (`phoneMicrophone`,
 * `@some-ui/voice-capture`'s `owner.ts`) for each listening and gives it
 * back once the listening ends: a listening asked for while a take records
 * ends `notStarted` at once.
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  ForeignOutcome,
  ForeignPort,
  ForeignVerdict,
} from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"
import type { IdeaListener, Listened, Listening } from "@some-ui/soundbites"
import type { MicOwner } from "@some-ui/voice-capture"
import { phoneMicrophone } from "@some-ui/voice-capture"

import { isMissingPlugin, pluginCode } from "@/lib/intent/foreign"

import type * as NativeModule from "./native"

let loading: Promise<typeof NativeModule> | null = null
function native(): Promise<typeof NativeModule> {
  loading ??= import("./native")
  return loading
}

export type ListenDeadlines = {
  /** The recognizer saying it is listening, from the start. */
  readonly readyMs: number
  /** The same, from the microphone prompt going up: a person answers it. */
  readonly promptMs: number
  /** Done talking: the words heard, from the stop. */
  readonly stopMs: number
  /**
   * One answer, spoken, from the start: the recognizer ends on a pause by
   * itself; this only bounds one that never does.
   */
  readonly listenMs: number
}

const LISTEN_DEADLINES: ListenDeadlines = {
  readyMs: 5_000,
  promptMs: 60_000,
  stopMs: 5_000,
  listenMs: 3 * 60_000,
}

/** Whether the phone can listen: asked once, answered in seconds. */
const AVAILABLE_DEADLINE_MS = 10_000
/** Stopping or letting go answers at once. */
const TELL_DEADLINE_MS = 5_000

/** The recognizer never said it was listening. */
class NotReadyError extends Error {
  constructor(deadlineMs: number) {
    super(`the recognizer was not ready within ${deadlineMs}ms`)
    this.name = "NotReadyError"
  }
}

function classify(error: unknown): ForeignVerdict {
  if (error instanceof ForeignDeadlineError) {
    return {
      kind: "unreachable",
      retryable: true,
      summary: "Listening didn’t finish.",
    }
  }
  if (error instanceof NotReadyError) {
    return {
      kind: "unreachable",
      retryable: true,
      summary: "Listening didn’t start.",
    }
  }
  if (isMissingPlugin(error) || pluginCode(error) === "DENIED") {
    return {
      kind: "unavailable",
      retryable: false,
      summary: "This phone can’t listen offline, or the microphone is off.",
    }
  }
  return { kind: "unknown", retryable: true, summary: "Listening didn’t work." }
}

const PORT: ForeignPort = {
  name: "android speech recognizer",
  classify,
  report: reportFailure,
}

/** Stops or lets go, without waiting on the answer. */
function tell(what: "stop" | "cancel"): void {
  const call = callForeign<void>({
    port: PORT,
    deadlineMs: TELL_DEADLINE_MS,
    start: async () => {
      const module = await native()
      return what === "stop" ? module.stop() : module.cancel()
    },
  })
  // Ignored: a failure is reported by the port; the listening it was for
  // settles on its own deadline either way.
  void call.outcome
}

/**
 * From `start`, rejects with `NotReadyError` unless `ready` is called within
 * the ready deadline, counted again from the prompt going up. `clear` ends
 * the wait.
 */
function readyWatch(deadlines: ListenDeadlines): {
  notReady: Promise<never>
  start: () => void
  asking: () => void
  /** Ready came, or nobody waits any more. */
  clear: () => void
} {
  let timer: ReturnType<typeof setTimeout> | null = null
  let fail: (error: NotReadyError) => void = () => undefined
  const notReady = new Promise<never>((_, reject) => {
    fail = reject
  })
  // Ignored: nobody waits on it until the start races it, and the start's
  // own failure is what carries the error.
  notReady.catch(() => undefined)
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const arm = (ms: number): void => {
    clear()
    timer = setTimeout(() => fail(new NotReadyError(ms)), ms)
  }
  return {
    notReady,
    start: () => arm(deadlines.readyMs),
    asking: () => arm(deadlines.promptMs),
    clear,
  }
}

function listened(outcome: ForeignOutcome<string>): Listened {
  switch (outcome.status) {
    case "succeeded": {
      return { kind: "heard", words: outcome.value }
    }
    case "failed": {
      if (outcome.error.cause instanceof NotReadyError) {
        return { kind: "notStarted" }
      }
      return outcome.error.kind === "unavailable"
        ? { kind: "unavailable" }
        : { kind: "failed" }
    }
    case "abandoned": {
      return { kind: "failed" }
    }
    default: {
      return assertNever(outcome)
    }
  }
}
/** A listening the microphone could not be lent for: it never starts. */
const NOT_LENT: Listening = {
  done: Promise.resolve({ kind: "notStarted" }),
  stop: () => undefined,
  cancel: () => undefined,
}

/** A listening on the microphone `owner` lends it, given back once it ends. */
function borrowed(
  owner: MicOwner,
  onWords: (words: string) => void,
  onReady: () => void,
  deadlines: ListenDeadlines
): Listening {
  const lease = owner.claim("recognizer")
  if (lease === null) return NOT_LENT
  const listening = listen(onWords, onReady, deadlines)
  // `done` settles exactly once, never rejecting.
  void listening.done.then(lease.release)
  return listening
}

function listen(
  onWords: (words: string) => void,
  onReady: () => void,
  deadlines: ListenDeadlines
): Listening {
  /** Stop was asked for: once started, the plugin answers what it heard. */
  let stopped = false
  /** The words so far, for a stop the plugin never answers. */
  let heard = ""
  let stopTimer: ReturnType<typeof setTimeout> | null = null
  const watch = readyWatch(deadlines)
  const call = callForeign<string>({
    port: PORT,
    deadlineMs: deadlines.listenMs,
    start: async (signal) => {
      /** Still waiting on the plugin: what it says is for this listening. */
      let live = true
      const module = await native()
      const handles = await Promise.all([
        module.onWords((words) => {
          if (!live || signal.aborted) return
          heard = words
          onWords(words)
        }),
        module.onAsking(() => {
          if (live && !signal.aborted) watch.asking()
        }),
        module.onReady(() => {
          if (!live || signal.aborted) return
          watch.clear()
          onReady()
        }),
      ])
      try {
        // Let go while setting up: a cancel sent then reached the plugin
        // before this start would, so nothing must start now.
        if (signal.aborted) throw new Error("let go before it started")
        // Stopped while setting up: nothing was heard, and nothing starts.
        if (stopped) return ""
        // Let go once started (a deadline, or a cancel racing this start):
        // the plugin stops listening.
        signal.addEventListener("abort", () => tell("cancel"), { once: true })
        const started = module.start()
        watch.start()
        try {
          const { words } = await Promise.race([started, watch.notReady])
          return words
        } catch (error) {
          // Ignored: the failure aborts the signal, which tells the plugin
          // to let go, so whatever the start answers later is for nobody.
          if (error instanceof NotReadyError) started.catch(() => undefined)
          throw error
        }
      } finally {
        live = false
        watch.clear()
        for (const handle of handles) void handle.remove()
      }
    },
  })
  let settle: (result: Listened) => void = () => undefined
  const done = new Promise<Listened>((resolve) => {
    settle = resolve
  })
  void call.outcome.then((outcome) => {
    if (stopTimer !== null) clearTimeout(stopTimer)
    const result = listened(outcome)
    // Stopped, then ended by a deadline or let go before the plugin
    // answered: what was heard so far is the answer, as the stop's own
    // bound would give.
    settle(
      stopped && result.kind === "failed"
        ? { kind: "heard", words: heard }
        : result
    )
  })
  return {
    done,
    stop: (): void => {
      if (stopped) return
      stopped = true
      // The stop's own bound answers now, not the ready one.
      watch.clear()
      tell("stop")
      stopTimer = setTimeout(() => {
        PORT.report({
          port: PORT.name,
          error: {
            kind: "unreachable",
            retryable: true,
            summary: "Stopping didn’t finish.",
            cause: new ForeignDeadlineError(PORT.name, deadlines.stopMs),
          },
        })
        // Abandoning aborts the signal, which tells the plugin to let go.
        call.abandon()
        settle({ kind: "heard", words: heard })
      }, deadlines.stopMs)
    },
    cancel: (): void => {
      if (stopTimer !== null) clearTimeout(stopTimer)
      // Let go, not stopped: nothing is kept.
      stopped = false
      call.abandon()
      tell("cancel")
    },
  }
}

/**
 * The phone's recognizer, with `deadlines` in place of the usual ones, on
 * the microphone `owner` lends (the phone's one unless a test gives its own).
 */
export function createDeviceListener(
  deadlines: ListenDeadlines = LISTEN_DEADLINES,
  owner: MicOwner = phoneMicrophone
): IdeaListener {
  return {
    available: () =>
      callForeign<boolean>({
        port: PORT,
        deadlineMs: AVAILABLE_DEADLINE_MS,
        start: async () => {
          const module = await native()
          const { available } = await module.available()
          return available
        },
      }).outcome.then(
        (outcome) => outcome.status === "succeeded" && outcome.value
      ),
    listen: (onWords, onReady) => borrowed(owner, onWords, onReady, deadlines),
  }
}

export const deviceListener: IdeaListener = createDeviceListener()
