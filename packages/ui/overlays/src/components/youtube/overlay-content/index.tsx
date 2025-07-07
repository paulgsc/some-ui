import type { ReactNode } from "react"
import { Fragment } from "react"
import { accordionData } from "@overlays/data/gemini-stepper"
import { ScrollingCredits, useGetCredits } from "attributions"
import { StudyScene } from "makjang"
import { GrindPieChart } from "portfolio-chart"
import { CLUES, Clues, CrosswordGridSvg } from "some-ui-input"
import { BrickChartCarousel } from "some-ui-nfl"
import { DiceCard } from "some-ui-slideshow"
import { GeminiStepper } from "some-ui-stepper"
import { getRandomSubarray } from "some-ui-utils"
import { NowPlayingCard } from "umag"

const EndingCredits = (): React.JSX.Element => {
  const params = {
    range: "Sheet1!A1:G6",
  }
  const { data, isLoading } = useGetCredits({ ...params })
  if (isLoading) return <div>Loading...</div>
  const transform = data?.map(({ source_type, thanks, ...rest }) => ({
    sourceType: source_type,
    thankYouMessage: thanks,
    ...rest,
  }))
  return <ScrollingCredits credits={transform ?? []} />
}

const CrosswordPuzzle = (): React.JSX.Element => {
  const wordList = [
    "JAVASCRIPT",
    "TYPESCRIPT",
    "REACT",
    "ANGULAR",
    "VUE",
    "NODE",
    "EXPRESS",
    "MONGODB",
    "HTML",
    "CSS",
    "REDUX",
    "WEBPACK",
    "BABEL",
    "PROGRAMMING",
    "ALGORITHM",
    "CODING",
    "FUNCTION",
    "VARIABLE",
    "OBJECT",
    "ARRAY",
  ]

  return <CrosswordGridSvg words={wordList} />
}

const mainContent: Record<string, Array<ReactNode>> = {
  credits: [<EndingCredits key="credits" />],
  "nfl-tennis": [<BrickChartCarousel key="nfl-tennis" />],
  crossword: [<CrosswordPuzzle key="crossword" />],
}

export function getMainContent(key: string): ReactNode {
  const content = mainContent[key] ?? []
  if (content.length <= 0) return <Fragment />
  return getRandomSubarray(content, 1)[0]
}

type PanelContent = {
  size?: number
  node: ReactNode
}
const topLeftContent: Record<string, Array<PanelContent>> = {
  crossword: [
    {
      size: 50,
      node: (
        <Clues
          direction="across"
          clues={CLUES.across}
          key="cosswords-clues-across"
        />
      ),
    },
  ],
}

export function gettopLeftContent(key: string): PanelContent {
  const content = topLeftContent[key] ?? []
  if (content.length <= 0) return { node: <TopRightContent />, size: 40 }
  return getRandomSubarray(content, 1)[0]
}

const botLeftContent: Record<string, Array<PanelContent>> = {
  crossword: [
    {
      size: 50,
      node: (
        <Clues direction="down" clues={CLUES.down} key="cosswords-clues-down" />
      ),
    },
  ],
}

export function getbotLeftContent(key: string): PanelContent {
  const content = botLeftContent[key] ?? []
  if (content.length <= 0)
    return {
      node: <GeminiStepper steps={accordionData} autoplay={true} />,
      size: 60,
    }
  return getRandomSubarray(content, 1)[0]
}

export const TopRightContent = () => {
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
    <GrindPieChart key={4} {...leetcodeArgs} />,
    "",
    "",
  ]

  return (
    <DiceCard
      className="relative size-full"
      dof={"Y-axis"}
      faces={cubeFaces}
      showBeam={false}
    />
  )
}
