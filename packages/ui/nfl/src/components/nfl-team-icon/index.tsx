import type { FC } from "react"

export type NFLTeam =
  | "49ers"
  | "Bears"
  | "Bengals"
  | "Bills"
  | "Broncos"
  | "Browns"
  | "Buccaneers"
  | "Cardinals"
  | "Chargers"
  | "Chiefs"
  | "Colts"
  | "Commanders"
  | "Cowboys"
  | "Dolphins"
  | "Eagles"
  | "Falcons"
  | "Giants"
  | "Jaguars"
  | "Jets"
  | "Lions"
  | "Packers"
  | "Panthers"
  | "Patriots"
  | "Raiders"
  | "Rams"
  | "Ravens"
  | "Saints"
  | "Seahawks"
  | "Steelers"
  | "Texans"
  | "Titans"
  | "Vikings"

type NFLTeamIconProps = {
  team: NFLTeam
  size?: number
  className?: string
}

type TeamData = {
  name: string
  primaryColor: string
  secondaryColor?: string
  abbreviation: NFLTeam
}

// Team data with primary colors
const NFL_TEAMS: Record<NFLTeam, TeamData> = {
  Cardinals: {
    name: "Arizona Cardinals",
    primaryColor: "#97233F",
    abbreviation: "Cardinals",
  },
  Falcons: {
    name: "Atlanta Falcons",
    primaryColor: "#A71930",
    abbreviation: "Cardinals",
  },
  Ravens: {
    name: "Baltimore Ravens",
    primaryColor: "#241773",
    abbreviation: "Ravens",
  },
  Bills: {
    name: "Buffalo Bills",
    primaryColor: "#00338D",
    abbreviation: "Bills",
  },
  Panthers: {
    name: "Carolina Panthers",
    primaryColor: "#0085CA",
    abbreviation: "Panthers",
  },
  Bears: {
    name: "Chicago Bears",
    primaryColor: "#0B162A",
    secondaryColor: "#C83803",
    abbreviation: "Bears",
  },
  Bengals: {
    name: "Cincinnati Bengals",
    primaryColor: "#FB4F14",
    abbreviation: "Bengals",
  },
  Browns: {
    name: "Cleveland Browns",
    primaryColor: "#FF3C00",
    abbreviation: "Browns",
  },
  Cowboys: {
    name: "Dallas Cowboys",
    primaryColor: "#003594",
    abbreviation: "Cowboys",
  },
  Broncos: {
    name: "Denver Broncos",
    primaryColor: "#FB4F14",
    secondaryColor: "#002244",
    abbreviation: "Broncos",
  },
  Lions: {
    name: "Detroit Lions",
    primaryColor: "#0076B6",
    abbreviation: "Lions",
  },
  Packers: {
    name: "Green Bay Packers",
    primaryColor: "#203731",
    secondaryColor: "#FFB612",
    abbreviation: "Packers",
  },
  Texans: {
    name: "Houston Texans",
    primaryColor: "#03202F",
    secondaryColor: "#A71930",
    abbreviation: "Texans",
  },
  Colts: {
    name: "Indianapolis Colts",
    primaryColor: "#002C5F",
    abbreviation: "Colts",
  },
  Jaguars: {
    name: "Jacksonville Jaguars",
    primaryColor: "#006778",
    secondaryColor: "#9F792C",
    abbreviation: "Jaguars",
  },
  Chiefs: {
    name: "Kansas City Chiefs",
    primaryColor: "#E31837",
    abbreviation: "Chiefs",
  },
  Chargers: {
    name: "Los Angeles Chargers",
    primaryColor: "#0080C6",
    secondaryColor: "#FFC20E",
    abbreviation: "Chargers",
  },
  Rams: {
    name: "Los Angeles Rams",
    primaryColor: "#003594",
    secondaryColor: "#FFA300",
    abbreviation: "Rams",
  },
  Raiders: {
    name: "Las Vegas Raiders",
    primaryColor: "#000000",
    secondaryColor: "#A5ACAF",
    abbreviation: "Raiders",
  },
  Dolphins: {
    name: "Miami Dolphins",
    primaryColor: "#008E97",
    secondaryColor: "#FC4C02",
    abbreviation: "Dolphins",
  },
  Vikings: {
    name: "Minnesota Vikings",
    primaryColor: "#4F2683",
    abbreviation: "Vikings",
  },
  Patriots: {
    name: "New England Patriots",
    primaryColor: "#002244",
    secondaryColor: "#C60C30",
    abbreviation: "Panthers",
  },
  Saints: {
    name: "New Orleans Saints",
    primaryColor: "#101820",
    secondaryColor: "#D3BC8D",
    abbreviation: "Saints",
  },
  Giants: {
    name: "New York Giants",
    primaryColor: "#0B2265",
    secondaryColor: "#A71930",
    abbreviation: "Giants",
  },
  Jets: {
    name: "New York Jets",
    primaryColor: "#125740",
    abbreviation: "Jets",
  },
  Eagles: {
    name: "Philadelphia Eagles",
    primaryColor: "#004C54",
    abbreviation: "Eagles",
  },
  Steelers: {
    name: "Pittsburgh Steelers",
    primaryColor: "#101820",
    secondaryColor: "#FFB612",
    abbreviation: "Steelers",
  },
  Seahawks: {
    name: "Seattle Seahawks",
    primaryColor: "#002244",
    secondaryColor: "#69BE28",
    abbreviation: "Seahawks",
  },
  "49ers": {
    name: "San Francisco 49ers",
    primaryColor: "#AA0000",
    abbreviation: "49ers",
  },
  Buccaneers: {
    name: "Tampa Bay Buccaneers",
    primaryColor: "#A71930",
    abbreviation: "Buccaneers",
  },
  Titans: {
    name: "Tennessee Titans",
    primaryColor: "#0C2340",
    secondaryColor: "#4B92DB",
    abbreviation: "Titans",
  },
  Commanders: {
    name: "Washington Commanders",
    primaryColor: "#5A1414",
    secondaryColor: "#FFB612",
    abbreviation: "Commanders",
  },
}

export const NFLTeamIcon: FC<NFLTeamIconProps> = ({
  team,
  size = 40,
  className = "",
}) => {
  const teamData = NFL_TEAMS[team]

  // Display abbreviation (2-3 characters)
  const displayText = team
  const valueFontSize = Math.max(16, size / 10)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-label={`${teamData.name} icon`}
    >
      {/* Circle background */}
      <circle cx="50" cy="50" r="50" fill={teamData.primaryColor} />

      {/* Team abbreviation text */}
      <text
        x="50"
        y="50"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="white"
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        fontSize={valueFontSize}
      >
        {displayText}
      </text>
    </svg>
  )
}
