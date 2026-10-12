/**
 * Who is who in the drama playing, one tap from its header: each
 * character's figure, name and standing, with the point of view marked, so
 * who is whose is never learned only on a branch the learner may not take.
 * The figures are the ones beside the lines, still, since nobody is
 * speaking here (Rem. 9.3).
 */

import type { JSX } from "react"
import { useMemo } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"
import { CastFigure } from "@topik/components/topik/handheld/cast-figure"
import { figuresOf } from "@topik/lib/topik/core/cast"
import type { DramaLesson } from "@topik/lib/topik/core/drama"

export const CastSheet = ({
  lesson,
  open,
  onOpenChange,
}: {
  lesson: DramaLesson
  open: boolean
  onOpenChange: (open: boolean) => void
}): JSX.Element => {
  const figures = useMemo(() => figuresOf(lesson.cast), [lesson.cast])
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-slot="topik-cast-sheet"
        data-scroll-intent="long-form"
        className={
          // scroll-intent: long-form — a cast is as long as its tree made
          // it, and a phone held sideways shows only a few characters.
          "max-h-[85dvh] overflow-y-auto rounded-t-3xl"
        }
      >
        <SheetHeader className="text-left">
          <SheetTitle lang="ko">등장인물</SheetTitle>
          <SheetDescription>Who is who in this drama</SheetDescription>
        </SheetHeader>
        <ul className="mt-4 flex flex-col gap-2">
          {lesson.cast.map((character) => (
            <li
              key={character.id}
              className="bg-card border-border flex items-start gap-3 rounded-2xl border p-3"
            >
              <CastFigure
                figure={figures.get(character.id) ?? "heart"}
                speaking={false}
                className="size-12 shrink-0"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-baseline gap-2">
                  <span lang="ko" className="font-semibold">
                    {character.name}
                  </span>
                  {character.id === lesson.pov && (
                    <span
                      lang="ko"
                      className="text-primary text-xs font-semibold"
                    >
                      내가 따라가는 사람
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground text-sm">
                  {character.standing}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
