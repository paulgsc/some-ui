import type { EKGWaveParams } from "@nfl/types/ekg"

export const calculateEKGValue = (t: number, params: EKGWaveParams): number => {
  const beatPeriod = 60 / params.heartRate // in seconds

  const cyclePosition = (t % beatPeriod) / beatPeriod

  const pWaveStart =
    params.prInterval / beatPeriod - params.pWaveDuration / beatPeriod
  const pWaveEnd = params.prInterval / beatPeriod
  const qrsStart = params.prInterval / beatPeriod
  const qPoint = qrsStart + ((0.1 / 3) * params.qrsDuration) / beatPeriod
  const rPoint = qrsStart + ((0.5 / 3) * params.qrsDuration) / beatPeriod
  const sPoint = qrsStart + ((0.8 / 3) * params.qrsDuration) / beatPeriod
  const qrsEnd = qrsStart + params.qrsDuration / beatPeriod
  const stSegmentStart = qrsEnd
  const stSegmentEnd = stSegmentStart + params.stSegmentDuration / beatPeriod
  const tWaveStart = stSegmentEnd // T wave starts after ST
  const tWaveEnd = tWaveStart + params.tWaveDuration / beatPeriod

  let value = params.baseline

  if (cyclePosition >= pWaveStart && cyclePosition <= pWaveEnd) {
    const pPosition = (cyclePosition - pWaveStart) / (pWaveEnd - pWaveStart)
    value += params.pWaveHeight * Math.sin(Math.PI * pPosition)
  }

  if (cyclePosition >= qrsStart && cyclePosition <= qrsEnd) {
    if (cyclePosition <= qPoint) {
      const qPosition = (cyclePosition - qrsStart) / (qPoint - qrsStart)
      value += params.qHeight * qPosition
    } else if (cyclePosition <= rPoint) {
      const rPosition = (cyclePosition - qPoint) / (rPoint - qPoint)
      value += params.qHeight + (params.rHeight - params.qHeight) * rPosition
    } else if (cyclePosition <= sPoint) {
      const sPosition = (cyclePosition - rPoint) / (sPoint - rPoint)
      value += params.rHeight + (params.sHeight - params.rHeight) * sPosition
    } else {
      const endPosition = (cyclePosition - sPoint) / (qrsEnd - sPoint)
      value += params.sHeight * (1 - endPosition)
    }
  }

  if (cyclePosition > stSegmentStart && cyclePosition <= stSegmentEnd) {
    value += params.baseline
  }

  if (cyclePosition > tWaveStart && cyclePosition <= tWaveEnd) {
    const tPosition = (cyclePosition - tWaveStart) / (tWaveEnd - tWaveStart)
    value += params.tWaveHeight * Math.sin(Math.PI * tPosition)
  }

  return value
}
