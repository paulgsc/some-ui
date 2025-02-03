import React, { useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "some-ui-shared"

// Sample NFL data with both conferences
const nflData = {
  NFC: [
    {
      division: "NFC North",
      teams: [
        {
          name: "Green Bay Packers",
          wins: 10,
          losses: 3,
          ties: 0,
          divisionRank: 1,
          conferenceRank: 2,
          leagueRank: 3,
        },
        {
          name: "Minnesota Vikings",
          wins: 7,
          losses: 6,
          ties: 0,
          divisionRank: 2,
          conferenceRank: 7,
          leagueRank: 14,
        },
        {
          name: "Chicago Bears",
          wins: 5,
          losses: 8,
          ties: 0,
          divisionRank: 3,
          conferenceRank: 11,
          leagueRank: 22,
        },
        {
          name: "Detroit Lions",
          wins: 3,
          losses: 10,
          ties: 1,
          divisionRank: 4,
          conferenceRank: 15,
          leagueRank: 30,
        },
      ],
    },
    {
      division: "NFC South",
      teams: [
        {
          name: "Tampa Bay Buccaneers",
          wins: 10,
          losses: 3,
          ties: 0,
          divisionRank: 1,
          conferenceRank: 3,
          leagueRank: 4,
        },
        {
          name: "New Orleans Saints",
          wins: 6,
          losses: 7,
          ties: 0,
          divisionRank: 2,
          conferenceRank: 9,
          leagueRank: 18,
        },
        {
          name: "Atlanta Falcons",
          wins: 6,
          losses: 7,
          ties: 0,
          divisionRank: 3,
          conferenceRank: 10,
          leagueRank: 19,
        },
        {
          name: "Carolina Panthers",
          wins: 5,
          losses: 8,
          ties: 0,
          divisionRank: 4,
          conferenceRank: 12,
          leagueRank: 23,
        },
      ],
    },
  ],
  AFC: [
    {
      division: "AFC East",
      teams: [
        {
          name: "Buffalo Bills",
          wins: 11,
          losses: 2,
          ties: 0,
          divisionRank: 1,
          conferenceRank: 1,
          leagueRank: 1,
        },
        {
          name: "New England Patriots",
          wins: 9,
          losses: 4,
          ties: 0,
          divisionRank: 2,
          conferenceRank: 5,
          leagueRank: 8,
        },
        {
          name: "Miami Dolphins",
          wins: 8,
          losses: 5,
          ties: 0,
          divisionRank: 3,
          conferenceRank: 8,
          leagueRank: 15,
        },
        {
          name: "New York Jets",
          wins: 3,
          losses: 10,
          ties: 0,
          divisionRank: 4,
          conferenceRank: 16,
          leagueRank: 31,
        },
      ],
    },
  ],
}

export default function NFLStandings() {
  const [activeView, setActiveView] = useState("divisions")

  const getWinPercentage = (wins, losses, ties) => {
    const totalGames = wins + losses + ties
    return totalGames === 0
      ? "0.000"
      : ((wins + ties * 0.5) / totalGames).toFixed(3)
  }

  // Get all teams sorted by conference rank
  const getConferenceStandings = (conference) => {
    return nflData[conference]
      .flatMap((division) => division.teams)
      .sort((a, b) => a.conferenceRank - b.conferenceRank)
  }

  // Get all teams sorted by league rank
  const getLeagueStandings = () => {
    return Object.values(nflData)
      .flatMap((conference) => conference.flatMap((division) => division.teams))
      .sort((a, b) => a.leagueRank - b.leagueRank)
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>NFL Standings</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeView} onValueChange={setActiveView} className="mb-6">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="divisions">Division</TabsTrigger>
            <TabsTrigger value="conference">Conference</TabsTrigger>
            <TabsTrigger value="league">League</TabsTrigger>
          </TabsList>

          <TabsContent value="divisions">
            {Object.entries(nflData).map(([conference, divisions]) => (
              <div key={conference} className="mb-8">
                <h2 className="text-xl font-bold mb-4">{conference}</h2>
                {divisions.map((division) => (
                  <div key={division.division} className="mb-6">
                    <h3 className="text-lg font-semibold mb-2">
                      {division.division}
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">Team</TableHead>
                          <TableHead className="text-right">W</TableHead>
                          <TableHead className="text-right">L</TableHead>
                          <TableHead className="text-right">T</TableHead>
                          <TableHead className="text-right">PCT</TableHead>
                          <TableHead className="text-right">Div Rank</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {division.teams.map((team) => (
                          <TableRow key={team.name}>
                            <TableCell className="font-medium">
                              {team.name}
                            </TableCell>
                            <TableCell className="text-right">
                              {team.wins}
                            </TableCell>
                            <TableCell className="text-right">
                              {team.losses}
                            </TableCell>
                            <TableCell className="text-right">
                              {team.ties}
                            </TableCell>
                            <TableCell className="text-right">
                              {getWinPercentage(
                                team.wins,
                                team.losses,
                                team.ties
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {team.divisionRank}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="conference">
            {Object.entries(nflData).map(([conference, _]) => (
              <div key={conference} className="mb-8">
                <h2 className="text-xl font-bold mb-4">{conference}</h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Team</TableHead>
                      <TableHead className="text-right">W</TableHead>
                      <TableHead className="text-right">L</TableHead>
                      <TableHead className="text-right">T</TableHead>
                      <TableHead className="text-right">PCT</TableHead>
                      <TableHead className="text-right">Conf Rank</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getConferenceStandings(conference).map((team) => (
                      <TableRow key={team.name}>
                        <TableCell className="font-medium">
                          {team.name}
                        </TableCell>
                        <TableCell className="text-right">
                          {team.wins}
                        </TableCell>
                        <TableCell className="text-right">
                          {team.losses}
                        </TableCell>
                        <TableCell className="text-right">
                          {team.ties}
                        </TableCell>
                        <TableCell className="text-right">
                          {getWinPercentage(team.wins, team.losses, team.ties)}
                        </TableCell>
                        <TableCell className="text-right">
                          {team.conferenceRank}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="league">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Team</TableHead>
                  <TableHead className="text-right">W</TableHead>
                  <TableHead className="text-right">L</TableHead>
                  <TableHead className="text-right">T</TableHead>
                  <TableHead className="text-right">PCT</TableHead>
                  <TableHead className="text-right">League Rank</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getLeagueStandings().map((team) => (
                  <TableRow key={team.name}>
                    <TableCell className="font-medium">{team.name}</TableCell>
                    <TableCell className="text-right">{team.wins}</TableCell>
                    <TableCell className="text-right">{team.losses}</TableCell>
                    <TableCell className="text-right">{team.ties}</TableCell>
                    <TableCell className="text-right">
                      {getWinPercentage(team.wins, team.losses, team.ties)}
                    </TableCell>
                    <TableCell className="text-right">
                      {team.leagueRank}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
