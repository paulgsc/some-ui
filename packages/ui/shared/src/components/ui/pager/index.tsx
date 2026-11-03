/**
 * The phone's one pager (GES5, #2524): a deck of cards turned by a swipe,
 * beside the visible control that does the same (MOB-GESTURE: a gesture
 * supplements a control, never replaces it). `lib/pager` is the gesture's
 * policy and its runtime; this hook makes one per deck, attaches it to the
 * node its `attach` lands on, and hands back how far the card on screen follows
 * the finger, for a deck that draws it. A screen writes no touch or pointer
 * code of its own (`pnpm check:gestures`).
 */
import type { RefObject } from "react"
import {
  useCallback,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react"

import type { Deck, Orientation, Turn } from "../../../lib/pager"
import { offsetOf } from "../../../lib/pager"
import { createPager } from "../../../lib/pager/runtime"

export type PagerOptions = {
  /** Side by side unless said. */
  readonly orientation?: Orientation
  /** There is a card before this one, which the visible Previous turns to. */
  readonly canPrev: boolean
  /** There is a card after this one, which the visible Next turns to. */
  readonly canNext: boolean
  /** Something is under way (a take being recorded): nothing turns. */
  readonly held?: boolean
  /** Turns the card, as the visible control would. */
  readonly onPage: (to: Turn) => void
  /**
   * A ref the deck's node also fills, for a hook that measures the same
   * node (`useFittedPage`'s viewport).
   */
  readonly shareRef?: RefObject<HTMLElement | null>
}

export type Pager = {
  /** The deck's node's callback ref (`ref={attach}`). */
  readonly attach: (node: HTMLElement | null) => (() => void) | undefined
  /** How far the card on screen is drawn from its place, along the deck. */
  readonly offset: number
  /** A finger is dragging the card, so it follows without easing. */
  readonly dragging: boolean
}

/** The deck's facts as `options` say them. */
const deckOf = (options: PagerOptions): Deck => ({
  orientation: options.orientation ?? "horizontal",
  canPrev: options.canPrev,
  canNext: options.canNext,
  held: options.held ?? false,
})

export function usePager(options: PagerOptions): Pager {
  const [pager] = useState(() => createPager())
  // The deck as last rendered, which the runtime reads at each touch.
  useLayoutEffect(() => {
    const deck = deckOf(options)
    pager.update({ deck: () => deck, page: options.onPage })
  })
  const state = useSyncExternalStore(
    pager.subscribe,
    pager.getState,
    pager.getState
  )
  const { shareRef } = options
  const orientation = options.orientation ?? "horizontal"
  const attach = useCallback(
    (node: HTMLElement | null): (() => void) | undefined => {
      if (shareRef !== undefined) shareRef.current = node
      if (node === null) return undefined
      const detach = pager.attach(node, orientation)
      return () => {
        detach()
        if (shareRef !== undefined) shareRef.current = null
      }
    },
    [pager, shareRef, orientation]
  )
  return {
    attach,
    offset: offsetOf(state, deckOf(options)),
    dragging: state.kind === "dragging",
  }
}
