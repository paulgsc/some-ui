import { useEffect, useMemo } from "react"
import { StudyScene } from "makjang"
import type { GrindStats } from "portfolio-chart"
import { GrindPieChart } from "portfolio-chart"
import { cubeEvents, DiceCard } from "some-ui-slideshow"
import { useNowPlayingWebSocket } from "some-ui-utils"
import { NowPlayingCard } from "umag"

const TopRightContentClient = (): React.JSX.Element => {
  const sampleJobApplications: Array<GrindStats> = useMemo(
    () => [
      { name: "Hopium", value: 42, color: "#3B82F6" },
      { name: "Crickets", value: 15, color: "#10B981" },
      { name: "Never began", value: 3, color: "#F59E0B" },
      { name: "Society Wins Again", value: 24, color: "#EF4444" },
    ],
    []
  )

  const jobsArgs = useMemo(
    () => ({ stats: sampleJobApplications, title: "job application" }),
    [sampleJobApplications]
  )

  const cubeFaces = useMemo(
    () => [
      <StudyScene key={1} />,
      <GrindPieChart key={2} {...jobsArgs} />,
      <NowPlayingCard key={3} />,
      "",
      "",
      "",
    ],
    [jobsArgs]
  )

  const wsOptions = useMemo(
    () => ({ url: `ws://${window.location.hostname}:3000/ws` }),
    []
  )

  const { status } = useNowPlayingWebSocket(wsOptions)

  useEffect(() => {
    cubeEvents.emit("rotate:to", { id: 13, face: 2 })
  }, [status])

  return (
    <DiceCard
      cubeId={13}
      className="bg-transparent relative size-full"
      dof="Y-axis"
      faces={cubeFaces}
      showBeam={false}
      duration={30_000}
      hideBackface
    />
  )
}

const TopRightContent = (): React.JSX.Element => {
  const isBrowser = typeof window !== "undefined"

  if (!isBrowser) {
    return <div aria-hidden="true" />
  }

  return <TopRightContentClient />
}

export default TopRightContent
