import { ROLE_TYPEABLE } from "@leetype/types/leetype"

/**
 * The gate figures a patch step's `-` side must contribute nothing to
 * (LTY-PATCH, epic #1075's own "done when"): `assisted`/`correct` feed
 * `weightedWpm`, which `gateThreshold` is read against to decide whether a
 * step advances.
 */
export type GateFigures = {
  assisted: number
  correct: number
  weightedWpm: number
  gateThreshold: number
}

/** Anything shaped enough like the real `TypingGameWasm` to drive to completion and read a snapshot from. */
export type PlayableGame = {
  start(now: number): unknown
  press(key: string, now: number): unknown
  tick(now: number): unknown
  layout(): { displaySource: string }
  roles(): Uint8Array
  snapshot(now: number): GateFigures
  free(): void
}

/**
 * Types every typeable character in display order and reads back the
 * figures the reveal gate reads. Skips context/skip characters entirely —
 * the same `roles[index] !== ROLE_TYPEABLE` test the real keystroke
 * pipeline (`use-keystroke-capture`, `usePreviewGame`) already applies, so
 * this exercises the identical path a real player's keystrokes take.
 */
export function playToCompletion(
  game: PlayableGame,
  startNow: number,
  msPerKeystroke = 60
): GateFigures {
  game.start(startNow)
  const { displaySource } = game.layout()
  const roles = game.roles()
  let now = startNow
  for (let index = 0; index < displaySource.length; index++) {
    if (roles[index] !== ROLE_TYPEABLE) continue
    now += msPerKeystroke
    game.press(displaySource[index] ?? "", now)
  }
  game.tick(now)
  const snapshot = game.snapshot(now)
  game.free()
  return {
    assisted: snapshot.assisted,
    correct: snapshot.correct,
    weightedWpm: snapshot.weightedWpm,
    gateThreshold: snapshot.gateThreshold,
  }
}

const GATE_FIGURE_KEYS = [
  "assisted",
  "correct",
  "weightedWpm",
  "gateThreshold",
] as const

/**
 * Every figure that diverged between the two runs, as a human-readable
 * violation string — empty means the `-` side truly contributed nothing.
 */
export function compareGateFigures(
  withDeletion: GateFigures,
  withoutDeletion: GateFigures,
  label: string
): Array<string> {
  const violations: Array<string> = []
  for (const key of GATE_FIGURE_KEYS) {
    if (withDeletion[key] !== withoutDeletion[key]) {
      violations.push(
        `${label}: ${key} — with the deletion = ${withDeletion[key]}, without = ` +
          `${withoutDeletion[key]}. The '-' side contributed to a figure the gate reads.`
      )
    }
  }
  return violations
}
