import { useEffect } from "react"
import { StudyScene } from "makjang"
import { GrindPieChart } from "portfolio-chart"
import { cubeEvents, DiceCard } from "some-ui-slideshow"
import { useNowPlayingWebSocket } from "some-ui-utils"
import { NowPlayingCard } from "umag"

const TopRightContent = (): React.JSX.Element => {
  // Sample data
  const sampleJobApplications = [
    { name: "Hopium", value: 42, color: "#3B82F6" },
    { name: "Crickets", value: 15, color: "#10B981" },
    { name: "Never began", value: 3, color: "#F59E0B" },
    { name: "Society Wins Again", value: 24, color: "#EF4444" },
  ]

  const sampleLeetcodeStats = [
    { name: "Easy", value: 65, color: "#10B981" },
    { name: "Medium", value: 47, color: "#F59E0B" },
    { name: "Hard", value: 23, color: "#EF4444" },
  ]

  const jobsArgs = {
    stats: sampleJobApplications,
    title: "job application",
  }

  const leetcodeArgs = {
    stats: sampleLeetcodeStats,
    title: "leetcode grind",
  }

  const cubeFaces = [
    <StudyScene key={1} />,
    <GrindPieChart key={2} {...jobsArgs} />,
    <NowPlayingCard key={3} />,
    "",
    "",
    "",
  ]

  const { status } = useNowPlayingWebSocket()

  useEffect(() => {
    cubeEvents.emit("rotate:to", { id: 13, face: 2 })
  }, [status])

  return (
    <DiceCard
      cubeId={13}
      className="bg-transparent relative size-full"
      dof={"Y-axis"}
      faces={cubeFaces}
      showBeam={false}
      duration={30_000}
    />
  )
}

export default TopRightContent
