import type { FC } from "react"
import { Button, Slider } from "@some-ui/shared"
import {
  useAudioContext,
  useAudioElement,
  useAudioPlayback,
  useVolumeControl,
  useWaveformVisualization,
} from "@umag/hooks"

type WaveBarChartProps = {
  width: number
  height: number
  bars: number
}

export const WaveBarChart: FC<WaveBarChartProps> = ({
  width,
  height,
  bars,
}) => {
  const { audioContext, analyser, gainNode } = useAudioContext()
  const { audioElement, fileName, handleFileUpload } = useAudioElement()
  const { isPlaying, togglePlay } = useAudioPlayback(audioElement, audioContext)
  const { volume, setVolume } = useVolumeControl(gainNode)
  const waveformData = useWaveformVisualization(analyser, bars, height, width)

  const barWidth = width / bars
  const midHeight = height / 2

  return (
    <div className="flex flex-col items-center space-y-4">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line
          x1="0"
          y1={midHeight}
          x2={width}
          y2={midHeight}
          stroke="black"
          strokeWidth="1"
        />
        <line x1="0" y1="0" x2="0" y2={height} stroke="black" strokeWidth="1" />
        {waveformData.map((point, index) => (
          <rect
            key={index}
            x={point.x}
            y={point.y < midHeight ? point.y : midHeight}
            width={barWidth - 1}
            height={Math.abs(point.y - midHeight)}
            fill="hsl(var(--primary))"
          />
        ))}
      </svg>
      <div className="w-full max-w-md space-y-4">
        <div className="flex flex-col items-center gap-2">
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => handleFileUpload(e, audioContext, gainNode)}
            className="w-full max-w-xs"
          />
          {fileName && (
            <p className="text-sm text-gray-600">Current file: {fileName}</p>
          )}
        </div>
        <div className="space-y-2">
          <label htmlFor="amplitude-slider" className="text-sm font-medium">
            Volume
          </label>
          <Slider
            id="amplitude-slider"
            min={0}
            max={1}
            step={0.01}
            value={[volume]}
            onValueChange={(value) => setVolume(value[0] ?? 0)}
          />
        </div>
        <Button onClick={togglePlay} disabled={!fileName}>
          {isPlaying ? "Pause" : "Play"}
        </Button>
      </div>
    </div>
  )
}
