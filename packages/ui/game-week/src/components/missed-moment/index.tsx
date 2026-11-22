/**
 * A game's big moment no bite was said about, dimmed among the game's bites
 * on Takes (GWB14 D15, #3039): "No bite", its quarter and clock and
 * scenario, and the play as home words it. It plays nothing and moves
 * nothing; a bite said about its play takes its place.
 */
import type { JSX } from "react"
import { ScenarioIcon } from "@game-week/components/game-week/scenario-icon"
import type { GameMoment } from "@game-week/lib/moments"
import { MISSED_WORDS, missedHead } from "@game-week/lib/words"

export const MissedMoment = ({
  moment,
}: {
  moment: GameMoment
}): JSX.Element => (
  <div className="border-border/50 text-muted-foreground flex items-start gap-3 rounded-2xl border border-dashed p-3 opacity-70">
    <ScenarioIcon id={moment.scenario} className="mt-0.5" />
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs font-bold tracking-wide uppercase">
        {MISSED_WORDS.noBite}
      </span>
      <span className="text-sm font-semibold">{missedHead(moment)}</span>
      <span className="text-xs">{moment.context}</span>
    </span>
  </div>
)
