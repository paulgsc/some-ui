import type { JSX } from "react"
import {
  answerShown,
  parseHeardSpokenCard,
  sampleSpokenCard,
  SPOKEN_CATEGORY_TITLES,
  spokenSceneAt,
} from "@some-ui/video-render"
import type { HeardSpokenCard, SpokenScene } from "@some-ui/video-render"

import { Call } from "./essay-parts"
import { namedStageOf } from "./essay-view"
import { ESSAY_WORDS as W } from "./essay-words"
import { spokenCardSource } from "./feed"
import { StageFrame, StageRefused, Title } from "./frame"

/**
 * A spoken card's stage (WALK7, #3282): one scene of a cards essay's spoken
 * card at a time, in template A (`./essay-parts`' `Call`), as the Rust
 * essay's opening draws its conversation. The question is the asker's, lit
 * where the tutor stands; the answer is the owner's take, lit. The take's
 * words are the captions under it, drawn by the renderer.
 *
 * It plays the card `card` names, as `record:cards` hands it over
 * (`./feed`'s `spokenCardSource`), or with none, or `sample`, the sample,
 * its takes made up.
 */

export type SpokenCardStageProps = {
  /** The card shown, by its id in the cut list, or "sample". */
  card?: string
  /** The scene shown, `ask-<n>` or `take-<n>`; the first when absent or unknown. */
  scene?: string
  record?: boolean
  onScene?: (scene: string) => void
}

const SAMPLE = sampleSpokenCard()

/** What a scene is called: its question's place, and whose turn it is. */
const labelOf = (scene: SpokenScene): string =>
  scene.take === undefined
    ? W.question(scene.exchange)
    : `${W.question(scene.exchange)} · ${W.yourAnswer}`

const Screen = ({
  card,
  scene,
}: {
  card: HeardSpokenCard
  scene: SpokenScene
}): JSX.Element => {
  const tag = SPOKEN_CATEGORY_TITLES[card.category]
  const ask = card.exchanges[scene.exchange - 1]?.ask ?? ""
  return scene.take === undefined ? (
    <Call speaker="asker" tag={tag} other="asker">
      <p className="text-muted-foreground text-[0.8em]">{W.theyAsk}</p>
      <Title>{ask}</Title>
    </Call>
  ) : (
    <Call speaker="you" tag={tag} other="asker">
      <p className="text-muted-foreground text-[0.8em]">{ask}</p>
      <p className="text-[0.8em] font-semibold">{W.yourAnswer}</p>
      {answerShown(scene.said) ? (
        <p className="text-[1em] leading-snug">{scene.said}</p>
      ) : (
        <p className="text-muted-foreground text-[0.8em]">{W.saidBelow}</p>
      )}
    </Call>
  )
}

export const SpokenCardStagePage = ({
  card,
  scene,
  record = false,
  onScene,
}: SpokenCardStageProps): JSX.Element | null => {
  const named = card !== undefined && card !== "sample"
  const read = spokenCardSource.useResource(
    ["spoken-card", card],
    card ?? "",
    undefined,
    { enabled: named, retry: false }
  )
  const state = namedStageOf({
    week: card,
    read: { data: read.data, pending: read.isPending, failed: read.isError },
    sample: SAMPLE,
    parse: parseHeardSpokenCard,
    idOf: (heard) => heard.card,
    words: { unread: W.cardUnread, other: W.otherCard },
  })
  if (state.kind === "waiting") return null
  if (state.kind === "none")
    return (
      <StageRefused
        reason={state.problems.join("\n")}
        problems={state.problems}
      />
    )
  const at = spokenSceneAt(state.essay, scene)
  const where = `${labelOf(at.scene)} · ${at.index + 1}/${at.scenes.length}`
  return (
    <StageFrame
      record={record}
      scene={at.scene.id}
      measureKey={`spoken/${state.essay.card}/${at.scene.id}`}
      theme={undefined}
      title={W.spokenCard}
      where={state.voicing === "sample" ? `${where} · ${W.sampleCard}` : where}
      captioned={record}
      said={at.scene.said}
      nav={
        onScene === undefined
          ? undefined
          : {
              scenes: at.scenes.map((s) => ({ id: s.id, label: labelOf(s) })),
              onScene,
            }
      }
    >
      <Screen card={state.essay} scene={at.scene} />
    </StageFrame>
  )
}
