import type { AlignmentType } from './Alignment'
import type { AxisType } from './Axis'
import type { NodeRectType } from './NodeRects'
import type { SlidesToScrollType } from './SlidesToScroll'
import { arrayLast, mathAbs } from './utils'

export type ScrollSnapsType = {
  snaps: number[]
  snapsAligned: number[]
}

export function ScrollSnaps(
  axis: AxisType,
  alignment: AlignmentType,
  containerRect: NodeRectType,
  slideRects: NodeRectType[],
  slidesToScroll: SlidesToScrollType
): ScrollSnapsType {
  const { startEdge, endEdge } = axis
  const { groupSlides } = slidesToScroll
  const alignments = measureSizes().map(alignment.measure)
  const snaps = measureUnaligned()
  const snapsAligned = measureAligned()

  function measureSizes(): number[] {
    return groupSlides(slideRects)
      .map(
        (rects) =>
          arrayLast(rects)[endEdge] - (rects[0] ? rects[0][startEdge] : 0)
      )
      .map(mathAbs)
  }

  function measureUnaligned(): number[] {
    return slideRects
      .map((rect) => containerRect[startEdge] - rect[startEdge])
      .map((snap) => -mathAbs(snap))
  }

  function measureAligned(): number[] {
    return groupSlides(snaps)
      .map((g) => g[0])
      .map((snap, index) => (snap ?? 0) + (alignments[index] ?? 0))
  }

  const self: ScrollSnapsType = {
    snaps,
    snapsAligned
  }
  return self
}
