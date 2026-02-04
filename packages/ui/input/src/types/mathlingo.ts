// Mathlingo Card Schema - The content DSL

export type Card = {
  id: string
  object: ObjectSpec
  view?: ViewSpec
  interaction: InteractionType
  prompt: string // ≤140 chars, one sentence only
  options?: Array<Option>
  answer: AnswerSpec
  feedback?: string // One sentence, optional
  timeLimit?: number // defaults to 30s
}

export type ObjectSpec =
  | { kind: "function"; repr: "graph" | "formula"; data: FunctionData }
  | { kind: "expression"; data: ExpressionData }
  | { kind: "structure"; data: StructureData }
  | { kind: "definition"; data: string }
  | { kind: "diagram"; data: DiagramData }

export type FunctionData = {
  type?: string
  domain?: [number, number]
  formula: string
  points?: Array<{ x: number; y: number }>
}

export type ExpressionData = {
  type?: string
  latex: string
  values?: Array<Array<number>>
}

export type StructureData = {
  type: string
  elements?: Array<string>
  relations?: Array<string>
  visual?: string
}

export type DiagramData = {
  type: string
  nodes: Array<{ id: string; label: string; x: number; y: number }>
  edges: Array<{ from: string; to: string; label?: string }>
}

export type ViewSpec = {
  focus?: string
  annotations?: Array<string>
  bounds?: { x: [number, number]; y: [number, number] }
  highlight?: string
}

export type InteractionType =
  | "single_choice"
  | "multi_choice"
  | "true_false"
  | "order_items"
  | "graph_select"
  | "transform_select"
  | "spot_the_lie"

export type Option = {
  id: string
  label: string
}

export type AnswerSpec =
  | { kind: "single"; correct: string }
  | { kind: "multi"; correct: Array<string> }
  | { kind: "boolean"; correct: boolean }
  | { kind: "order"; correct: Array<string> }
  | { kind: "region"; correct: Array<string> }

// Session Types
export type SessionState = {
  cards: Array<Card>
  currentIndex: number
  answers: Array<Answer>
  startTime: number
  topic: Topic
  isComplete: boolean
}

export type Answer = {
  cardId: string
  userAnswer: string | Array<string> | boolean
  isCorrect: boolean
  timeSpent: number
}

export type Topic =
  | "real-analysis"
  | "abstract-algebra"
  | "topology"
  | "linear-algebra"

export type SessionLength = 5 | 10 | 20

// Card State
export type CardState =
  | "unanswered"
  | "answered_correct"
  | "answered_incorrect"
  | "showing_feedback"
