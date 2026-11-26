/**
 * What every character's loops draw with (`./host`, HOST1; Tin Bird's loops
 * in `./host-tin-owlet`, HOST3): the shape of a loop, and the pure helpers
 * that move a cast drawing's named parts.
 */

import type { CastNode } from "./cast"

/** A point in the host's area, each axis from 0 (left, top) to 1 (right, bottom). */
export type Spot = { readonly x: number; readonly y: number }

/**
 * What a loop knows of its moment besides the time: where the eyes aim (a
 * direction, each axis -1 to 1), and whether the beat gave the host a point
 * to look at, which Tin Bird points to with a wing (C1525).
 */
export type Moment = { readonly aim: Spot; readonly pointing: boolean }

/** A drawing changed for a moment: an emotion's or a ceremony's loop `tMs` into its beat. */
export type Redraw = (
  nodes: ReadonlyArray<CastNode>,
  tMs: number,
  moment: Moment
) => ReadonlyArray<CastNode>

export const TAU = Math.PI * 2

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v))

export const smooth = (p: number): number => {
  const q = clamp(p, 0, 1)
  return q * q * (3 - 2 * q)
}

/** The way from `a` to `b`, `e` of it (0 to 1). */
export const lerp = (a: number, b: number, e: number): number => a + (b - a) * e

/** A number as SVG text: three places, and never `-0`. */
export const num = (v: number): string => {
  const r = Math.round(v * 1000) / 1000
  return String(r === 0 ? 0 : r)
}

/** `nodes` with `attrs` of every node named `part` replaced by `change(attrs)`. */
export const changed = (
  nodes: ReadonlyArray<CastNode>,
  part: string,
  change: (attrs: CastNode["attrs"]) => CastNode["attrs"]
): ReadonlyArray<CastNode> =>
  nodes.map((node) => {
    const children =
      node.children === undefined
        ? undefined
        : changed(node.children, part, change)
    const attrs =
      node.attrs["data-part"] === part ? change(node.attrs) : node.attrs
    return children === undefined
      ? { tag: node.tag, attrs }
      : { tag: node.tag, attrs, children }
  })

/** `nodes` with `transform` set on every node named `part`. */
export const moved = (
  nodes: ReadonlyArray<CastNode>,
  part: string,
  transform: string
): ReadonlyArray<CastNode> =>
  changed(nodes, part, (attrs) => ({ ...attrs, transform }))

/**
 * `nodes` with `transform` applied outside whatever every node named `part`
 * already carries, so a loop moves a part the idle has moved without
 * undoing the idle.
 */
export const movedFurther = (
  nodes: ReadonlyArray<CastNode>,
  part: string,
  transform: string
): ReadonlyArray<CastNode> =>
  changed(nodes, part, (attrs) => {
    const before = attrs.transform
    return {
      ...attrs,
      transform:
        before === undefined ? transform : `${transform} ${String(before)}`,
    }
  })

/**
 * `nodes` with every node named `part` given `attrs`, which replace its
 * own, and moved `further` by `transform` when one is given.
 */
export const retouched = (
  nodes: ReadonlyArray<CastNode>,
  part: string,
  attrs: CastNode["attrs"],
  transform?: string
): ReadonlyArray<CastNode> => {
  const set = changed(nodes, part, (own) => ({ ...own, ...attrs }))
  return transform === undefined ? set : movedFurther(set, part, transform)
}
