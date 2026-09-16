import type { FC } from "react"
import { useState } from "react"
import type { SwitchableArtifact } from "@leetype/components/round/artifact-switcher"
import { ArtifactSwitcher } from "@leetype/components/round/artifact-switcher"
import { TypingSession } from "@leetype/components/typing-game/typing-session"
import type { Commitment } from "@leetype/types/commitment"
import type { Exercise } from "@leetype/types/exercise"
import { cn } from "some-ui-utils"

type WideRoundSurfaceProps = {
  /** Opaque round-identity token, forwarded to `ArtifactSwitcher` unchanged — see that component's own doc comment for what resets on a change. Also what this component resets its own local `probeOpen` state on (below). */
  roundId: string
  /**
   * Def. 9.2's six artifacts, exactly as C1's own `ArtifactSwitcher` takes
   * them — already filtered to the round's current phase, already carrying
   * whichever `content` owns the commit gesture (`RoundChoices`/
   * `CommitmentControl`). Unchanged across the commitment boundary: the
   * artifact that reveals a verdict (e.g. `RoundChoices`) does so by
   * re-rendering its own already-mounted instance, not by this component
   * swapping the array out from under it.
   */
  artifacts: ReadonlyArray<SwitchableArtifact>
  /**
   * What the second, simultaneous switcher is permitted to show once a
   * commitment lands (Rem. 9.2's own exception) — typically the diff set
   * (`D`) beside `artifacts`' own now-revealed verdict, "the diff and the
   * proposition side by side." Absent or empty: the post-commitment render
   * still shows exactly one switcher, since Rem. 9.2 calls simultaneity a
   * permission, never a requirement.
   */
  revealArtifacts?: ReadonlyArray<SwitchableArtifact>
  /**
   * Whether — and what — the learner has committed to, for *this* round.
   * Controlled rather than observed: this component has no more ability to
   * discover a commitment on its own than `ArtifactSwitcher` does to read
   * one (both treat artifact `content` as opaque), so whichever caller owns
   * real round-cycle state is the one that watches `RoundChoices`'/
   * `CommitmentControl`'s own `onCommit` and hands the result down here.
   * `null` before a commitment; the two-switcher layout only ever appears
   * once this is non-null.
   */
  commitment: Commitment | null
  /**
   * Fed to the production probe once a learner deliberately opens it. A
   * fixed prop rather than something this component derives, the same
   * "caller resolves, this component only draws" split `Leetype` itself
   * draws around `TypingSession`.
   */
  probeExercise: Exercise
  className?: string
}

/**
 * C4 (#1216), Rem. 9.2 / Prop. 9.2: the wide surface, reproducing C1's own
 * sequencing rather than inheriting correctness from having more room.
 *
 * # Extra room buys size, not simultaneity — by construction, not by CSS
 *
 * `Leetype` picks a surface by component branch, not by media query (see
 * its own doc comment on why) — the same posture this component takes on
 * *its* one degree of freedom: whether a second `ArtifactSwitcher` renders
 * is decided entirely by `commitment`, never by viewport width. There is no
 * responsive class anywhere in this file that would let two artifacts
 * appear side by side before a commitment lands just because a preview
 * happens to be wide — the single-switcher default holds unconditionally,
 * the same way `Leetype`'s narrow branch unconditionally never mounts the
 * engine. This is also why the switcher used here is `ArtifactSwitcher`
 * itself, completely unmodified: "one component, two sizes, not two
 * components" (#1216's own acceptance criterion) means this file adds
 * layout and gating around C1's switcher, never a fork of it.
 *
 * # Why the primary switcher survives the commitment transition
 *
 * The first `ArtifactSwitcher` below is always the first child of the grid,
 * whether or not a second one joins it — so React reconciles it as the same
 * instance across a commitment landing rather than remounting it, and
 * whatever position the learner had navigated to (and any local state an
 * artifact's own `content` holds, e.g. `SourcePanel`'s toggle) survives the
 * transition instead of resetting the instant a second pane appears.
 *
 * # The production probe is a deliberate, separate gate
 *
 * `TypingSession` (the "optional production probe," C2/#1214) is not
 * rendered until a learner presses "Open production probe" — mounting it
 * for the first time is what triggers the real engine load (`useTypingGame`'s
 * own mount effect calls the existing lazy `loadWasm` singleton; nothing new
 * to build there), so the engine loads on open and never merely from this
 * component mounting wide with nothing opened yet, the same "mount ≠ open"
 * distinction `Leetype`'s own test suite already pins for its wide branch.
 * No `onSessionComplete` is wired anywhere from here: whatever the probe
 * produces is discarded, and closing it (or a round advancing, below)
 * unmounts `TypingSession`, which already frees the engine on unmount.
 *
 * # Closing the probe on round advance
 *
 * Same "adjust state during render" idiom `ArtifactSwitcher` itself uses
 * for its own round-reset: an open probe from a spent round has nothing to
 * do with the next one, so it closes (and its engine is freed, per above)
 * the instant `roundId` changes, rather than carrying an open production
 * probe silently across a round boundary.
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
        <ArtifactSwitcher artifacts={artifacts} roundId={roundId} />
        {reveal && (
          <ArtifactSwitcher
            artifacts={reveal}
            roundId={`${roundId}:reveal`}
            ariaLabel="Revealed artifact"
          />
        )}
      </div>

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
    </div>
  )
}
