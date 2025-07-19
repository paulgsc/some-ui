import { attributionData } from "@attributions/data/attribution-data"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { apiHooks } from "maishatu-fetch-kit"
import { z } from "zod"

import { AttributionCard } from "."

type Story = StoryObj<typeof AttributionCard>

const rowSchema = z.array(z.string()) // Each row is an array of strings

const tableSchema = z.array(rowSchema) // The whole table is an array of rows

const fileId = "1utpDGonbesfPlJsEo8Y6xBmVKO13W4JhB9Brm8qjc6A"
const url = new URL(`http://nixos.local:3000/gsheet/${fileId}`)
const useGetCredits = apiHooks.createQueryHook(url, tableSchema, "GET")

export const CreditsFetch = () => {
  const { data, isLoading, error } = useGetCredits()

  return (
    <main className="size-96 border border-red-500 text-center text-red-500">
      <p> {JSON.stringify(data)}</p>
      isLoading: {`${isLoading}`}
      error: {`${error}`}
    </main>
  )
}
export const Default: Story = {
  args: {
    attribution: attributionData[1],
  },
}

export default {
  title: "UI/Attributions/AttributionCard",
  component: AttributionCard,
} as Meta
