import { useSyncExternalStore } from "react"

/**
 * The workspace's one definition of a handheld window, in numbers.
 *
 * Width alone was the old answer (shadcn's sidebar hook, where it only ever
 * chose between a sheet and a fixed panel), and it is wrong exactly once: a
 * phone on its side is about 844x390, wide enough to pass and far too short
 * for desktop chrome. Rotating then flipped the answer, and every host that
 * builds a different tree for each answer rebuilt the activity inside it -
 * which is how turning a phone over ended a Topik lesson.
 *
 * So a window is handheld when either axis is compact: narrower than `md`,
 * or shorter than Material's compact-height class (480dp), which is also
 * the height `@some-ui/topik` already used to pick its handheld surface.
 * A phone is then handheld in both orientations, and rotating one no longer
 * crosses the line.
 *
 * The same query exists once more, in CSS, as the `handheld:` variant in
 * `@some-ui/styles` (`packages/some-styles/tailwind.css`); it must say what
 * `HANDHELD_QUERY` says.
 */
export const HANDHELD_MAX_WIDTH = 768
export const HANDHELD_MAX_HEIGHT = 480
export const HANDHELD_QUERY = `(max-width: ${HANDHELD_MAX_WIDTH - 1}px), (max-height: ${HANDHELD_MAX_HEIGHT - 1}px)`

/** Whether a box of this size is handheld, by the same rule as the query. */
export function isHandheldBox({
  width,
  height,
}: {
  width: number
  height: number
}): boolean {
  return width < HANDHELD_MAX_WIDTH || height < HANDHELD_MAX_HEIGHT
}

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(HANDHELD_QUERY)
  mql.addEventListener("change", onChange)
  return (): void => mql.removeEventListener("change", onChange)
}

function snapshot(): boolean {
  return window.matchMedia(HANDHELD_QUERY).matches
}

/**
 * Whether the window is handheld (`HANDHELD_QUERY`, above).
 *
 * `useSyncExternalStore` rather than an effect that calls `setState`: a media
 * query *is* an external store, and reading it this way means the first
 * render already has the right answer instead of rendering `false`, painting,
 * and correcting itself a frame later. It also removes the tri-state
 * (`undefined` until the effect ran) that callers had to coerce away.
 *
 * The server snapshot is `false` - there is no viewport to measure, and
 * desktop is the layout that degrades more gracefully when it turns out to be
 * wrong.
 *
 * A caller that branches on this must not let the branch change where its
 * stateful children sit in the tree: the answer can change while a person is
 * mid-task (a window resized across `md`), and a child whose position moves
 * is unmounted and mounted fresh, losing its state. Keep each child in one
 * slot and switch only what surrounds it (`{isMobile && <Chrome />}`), or hold
 * its state above the branch.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
