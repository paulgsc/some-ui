/**
 * Previews to approve (HOST16, #3558; the owner's guard on #3521): the
 * agent's two or three variants of one bundle of choices, each an option of
 * the shared `DecisionPick` (C693). Above each option's button, outside it,
 * its clip plays muted and looping with "what's in it" (the clip's own
 * callouts), so watching never picks; only its "Use this" button does. One
 * is recommended, and something else, said in the owner's words, asks the
 * agent for new previews. No toggle and no lever.
 *
 * `Previews` reads a `PreviewsRuntime` (R1: it owns every wait) and says
 * what each pick came to, and why nothing is shown; `PreviewPick` draws one
 * preview and hands its picks back. Phone build only.
 */
import type { JSX } from "react"
import { useState, useSyncExternalStore } from "react"
import { assertNever } from "@some-ui/core-utils"
import { Button, DecisionPick, Notice, Textarea } from "@some-ui/shared"
import type { DecisionPicked } from "@some-ui/shared"
import type { PreviewPick as Pick, PreviewVariant } from "@some-ui/video-render"
import { CONVERSATION_POLICY } from "@some-ui/video-render"

import { PICK_WORDS as W } from "@/lib/preview-pick"
import type {
  OfferedPreview,
  PickOutcome,
  PreviewsRuntime,
} from "@/lib/preview-pick"
import { Part } from "@/components/studio/layout"

/** One variant's card: its title, its clip muted and looping, and what's in it. */
const VariantCard = ({
  variant,
  src,
}: {
  variant: PreviewVariant
  src: string | undefined
}): JSX.Element => (
  <div className="flex flex-col gap-2">
    <span className="font-semibold">{variant.title}</span>
    {src === undefined ? (
      <span className="bg-muted text-muted-foreground flex aspect-video w-full items-center justify-center rounded-lg px-3 text-center text-xs">
        {W.noClip}
      </span>
    ) : (
      <video
        src={src}
        muted
        loop
        autoPlay
        playsInline
        className="aspect-video w-full rounded-lg object-cover"
      />
    )}
    <span className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
      {W.inIt}
    </span>
    <ul className="flex flex-col gap-0.5 text-xs">
      {variant.callouts.map((c) => (
        <li key={c}>{c}</li>
      ))}
    </ul>
  </div>
)

/** The option id a variant is listed under: A, B, C. */
const idOf = (i: number): string => String.fromCharCode(65 + i)

type PreviewPickProps = {
  readonly offered: OfferedPreview
  readonly onPick: (pick: Pick) => void
  /** Held, while a pick is on its way. */
  readonly disabled: boolean
}

/** One preview's cards, the one standing shown so; each pick handed back. */
const PreviewPick = ({
  offered,
  onPick,
  disabled,
}: PreviewPickProps): JSX.Element => {
  const [asking, setAsking] = useState(false)
  const [words, setWords] = useState("")
  const { standing } = offered
  const picked: DecisionPicked | null = asking
    ? { kind: "own" }
    : standing === null
      ? null
      : standing.kind === "variant"
        ? {
            kind: "option",
            option: idOf(
              offered.variants.findIndex((v) => v.variant === standing.variant)
            ),
          }
        : { kind: "own" }
  return (
    <div className="flex flex-col gap-3">
      <DecisionPick
        options={offered.variants.map((variant, i) => ({
          id: idOf(i),
          decision: W.use,
          shows: (
            <VariantCard
              variant={variant}
              src={offered.clips[variant.variant]}
            />
          ),
          recommended: variant.variant === offered.recommended,
        }))}
        picked={picked}
        disabled={disabled}
        onPick={(pick) => {
          if (pick.kind === "own") {
            setAsking(true)
            return
          }
          const variant = offered.variants.at(pick.option.charCodeAt(0) - 65)
          if (variant === undefined) return
          setAsking(false)
          onPick({ kind: "variant", variant: variant.variant })
        }}
        words={{
          label: W.label(offered.about),
          recommended: W.recommended,
          own: W.own,
          none: W.none,
        }}
      />
      {asking && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setAsking(false)
            onPick({ kind: "else", said: words })
          }}
        >
          <label className="text-sm font-semibold" htmlFor="preview-else">
            {W.ownPrompt}
          </label>
          <Textarea
            id="preview-else"
            value={words}
            maxLength={CONVERSATION_POLICY.noteMost}
            onChange={(e) => {
              setWords(e.target.value)
            }}
          />
          <Button type="submit" disabled={disabled || words.trim() === ""}>
            {W.ownSend}
          </Button>
        </form>
      )}
    </div>
  )
}

/** What a pick came to, in the person's terms, where it was kept. */
function pickedWords(outcome: PickOutcome, where: "home" | "sample"): string {
  switch (outcome) {
    case "kept": {
      return W.picked[where]
    }
    case "already": {
      return W.already
    }
    case "refused": {
      return W.refused
    }
    case "unpaired":
    case "away":
    case "busy": {
      return W[outcome]
    }
    default: {
      return assertNever(outcome)
    }
  }
}

/** Every preview `previews` shows, each pick's outcome, and why nothing is shown. */
export const Previews = ({
  previews,
}: {
  previews: PreviewsRuntime
}): JSX.Element => {
  const state = useSyncExternalStore(
    previews.state.subscribe,
    previews.state.getSnapshot
  )
  if (state.phase === "reading")
    return <p className="text-muted-foreground text-sm">{W.reading}</p>
  if (state.phase === "nothing")
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{W.nothing[state.why]}</p>
        <Button variant="outline" onClick={previews.open}>
          {W.again}
        </Button>
      </div>
    )
  const { said } = state
  return (
    <div className="flex flex-col gap-4">
      {previews.where === "sample" && (
        <p className="text-muted-foreground text-sm font-semibold">
          {W.sample}
        </p>
      )}
      {state.conversations.length === 0 && <p className="text-sm">{W.empty}</p>}
      {state.conversations.map((c) => (
        <Part key={c.id} label={c.topic}>
          {c.previews.map((offered) => (
            <PreviewPick
              key={offered.preview}
              offered={offered}
              disabled={state.keeping !== null}
              onPick={(pick) => {
                previews.pick(c.id, offered.preview, pick)
              }}
            />
          ))}
          {c.unshown > 0 && (
            <p className="text-muted-foreground text-xs">
              {W.unshown(c.unshown)}
            </p>
          )}
        </Part>
      ))}
      {said !== null && (
        <Notice
          key={said.n}
          {...(said.outcome === "kept" || said.outcome === "already"
            ? {}
            : { tone: "danger" as const })}
        >
          {pickedWords(said.outcome, previews.where)}
        </Notice>
      )}
    </div>
  )
}
