import type { JSX } from "react"

import { DraggableContainer, DraggableItem } from "../draggable"
import FootballField from "../nfl-field"

const FootballFieldDraggable = (): JSX.Element => {
  return (
    <div className="flex justify-center items-center h-[75vh] relative">
      <div className="w-full h-full max-w-[calc(75vh*1.875)] max-h-[75vh] relative">
        {/* The max-width is calculated based on the field's aspect ratio (100/53.3 ≈ 1.875) */}
        <FootballField
          className="absolute inset-0 rotate-90"
          height={53.3}
          width={100}
        >
          <FootballField.EndZone
            teamName="NINERS"
            primaryColor="#C8102E"
            accentColor="white"
            width={100}
            height={53.3}
            className="-z-10"
          />
          <FootballField.FieldLines
            count={21}
            startX={10}
            spacing={4}
            dashArray="0.2,0.2"
            className="-z-10"
          />
          <FootballField.HashMarks />
          <FootballField.YardNumbers orientation="top" />
          <FootballField.YardNumbers orientation="bottom" />
          <FootballField.CenterLogo
            primaryColor="#C8102E"
            width={100}
            height={53.3}
            teamLogo="49ERS"
            className="-z-10"
          />
          <FootballField.FieldBorder
            secondaryColor="#FFB612"
            width={100}
            height={53.3}
            className="-z-10"
          />
        </FootballField>

        <DraggableContainer className="absolute inset-0 bg-transparent">
          {/* Offensive Line */}
          <DraggableItem id="c" initialPosition={{ x: 50, y: 70 }}>
            <PlayerIcon position="C" number="50" />
          </DraggableItem>
          <DraggableItem id="lg" initialPosition={{ x: 42, y: 70 }}>
            <PlayerIcon position="LG" number="65" />
          </DraggableItem>
          <DraggableItem id="rg" initialPosition={{ x: 58, y: 70 }}>
            <PlayerIcon position="RG" number="73" />
          </DraggableItem>
          <DraggableItem id="lt" initialPosition={{ x: 34, y: 70 }}>
            <PlayerIcon position="LT" number="77" />
          </DraggableItem>
          <DraggableItem id="rt" initialPosition={{ x: 66, y: 70 }}>
            <PlayerIcon position="RT" number="71" />
          </DraggableItem>

          {/* Skill Positions */}
          <DraggableItem id="qb" initialPosition={{ x: 50, y: 80 }}>
            <PlayerIcon position="QB" number="12" />
          </DraggableItem>
          <DraggableItem id="rb" initialPosition={{ x: 50, y: 90 }}>
            <PlayerIcon position="RB" number="28" />
          </DraggableItem>

          {/* Wide Receivers */}
          <DraggableItem id="wr1" initialPosition={{ x: 15, y: 70 }}>
            <PlayerIcon position="WR" number="11" />
          </DraggableItem>
          <DraggableItem id="wr2" initialPosition={{ x: 85, y: 70 }}>
            <PlayerIcon position="WR" number="17" />
          </DraggableItem>
          <DraggableItem id="slot1" initialPosition={{ x: 25, y: 75 }}>
            <PlayerIcon position="WR" number="80" />
          </DraggableItem>
          <DraggableItem id="te" initialPosition={{ x: 75, y: 75 }}>
            <PlayerIcon position="TE" number="85" />
          </DraggableItem>
        </DraggableContainer>
      </div>
    </div>
  )
}

const PlayerIcon = ({
  position,
  number,
}: {
  position: string
  number: string
}): JSX.Element => (
  <div className="flex flex-col items-center">
    <div className="w-12 h-12 rounded-full bg-white border-2 border-black flex items-center justify-center font-bold">
      {number}
    </div>
    <span className="text-xs mt-1 font-medium">{position}</span>
  </div>
)

export default FootballFieldDraggable
