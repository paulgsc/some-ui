/**
 * Studio's idea capture hears the owner through the app's `Listen` plugin
 * (STUDIO ST18; apps/mobile's README, "Hearing an idea"). Every call goes
 * through `callForeign` (F1); a build or phone without the recognizer, its
 * offline language, or the microphone answers `unavailable`, and the
 * question takes typed words.
 */
import { assertNever } from "@some-ui/core-utils"
import type { ForeignPort, ForeignVerdict } from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"
import type { IdeaListener, Listened, Listening } from "@some-ui/soundbites"

import { isMissingPlugin, pluginCode } from "@/lib/intent/foreign"

import type * as NativeModule from "./native"

let loading: Promise<typeof NativeModule> | null = null
function native(): Promise<typeof NativeModule> {
  loading ??= import("./native")
  return loading
}

/** Whether the phone can listen: asked once, answered in seconds. */
const AVAILABLE_DEADLINE_MS = 10_000
/**
 * One answer, spoken: the recognizer ends on a pause by itself; this only
 * bounds one that never does. Long enough for the microphone prompt too.
 */
const LISTEN_DEADLINE_MS = 3 * 60_000
/** Stopping or letting go answers at once. */
const STOP_DEADLINE_MS = 5_000

function classify(error: unknown): ForeignVerdict {
  if (error instanceof ForeignDeadlineError) {
    return {
      kind: "unreachable",
      retryable: true,
      summary: "Listening didn’t finish.",
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
    deadlineMs: STOP_DEADLINE_MS,
    start: async () => {
      const module = await native()
      return what === "stop" ? module.stop() : module.cancel()
    },
  })
  // Ignored: a failure is reported by the port; the listening it was for
  // settles on its own deadline either way.
  void call.outcome
}

function listen(onWords: (words: string) => void): Listening {
  /** Stop was asked for: once started, the plugin answers what it heard. */
  let stopped = false
  const call = callForeign<string>({
    port: PORT,
    deadlineMs: LISTEN_DEADLINE_MS,
    start: async (signal) => {
      const module = await native()
      const handle = await module.onWords((words) => {
        if (!signal.aborted) onWords(words)
      })
      try {
        // Let go while setting up: a cancel sent then reached the plugin
        // before this start would, so nothing must start now.
        if (signal.aborted) throw new Error("let go before it started")
        // Stopped while setting up: nothing was heard, and nothing starts.
        if (stopped) return ""
        // Let go once started (a deadline, or a cancel racing this start):
        // the plugin stops listening.
        signal.addEventListener("abort", () => tell("cancel"), { once: true })
        const { words } = await module.start()
        return words
      } finally {
        void handle.remove()
      }
    },
  })
  const done = call.outcome.then((outcome): Listened => {
    switch (outcome.status) {
      case "succeeded": {
        return { kind: "heard", words: outcome.value }
      }
      case "failed": {
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
  })
  return {
    done,
    stop: (): void => {
      stopped = true
      tell("stop")
    },
    cancel: (): void => {
      call.abandon()
      tell("cancel")
    },
  }
}

export const deviceListener: IdeaListener = {
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
  listen,
}
