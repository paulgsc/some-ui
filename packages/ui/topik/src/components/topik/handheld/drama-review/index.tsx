/**
 * The drama review, at an ending after 작가의 말 (docs/makjang/README.md,
 * "The last session, and its review"): offered collapsed, opened with a tap,
 * never in the way of the dock. Each tap is saved at once, so there is no
 * submit and nothing to finish. It asks about engagement and where the drama
 * should go, never what happened, so a learner who did not follow the plot
 * can answer all of it.
 *
 * In the session theme: it names each scene's feeling, but wears none (MK6).
 * Questions are Hangul, with their English one tap away; answers show their
 * English small beneath, since they are not items.
 */

import type { JSX } from "react"
import { useState } from "react"
import { cn } from "@some-ui/core-utils"
import { isFeelingKey } from "@some-ui/styles/theme"
import { FEELING_WORDS } from "@topik/lib/topik/core/feeling"
import type {
  Enjoyed,
  KoreanNext,
  LastDrama,
  DramaReview as Review,
} from "@topik/lib/topik/core/last-drama"
import { NEXT_MAX } from "@topik/lib/topik/core/last-drama"
import { ChevronDown } from "lucide-react"

const ENJOYED_WORDS: ReadonlyArray<[Enjoyed, string, string]> = [
  ["loved", "재미있었어요", "Loved it"],
  ["fine", "그저 그랬어요", "It was OK"],
  ["not-for-me", "별로였어요", "Not for me"],
]

const KOREAN_WORDS: ReadonlyArray<[KoreanNext, string, string]> = [
  ["easier", "더 쉬웠으면", "Easier"],
  ["right", "딱 좋아요", "About right"],
  ["stretch", "더 어려워도 돼요", "Stretch me"],
]

type Answer<Key extends string> = {
  key: Key
  ko: string
  /** Beneath it, small: its English, or a scene's feeling in Korean. */
  small: string
  smallLang: "en" | "ko"
  picked: boolean
}

const Question = <Key extends string>({
  ko,
  en,
  english,
  answers,
  onPick,
}: {
  ko: string
  en: string
  english: boolean
  answers: Array<Answer<Key>>
  onPick: (key: Key) => void
}): JSX.Element => (
  <fieldset className="flex flex-col gap-2">
    <legend lang="ko" className="mb-2 text-sm font-semibold break-keep">
      {ko}
      {english && (
        <span lang="en" className="text-muted-foreground block font-normal">
          {en}
        </span>
      )}
    </legend>
    <div className="flex flex-wrap gap-2">
      {answers.map((answer) => (
        <button
          key={answer.key}
          type="button"
          aria-pressed={answer.picked}
          onClick={() => onPick(answer.key)}
          className={cn(
            "border-border flex min-h-12 flex-col items-start justify-center rounded-2xl border px-3 py-2 text-left",
            answer.picked && "bg-primary text-primary-foreground border-primary"
          )}
        >
          <span lang="ko" className="break-keep">
            {answer.ko}
          </span>
          <span lang={answer.smallLang} className="text-xs opacity-75">
            {answer.small}
          </span>
        </button>
      ))}
    </div>
  </fieldset>
)

export const DramaReview = ({
  record,
  onReview,
}: {
  /** This drama's record: it holds the review, and the scenes reached. */
  record: LastDrama
  onReview: (change: Review) => void
}): JSX.Element => {
  const [open, setOpen] = useState(false)
  const [english, setEnglish] = useState(false)
  const review = record.review ?? {}
  const more = review.more ?? []
  return (
    <section
      data-slot="topik-drama-review"
      className="bg-card text-card-foreground border-border flex flex-col gap-4 rounded-2xl border p-4"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold">
          <span lang="ko">어땠어요?</span>{" "}
          <span lang="en" className="text-muted-foreground font-normal">
            How was it?
          </span>
        </span>
        <ChevronDown
          className={cn("size-5 shrink-0", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <>
          <Question
            ko="재미있었어요?"
            en="Did you enjoy it?"
            english={english}
            answers={ENJOYED_WORDS.map(([key, ko, en]) => ({
              key,
              ko,
              small: en,
              smallLang: "en",
              picked: review.enjoyed === key,
            }))}
            onPick={(key) =>
              onReview({ enjoyed: review.enjoyed === key ? undefined : key })
            }
          />
          <Question
            ko="다음엔 한국어가…"
            en="Next time, the Korean could be…"
            english={english}
            answers={KOREAN_WORDS.map(([key, ko, en]) => ({
              key,
              ko,
              small: en,
              smallLang: "en",
              picked: review.korean === key,
            }))}
            onPick={(key) =>
              onReview({ korean: review.korean === key ? undefined : key })
            }
          />
          <Question
            ko="더 보고 싶은 장면"
            en="More of this scene"
            english={english}
            answers={record.scenes.map(({ id, place, feeling }) => ({
              key: id,
              ko: place,
              small: isFeelingKey(feeling) ? FEELING_WORDS[feeling].name : "",
              smallLang: "ko",
              picked: more.includes(id),
            }))}
            onPick={(id) =>
              onReview({
                more: more.includes(id)
                  ? more.filter((kept) => kept !== id)
                  : [...more, id],
              })
            }
          />
          <label className="flex flex-col gap-2">
            <span lang="ko" className="text-sm font-semibold break-keep">
              다음엔 어떤 드라마?
              {english && (
                <span
                  lang="en"
                  className="text-muted-foreground block font-normal"
                >
                  What next? A genre, a trope, a character
                </span>
              )}
            </span>
            <input
              type="text"
              maxLength={NEXT_MAX}
              value={review.next ?? ""}
              onChange={(event) => onReview({ next: event.target.value })}
              className="border-border bg-background min-h-12 rounded-2xl border px-3 text-base"
            />
          </label>
          <button
            type="button"
            aria-pressed={english}
            onClick={() => setEnglish(!english)}
            className="text-muted-foreground min-h-11 self-start text-sm underline"
          >
            {english ? "Hide English" : "Show English"}
          </button>
        </>
      )}
    </section>
  )
}
