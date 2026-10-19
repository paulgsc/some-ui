import type { FC } from "react"

/** What a good spoken answer hits (Def. 9.5), shown only after one. */
export const RubricPoints: FC<{ rubric: ReadonlyArray<string> }> = ({
  rubric,
}) => (
  <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
    {rubric.map((point, index) => (
      <li key={`${String(index)} ${point}`} className="text-pretty">
        {point}
      </li>
    ))}
  </ul>
)
