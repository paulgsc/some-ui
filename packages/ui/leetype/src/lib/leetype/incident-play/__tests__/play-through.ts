import type {
  Play,
  PlayInput,
  StepContext,
} from "@leetype/lib/leetype/incident-play/model"
import { startPlay, step } from "@leetype/lib/leetype/incident-play/model"
import type { SessionEvent } from "@leetype/lib/leetype/session-log/model"
import type { SessionFile } from "@leetype/types/session-file"

const T0 = Date.parse("2026-10-18T20:00:00.000Z")

/** A step context `after` ms past T0, with fresh ids. */
export function clock(
  median: number | null = null,
  hiddenMs = 0
): { ctx: (after: number) => StepContext } {
  let id = 0
  return {
    ctx: (after): StepContext => ({
      at: T0 + after,
      newId: () => `e${String(++id)}`,
      medianMs: median,
      hiddenMs,
    }),
  }
}

type PlayOptions = {
  readonly file?: SessionFile
  readonly median?: number | null
  readonly form?: "full" | "short"
  readonly gapMs?: number
  readonly from?: Parameters<typeof startPlay>[0]["from"]
  readonly hiddenMs?: number
}

/**
 * Plays `inputs` on `file` in turn, one second apart unless `gapMs` says,
 * collecting every event.
 */
export function playerFor(
  file: SessionFile,
  fileName: string
): (
  inputs: ReadonlyArray<PlayInput>,
  options?: PlayOptions
) => { play: Play; events: Array<SessionEvent> } {
  return (inputs, options = {}) => {
    const { ctx } = clock(options.median ?? null, options.hiddenMs ?? 0)
    const gap = options.gapMs ?? 1000
    const started = startPlay(
      {
        fileName,
        file: options.file ?? file,
        session: "s1",
        form: options.form ?? "full",
        ...(options.from === undefined ? {} : { from: options.from }),
      },
      ctx(0)
    )
    let play = started.play
    const events = [...started.events]
    inputs.forEach((input, index) => {
      const stepped = step(play, input, ctx((index + 1) * gap))
      play = stepped.play
      events.push(...stepped.events)
    })
    return { play, events }
  }
}

export const RIGHT = { type: "pick", option: 0 } as const
export const WRONG = { type: "pick", option: 1 } as const
export const ON = { type: "continue" } as const
