import type { JSX } from "react"
import {
  answerShown,
  ASK_WORDS_MOST,
  kokoroSpeaker,
  parseHeardSpokenCard,
  sampleSpokenCard,
  SPOKEN_CATEGORY_TITLES,
  spokenSceneAt,
  turnSaid,
  wordCount,
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
  `${W.question(scene.exchange)} · ${W.turn[scene.role][scene.voice]}`

/**
 * A turn's words, written out beside the bubbles while they fit, else left
 * to the captions: a question as a title while it is a question's length
 * (`ASK_WORDS_MOST`, as Kokoro's are held to), else as body text.
 */
const Said = ({ said, big }: { said: string; big: boolean }): JSX.Element =>
  !answerShown(said) ? (
    <p className="text-muted-foreground text-[0.8em]">{W.saidBelow}</p>
  ) : big && wordCount(said) <= ASK_WORDS_MOST ? (
    <Title>{said}</Title>
  ) : (
    <p className="text-[1em] leading-snug">{said}</p>
  )

const Screen = ({
  card,
  scene,
}: {
  card: HeardSpokenCard
  scene: SpokenScene
}): JSX.Element => {
  const tag = SPOKEN_CATEGORY_TITLES[card.category]
  const exchange = card.exchanges.at(scene.exchange - 1)
  const asked = exchange === undefined ? "" : turnSaid(exchange.ask)
  return (
    <Call
      speaker={scene.speaker}
      tag={tag}
      other={exchange === undefined ? "asker" : kokoroSpeaker(exchange)}
    >
      {/* The question over its answer, while it fits beside the answer. */}
      {scene.role === "answer" && wordCount(asked) <= ASK_WORDS_MOST && (
        <p className="text-muted-foreground text-[0.8em]">{asked}</p>
      )}
      <p
        className={
          scene.role === "ask"
            ? "text-muted-foreground text-[0.8em]"
            : "text-[0.8em] font-semibold"
        }
      >
        {W.turn[scene.role][scene.voice]}
      </p>
      <Said said={scene.said} big={scene.role === "ask"} />
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
      theme={state.essay.theme}
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
