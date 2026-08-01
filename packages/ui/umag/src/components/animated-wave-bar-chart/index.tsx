import type { JSX } from "react"
import { useState } from "react"
import { WaveBarChart } from "@umag/components/wave-bar-chart"
import { Button, Slider } from "@some-ui/shared"

export const AnimatedWaveBarChart = (): JSX.Element => {
  const [amplitude, setAmplitude] = useState(100)
  const [frequency, setFrequency] = useState(1)
  const [speed, setSpeed] = useState(5)
  const [isPlaying, setIsPlaying] = useState(true)
  return (
    <div className="flex flex-col items-center space-y-4 p-4">
      <h1 className="text-2xl font-bold">Animated Wave Function Bar Chart</h1>
      <WaveBarChart
        width={600}
        height={300}
        bars={50}
        amplitude={amplitude}
        frequency={frequency}
        speed={isPlaying ? speed : 0}
      />
      <div className="w-full max-w-md space-y-4">
        <div className="space-y-2">
          <label htmlFor="amplitude-slider" className="text-sm font-medium">
            Amplitude
          </label>
          <Slider
            id="amplitude-slider"
            min={0}
            max={150}
            step={1}
            value={[amplitude]}
            onValueChange={(value) => setAmplitude(value[0] ?? 0)}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="frequency-slider" className="text-sm font-medium">
            Frequency
          </label>
          <Slider
            id="frequency-slider"
            min={0.1}
            max={5}
            step={0.1}
            value={[frequency]}
            onValueChange={(value) => setFrequency(value[0] ?? 0)}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="speed-slider" className="text-sm font-medium">
            Speed
          </label>
          <Slider
            id="speed-slider"
            min={0}
            max={20}
            step={0.1}
            value={[speed]}
            onValueChange={(value) => setSpeed(value[0] ?? 0)}
          />
        </div>
        <Button onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? "Pause" : "Play"}
        </Button>
      </div>
    </div>
  )
}
