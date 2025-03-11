import { Progress } from "@/components/ui/progress"

import type { DialSection } from "../hooks/useSectionCalculations"

type DialProgressProps = {
  progress: number
  currentSection: DialSection
}

export const DialProgress = ({
  progress,
  currentSection,
}: DialProgressProps) => {
  return (
    <div className="w-full space-y-2">
      <Progress value={progress} className="h-4 bg-white" />
      <div
        className="text-center font-medium"
        style={{ color: currentSection.color }}
      >
        {currentSection.title} - {Math.round(progress)}% Complete
      </div>
    </div>
  )
}
