/*
 * This file contains code adapted from the Recharts library (https://github.com/recharts/recharts),
 * which is licensed under the MIT License. The original code has been modified to fit specific use cases.
 *
 */

import { FC } from "react"
import {
  ActiveShape,
  BarProps,
  BarRectangle,
  BarRectangleItem,
  BarRectangleProps,
  DataKey,
  PresentationAttributesAdaptChildEvent,
  adaptEventsOfChild,
  filterProps,
  useMouseClickItemDispatch,
  useMouseEnterItemDispatch,
  useMouseLeaveItemDispatch,
} from "recharts"

type BarSvgProps = Omit<
  PresentationAttributesAdaptChildEvent<BarRectangleItem, SVGPathElement>,
  "radius" | "name"
>
type Props = BarSvgProps & BarProps

type BarBackgroundProps = {
  background?: ActiveShape<BarProps, SVGPathElement>
  data: ReadonlyArray<BarRectangleItem>
  dataKey: DataKey<any>
  onAnimationStart: () => void
  onAnimationEnd: () => void
  allOtherBarProps: Props
}

const BarBackground: FC<BarBackgroundProps> = (props: BarBackgroundProps) => {
  const activeIndex = 0

  const {
    data,
    dataKey,
    background: backgroundFromProps,
    onAnimationStart,
    onAnimationEnd,
    allOtherBarProps,
  } = props

  const {
    onMouseEnter: onMouseEnterFromProps,
    onMouseLeave: onMouseLeaveFromProps,
    onClick: onItemClickFromProps,
    ...restOfAllOtherProps
  } = allOtherBarProps

  const onMouseEnterFromContext = useMouseEnterItemDispatch(
    onMouseEnterFromProps,
    dataKey
  )
  const onMouseLeaveFromContext = useMouseLeaveItemDispatch(
    onMouseLeaveFromProps
  )
  const onClickFromContext = useMouseClickItemDispatch(
    onItemClickFromProps,
    dataKey
  )
  if (!backgroundFromProps) {
    return null
  }

  const backgroundProps = filterProps(backgroundFromProps, false)

  return (
    <>
      {data.map((entry: BarRectangleItem, i: number) => {
        const { value, background: backgroundFromDataEntry, ...rest } = entry

        if (!backgroundFromDataEntry) {
          return null
        }

        // @ts-expect-error BarRectangleItem type definition says it's missing properties, but I can see them present in debugger!
        const onMouseEnter = onMouseEnterFromContext(entry, i)
        // @ts-expect-error BarRectangleItem type definition says it's missing properties, but I can see them present in debugger!
        const onMouseLeave = onMouseLeaveFromContext(entry, i)
        // @ts-expect-error BarRectangleItem type definition says it's missing properties, but I can see them present in debugger!
        const onClick = onClickFromContext(entry, i)

        const barRectangleProps: BarRectangleProps = {
          option: backgroundFromProps,
          isActive: i === activeIndex,
          ...rest,
          // @ts-expect-error BarRectangle props do not accept `fill` property.
          fill: "#eee",
          ...backgroundFromDataEntry,
          ...backgroundProps,
          ...adaptEventsOfChild(restOfAllOtherProps, entry, i),
          onMouseEnter,
          onMouseLeave,
          onClick,
          onAnimationStart,
          onAnimationEnd,
          dataKey,
          index: i,
          className: "recharts-bar-background-rectangle",
        }

        return (
          <BarRectangle key={`background-bar-${i}`} {...barRectangleProps} />
        )
      })}
    </>
  )
}

export default BarBackground
