/**
 * The parts Takes on home and the takes needing attention (HEARD3) draw
 * alike: a take's Play. A chip that filters a list is `@some-ui/shared`'s
 * `Chip`.
 */
import type { JSX } from "react"
import { Button } from "@some-ui/shared"
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
