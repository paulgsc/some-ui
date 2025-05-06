import type { AccordionSteps } from "some-ui-stepper"

export const accordionData: AccordionSteps = {
  meta: {
    title: "What I'm working on today",
  },
  data: [
    {
      stepId: "item-1",
      title: "Sudoku Visual",
      progress: "done",
      content: `I'm going to have a sudoku puzzle visual component that allows me to communicate factoids and silly knowlegdet nuggets
      about just anything I find amusing. From own intrerests, to pithy remarks, opinions and general sentiments about whatever. This 
      will be an animated sudoku crossword puzzle that slowly reveals the answer to some clue on a topic of interest.`,
    },
    {
      stepId: "item-2",
      title: "Sudoku wasm Implement Grid map",
      progress: "scheduled",
      content: `As part of building the sudoku visual, the core logic is in a rust wasm api. When first built I let the implementation 
      for the specific position of each letter be handled by the client with the api only defining the schema for each word's start (x,y).
          But I realize that it's rather trivial for the api to do this as well and just generate the entire grid map itself.`,
    },
    {
      stepId: "item-3",
      title: "Sudoku Visual Overlay",
      progress: "pending",
      content: `To render the sudoku visual so that it can be visible on the obs  overlay I need to add it to may overlays packages. This is
    proving kinda tricky because of how the context is implemented. The sudoku grid and the clues are own first class citizen compoonents.
      But the grid owns the context of active cell so it creating confounding factors.`,
    },
    {
      stepId: "item-4",
      title: "To DB or not to DB",
      progress: "scheduled",
      content: `If I should get around to finishing implementing the sudoku visual overlay within this stream - highly unlikely but who knows.
      Then I would like to ponder on how I want to handle the sudoku clues data. Currently just using a json file, but the clues will grow in size and does this mean I should use a db, maybe store it gdrive and fetch. I'll have to ponder this with my bestie - the vibe gods.`,
    },
    {
      stepId: "item-5",
      title: "Sudoku Init Bug",
      progress: "pending",
      content: `The sudoku clues animation work by traversing a queue of randomly shuffled letters of the clue answeres. Since this is an
      array, we need to ensure that we access a valid index at each next pointer. Problem is the sudoku grid animation and clues queue
      is misplaced offset by one, due to non-synced start times. Need to figure this out.`,
    },
  ],
}
