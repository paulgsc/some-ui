import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import FootballField from "."

type Meta = MetaObj<typeof FootballField>
type Story = StoryObj<typeof FootballField>

export default {
  title: "NFL Field",
  component: FootballField,
} as Meta

export const Complete: Story = {
  args: {
    teamName: "NINERS",
    primaryColor: "#C8102E",
    secondaryColor: "#FFB612",
    accentColor: "white",
    fieldColor: "#2E5A27",
    width: 100,
    height: 53.3,
    children: (
      <>
        <FootballField.EndZone
          teamName="NINERS"
          primaryColor="#C8102E"
          accentColor="white"
          width={100}
          height={53.3}
        />
        <FootballField.FieldLines
          count={21}
          startX={10}
          spacing={4}
          dashArray="0.2,0.2"
        />
        <FootballField.HashMarks />
        <FootballField.YardNumbers orientation="top" />
        <FootballField.YardNumbers orientation="bottom" />
        <FootballField.CenterLogo
          primaryColor="#C8102E"
          width={100}
          height={53.3}
          teamLogo={"49ERS"}
        />
        <FootballField.FieldBorder
          secondaryColor="#FFB612"
          width={100}
          height={53.3}
        />
      </>
    ),
  },
}

export const EndZoneOnly: Story = {
  args: {
    width: 100,
    height: 53.3,
    children: (
      <FootballField.EndZone
        teamName="Niners"
        primaryColor="#C8102E"
        accentColor="white"
        width={100}
        height={53.3}
      />
    ),
  },
}

export const FieldLinesOnly: Story = {
  args: {
    width: 100,
    height: 53.3,
    children: (
      <FootballField.FieldLines
        count={21}
        startX={10}
        spacing={4}
        dashArray="0.2,0.2"
      />
    ),
  },
}

export const HarshMarksOnly: Story = {
  args: {
    width: 100,
    height: 53.3,
    children: <FootballField.HashMarks />,
  },
}

export const YardNumbersOnly: Story = {
  args: {
    width: 100,
    height: 53.3,
    children: (
      <>
        <FootballField.YardNumbers
          orientation="bottom"
          startX={14}
          spacing={8}
          fontSize={2}
        />
        <FootballField.CenterLogo
          primaryColor="#C8102E"
          width={100}
          height={53.3}
          teamLogo={"49ERS"}
        />
      </>
    ),
  },
}

export const CenterLogoOnly: Story = {
  args: {
    width: 100,
    height: 53.3,
    children: (
      <FootballField.CenterLogo
        primaryColor="#C8102E"
        width={100}
        height={53.3}
        teamLogo={"49ERS"}
      />
    ),
  },
}
