import { apiHooks } from "maishatu-fetch-kit" // adjust import path
import { z } from "zod"

// Define the MoodEvent schema to match your TypeScript type
const MoodEventSchema = z.object({
  id: z.number(),
  index: z.number(),
  week: z.number(),
  label: z.string(),
  description: z.string(),
  team: z.string(),
  category: z.string(),
  delta: z.number(),
  mood: z.number(),
  time: z.string().optional(),
})

// Array schema for multiple mood events
const MoodEventsSchema = z.array(MoodEventSchema)

// Export the MoodEvent type
export type MoodEvent = z.infer<typeof MoodEventSchema>

// Create the query hook for fetching all mood events
export const useGetAllMoodEvents = apiHooks.createQueryHook(
  new URL("/mood_events", "http://your-api-base-url"), // adjust base URL
  MoodEventsSchema,
  "GET",
  {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  }
)

// Create hook for getting mood event by ID
export const useGetMoodEventById = apiHooks.createQueryHook(
  new URL("/mood_events/:id", "http://your-api-base-url"),
  MoodEventSchema,
  "GET"
)

// Create hook for getting mood events by week
export const useGetMoodEventsByWeek = apiHooks.createQueryHook(
  new URL("/mood_events/week/:week", "http://your-api-base-url"),
  MoodEventsSchema,
  "GET"
)

// Create hook for getting mood events by team
export const useGetMoodEventsByTeam = apiHooks.createQueryHook(
  new URL("/mood_events/team/:team", "http://your-api-base-url"),
  MoodEventsSchema,
  "GET"
)

// Usage examples:

// 1. Get all mood events
// const { data: allEvents, isLoading, error } = useGetAllMoodEvents()

// 2. Get mood event by ID
// const { data: event } = useGetMoodEventById({ id: 123 })

// 3. Get mood events by week
// const { data: weekEvents } = useGetMoodEventsByWeek({ week: 42 })

// 4. Get mood events by team
// const { data: teamEvents } = useGetMoodEventsByTeam({ team: "engineering" })
