type Answers = {
  icon: string
  title: string
  description: string
}

export type Question = "What" | "How" | "Why"
type CubeFaceContent = {
  question: Question
  abstract: string
  answers: Array<Answers>
}

export type CubeJson = {
  faceId: string
  content: Array<CubeFaceContent>
}
