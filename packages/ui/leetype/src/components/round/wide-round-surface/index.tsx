import type { FC } from "react"
import { useState } from "react"
import type { SwitchableArtifact } from "@leetype/components/round/artifact-switcher"
import { ArtifactSwitcher } from "@leetype/components/round/artifact-switcher"
import { TypingSession } from "@leetype/components/typing-game/typing-session"
import type { Commitment } from "@leetype/types/commitment"
import type { Exercise } from "@leetype/types/exercise"
import { cn } from "some-ui-utils"

type WideRoundSurfaceProps = {
  /** Opaque round-identity token, forwarded to `ArtifactSwitcher`; a change also closes the probe. */
  roundId: string
  /**
   * Def. 9.2's artifacts as `ArtifactSwitcher` takes them, including the one
   * owning the commit gesture. Unchanged across the commitment: a verdict is
   * revealed by that artifact re-rendering in place.
   */
  artifacts: ReadonlyArray<SwitchableArtifact>
  /**
   * What a second, simultaneous switcher may show once a commitment lands
   * (Rem. 9.2's exception), typically `D` beside the verdict. Absent or
   * empty: still one switcher (simultaneity is a permission).
   */
  revealArtifacts?: ReadonlyArray<SwitchableArtifact>
  /**
   * What the learner committed to this round, controlled by the caller that
   * owns round-cycle state (artifact content is opaque here). While `null`,
   * the second switcher and the probe's "Open" affordance are absent.
   */
  commitment: Commitment | null
  /** Fed to the production probe once the learner opens it (only after a commitment). */
  probeExercise: Exercise
  className?: string
}

/**
 * The wide surface (Rem. 9.2 / Prop. 9.2), reproducing the phone's
 * sequencing rather than inheriting correctness from more room.
 *
 * Extra room buys size, not simultaneity: whether a second
 * `ArtifactSwitcher` renders depends only on `commitment`, never on
 * viewport width, and no responsive class could show two artifacts before a
 * commitment. The switcher is `ArtifactSwitcher` itself, unmodified: one
 * component, two sizes.
 *
 * The primary switcher is always the grid's first child, so it survives the
 * commitment transition as the same instance and keeps its position and any
 * artifact state.
 *
 * `TypingSession` (the optional production probe) mounts only when the
 * learner presses "Open production probe", which is what loads the engine;
 * its output is discarded, and unmounting frees the engine. The affordance
 * is absent until `commitment` is non-null, since an open probe beside the
 * unanswered option set is the simultaneity Rem. 9.2 rules out.
 *
 * A round change closes the probe ("adjust state during render", as
 * `ArtifactSwitcher` resets).
 */
export const WideRoundSurface: FC<WideRoundSurfaceProps> = ({
  roundId,
  artifacts,
  revealArtifacts,
  commitment,
  probeExercise,
  className,
}) => {
  const [seenRoundId, setSeenRoundId] = useState(roundId)
  const [probeOpen, setProbeOpen] = useState(false)
  if (roundId !== seenRoundId) {
    setSeenRoundId(roundId)
    setProbeOpen(false)
  }

  const reveal =
    commitment !== null && revealArtifacts && revealArtifacts.length > 0
      ? revealArtifacts
      : null

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-6", className)}>
      <div
        className={cn(
          "grid min-w-0 gap-6",
          reveal ? "grid-cols-2" : "grid-cols-1"
        )}
      >
        <ArtifactSwitcher
          artifacts={artifacts}
          roundId={roundId}
          // Explicit so the two switchers' Previous/Next names never collide.
          ariaLabel={reveal ? "Round artifact" : undefined}
        />
        {reveal && (
          <ArtifactSwitcher
            artifacts={reveal}
            roundId={`${roundId}:reveal`}
            ariaLabel="Revealed artifact"
          />
        )}
      </div>

      {commitment !== null && (
        <div
          role="region"
          aria-label="Production probe"
          className="min-w-0 rounded-lg border border-border/60 p-4"
        >
          {probeOpen ? (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setProbeOpen(false)}
                className="self-end text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Close production probe
              </button>
              <div className="relative h-[480px] w-full overflow-hidden rounded-md">
                <TypingSession exercise={probeExercise} />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setProbeOpen(true)}
              className="text-sm font-medium text-foreground transition-colors hover:underline"
            >
              Open production probe
            </button>
          )}
        </div>
      )}
    </div>
  )
}
