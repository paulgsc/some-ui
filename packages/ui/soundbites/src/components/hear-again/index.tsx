/**
 * Ask home to try again (#3339), on a take wherever it shows: the ask where
 * home says it will hear the take again, under it whether home is hearing it
 * or when it can be asked again, and what came of the last ask, over the
 * screen. Renders `lib/hear-again`'s slice of the screen's state and forwards
 * the tap; its words are `lib/hear-again/words.ts`'.
 */
import type { JSX } from "react"
import { Button, Notice } from "@some-ui/shared"
import type {
  HearAgain,
  HearAgainSlice,
} from "@soundbites/lib/hear-again/model"
import { askable, hearAgainOf } from "@soundbites/lib/hear-again/model"
import { HEAR_AGAIN_WORDS } from "@soundbites/lib/hear-again/words"

const WORDS = HEAR_AGAIN_WORDS

type Take = { readonly id: string; readonly hearAgain?: HearAgain | null }

/** The ask itself, among a take's acts; nothing where home won't hear it again. */
export const HearAgainButton = ({
  take,
  state,
  busy = false,
  onAsk,
}: {
  take: Take
  state: HearAgainSlice
  /** Another act on the screen is under way. */
  busy?: boolean
  onAsk: () => void
}): JSX.Element | null => {
  const hearAgain = hearAgainOf(state, take)
  if (hearAgain === null) return null
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="self-start"
      disabled={busy || state.hearAgain.asking !== null || !askable(hearAgain)}
      onClick={onAsk}
    >
      {WORDS.ask}
    </Button>
  )
}

/** Under a take: whether home is hearing it again, or when it can be asked again; and what came of the last ask. */
export const HearAgainLines = ({
  take,
  state,
  onDismiss,
}: {
  take: Take
  state: HearAgainSlice
  onDismiss: () => void
}): JSX.Element | null => {
  const hearAgain = hearAgainOf(state, take)
  const { asking, said } = state.hearAgain
  const mine = said?.id === take.id ? said : null
  if (hearAgain === null && asking !== take.id && mine === null) return null
  return (
    <>
      {hearAgain?.hearing === true && (
        <p className="text-muted-foreground text-xs">{WORDS.hearing}</p>
      )}
      {hearAgain !== null &&
        !hearAgain.hearing &&
        hearAgain.askAgainAt !== null && (
          <p className="text-muted-foreground text-xs">
            {WORDS.askAgainAt(hearAgain.askAgainAt)}
          </p>
        )}
      {asking === take.id && <Notice>{WORDS.asking}</Notice>}
      {mine !== null && (
        <Notice
          tone={
            mine.kind === "asked" ||
            mine.kind === "settled" ||
            mine.kind === "waiting"
              ? undefined
              : "danger"
          }
          onDismiss={onDismiss}
        >
          {WORDS.said[mine.kind]}
        </Notice>
      )}
    </>
  )
}
