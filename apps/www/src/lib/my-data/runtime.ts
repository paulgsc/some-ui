/**
 * My data's runtime (MY-DATA MD2, #2476): reads what home keeps and what
 * this phone holds, over ports, and plays one recording at a time. Which
 * late answer is stale is `./state`'s `stepMyData`; the page reads the
 * snapshot and calls `open`, `checkAgain`, `play` and `stop`.
 */
import type { Player } from "@some-ui/voice-capture"

import type { HomeReading, Of, PhoneRead } from "./model"
import type { MyDataEvent, MyDataState } from "./state"
import { INITIAL_MY_DATA, stepMyData } from "./state"

export type MyDataPorts = {
  /** What home keeps, with `of`'s newest when asked; never rejects. */
  readonly askHome: (of: Of | null) => Promise<HomeReading>
  /** This phone's recordings; never rejects (one it can't read is left out). */
  readonly readPhone: () => Promise<PhoneRead>
  /** Recording `id`'s audio on this phone, or null. */
  readonly audioOf: (id: string) => Promise<Blob | null>
  readonly player: Player
}

export type MyData = {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => MyDataState
  /** Reads what the page at `of` (null: the overview) shows. */
  readonly open: (of: Of | null) => void
  /**
   * Reads the shown page again, for a pull: resolves once both answered,
   * rejects when home was asked and didn't answer.
   */
  readonly checkAgain: () => Promise<void>
  /** Plays recording `id`, stopping any other. */
  readonly play: (id: string) => void
  /** Stops what is playing. */
  readonly stop: () => void
}

export function createMyData(ports: MyDataPorts): MyData {
  let state = INITIAL_MY_DATA
  const listeners = new Set<() => void>()
  let playback: { readonly id: string; readonly stop: () => void } | null = null
  /** The latest ask to play: an earlier one whose audio lands late plays nothing. */
  let asked: object | null = null

  const dispatch = (event: MyDataEvent): void => {
    const next = stepMyData(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }

  const read = async (of: Of | null): Promise<HomeReading> => {
    dispatch({ type: "asked", of })
    const { seq } = state
    const [home, phone] = await Promise.all([
      ports.askHome(of),
      ports.readPhone(),
    ])
    dispatch({ type: "phoneRead", seq, phone })
    dispatch({ type: "homeAnswered", seq, home })
    return home
  }

  const stop = (): void => {
    const playing = playback
    playback = null
    playing?.stop()
  }

  const play = async (id: string): Promise<void> => {
    stop()
    const ask = {}
    asked = ask
    dispatch({ type: "played", id })
    const audio = await ports
      .audioOf(id)
      // Ignored: audio this phone can't read plays nothing, and its row
      // offers Play again.
      .catch(() => null)
    if (asked !== ask || state.playing !== id) return
    if (audio === null) {
      dispatch({ type: "stopped", id })
      return
    }
    const started = ports.player.play(audio)
    const mine = { id, stop: started.stop }
    playback = mine
    await started.ended
    if (playback === mine) playback = null
    dispatch({ type: "stopped", id })
  }

  return {
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,
    open(of): void {
      void read(of)
    },
    async checkAgain(): Promise<void> {
      const home = await read(state.of)
      if (home.kind === "unreachable") throw new Error("home didn't answer")
    },
    play(id): void {
      void play(id)
    },
    stop(): void {
      asked = null
      const { playing } = state
      stop()
      if (playing !== null) dispatch({ type: "stopped", id: playing })
    },
  }
}
