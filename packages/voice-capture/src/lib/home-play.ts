/**
 * Playing one of home's takes by asking home for its audio, as Soundbites'
 * Takes on home and the takes needing attention, and Rust Rounds' opening
 * (#3269), each do: pure steps over a slice of their state. Plays are numbered, so a press on another take
 * stops the one playing, and audio that lands for a play since overtaken is
 * never played.
 */

/** What plays: nothing, a take whose audio is on its way, or a take playing. */
type Playback =
  | { readonly kind: "quiet" }
  | { readonly kind: "loading"; readonly id: string }
  | { readonly kind: "playing"; readonly id: string }

/** The part of a screen's state that plays. */
export type PlaySlice = {
  readonly playback: Playback
  /** The latest play asked for; audio for an earlier one is stale. */
  readonly plays: number
  /** The take whose audio home couldn't give back, the last time it was asked. */
  readonly unplayable: string | null
}

export type PlayEffect =
  | { readonly type: "readAudio"; readonly play: number; readonly id: string }
  | {
      readonly type: "startPlayback"
      readonly play: number
      readonly audio: Blob
    }
  | { readonly type: "stopPlayback" }

export type PlayStep<S> = {
  readonly state: S
  readonly effects: ReadonlyArray<PlayEffect>
}

export const QUIET_PLAY: PlaySlice = {
  playback: { kind: "quiet" },
  plays: 0,
  unplayable: null,
}

const same = <S>(state: S): PlayStep<S> => ({ state, effects: [] })

/** The take playing or on its way, if any. */
const playingId = (playback: Playback): string | null =>
  playback.kind === "quiet" ? null : playback.id

/** Stops what plays, under a new number, so its late answers are for nobody. */
export function stopped<S extends PlaySlice>(state: S): PlayStep<S> {
  if (state.playback.kind === "quiet") return same(state)
  return {
    state: { ...state, playback: { kind: "quiet" }, plays: state.plays + 1 },
    effects: [{ type: "stopPlayback" }],
  }
}

/** Play on take `id`: stops it if it plays, else stops any other and asks. */
export function played<S extends PlaySlice>(state: S, id: string): PlayStep<S> {
  const stop = stopped(state)
  if (playingId(state.playback) === id) return stop
  const play = stop.state.plays + 1
  return {
    state: {
      ...stop.state,
      plays: play,
      playback: { kind: "loading", id },
      unplayable: null,
    },
    effects: [...stop.effects, { type: "readAudio", play, id }],
  }
}

/** Home's audio for play `play`, or null when it couldn't give it back. */
export function audioRead<S extends PlaySlice>(
  state: S,
  play: number,
  audio: Blob | null
): PlayStep<S> {
  const { playback } = state
  if (play !== state.plays || playback.kind !== "loading") return same(state)
  if (audio === null) {
    return same({
      ...state,
      playback: { kind: "quiet" },
      unplayable: playback.id,
    })
  }
  return {
    state: { ...state, playback: { kind: "playing", id: playback.id } },
    effects: [{ type: "startPlayback", play, audio }],
  }
}

/** Play `play` came to its end. */
export function playEnded<S extends PlaySlice>(
  state: S,
  play: number
): PlayStep<S> {
  if (play !== state.plays) return same(state)
  return same({ ...state, playback: { kind: "quiet" } })
}
