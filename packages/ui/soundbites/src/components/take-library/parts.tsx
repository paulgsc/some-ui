/**
 * The parts Takes on home and the takes needing attention (HEARD3) draw
 * alike: a take's Play, and a chip that filters a list.
 */
import type { JSX, ReactNode } from "react"
import { cn } from "@some-ui/core-utils"
import type { DotMeaning } from "@some-ui/shared"
import { Button, Dot } from "@some-ui/shared"
import { LIBRARY_WORDS } from "@soundbites/lib/library/words"
import { LoaderCircle, Pause, Play } from "lucide-react"

/** A take's Play: Stop while it plays, a spinner while its audio comes. */
export const PlayButton = ({
  playing,
  loading,
  disabled = false,
  onPress,
}: {
  /** This take is playing, or its audio is on its way. */
  playing: boolean
  loading: boolean
  disabled?: boolean
  onPress: () => void
}): JSX.Element => (
  <Button
    type="button"
    size="icon"
    className="bg-brand text-brand-foreground hover:bg-brand/85 size-11 shrink-0 rounded-full"
    onClick={onPress}
    disabled={disabled}
    aria-label={playing ? LIBRARY_WORDS.stop : LIBRARY_WORDS.play}
  >
    {!playing ? (
      <Play className="size-4" aria-hidden="true" />
    ) : loading ? (
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
    ) : (
      <Pause className="size-4" aria-hidden="true" />
    )}
  </Button>
)

/** A chip: what it shows, its count, and whether it is picked. */
export const Chip = ({
  picked,
  count,
  dot,
  onTap,
  children,
}: {
  picked: boolean
  count: number
  dot: DotMeaning | null
  onTap: () => void
  children: ReactNode
}): JSX.Element => (
  <button
    type="button"
    aria-pressed={picked}
    onClick={onTap}
    className={cn(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm",
      picked ? "bg-foreground text-background" : "bg-card"
    )}
  >
    {dot !== null && <Dot meaning={dot} className="size-2" />}
    {children}
    <span className="tabular-nums opacity-75">{count}</span>
  </button>
)

/** The bar the chips sit in, which scrolls sideways on its own. */
export const CHIP_BAR =
  "bg-background sticky top-0 z-10 flex gap-2 overflow-x-auto py-1"
