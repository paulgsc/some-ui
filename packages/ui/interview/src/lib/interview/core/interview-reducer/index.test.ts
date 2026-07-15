import type {
  InterviewSessionState,
  Question,
  SessionAnswer,
} from "@interview/lib/interview/core/interview-types"
import { describe, expect, it } from "vitest"

import { createInitialInterviewState, interviewReducer } from "."

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

function makeQuestion(id: string): Question {
  return {
    id,
    level: "junior",
    category: "behavioral",
    question: `Question ${id}`,
    durationSeconds: 60,
  }
}

function makeState(
  overrides: Partial<InterviewSessionState> = {}
): InterviewSessionState {
  return { ...createInitialInterviewState(), ...overrides }
}

// ═══════════════════════════════════════════════════════════════════════════
// createInitialInterviewState
// ═══════════════════════════════════════════════════════════════════════════

describe("createInitialInterviewState", () => {
  it("starts at welcome with empty everything", () => {
    expect(createInitialInterviewState()).toEqual({
      phase: "welcome",
      questions: [],
      currentIndex: 0,
      notes: "",
      audioUrl: null,
      recordingDurationSeconds: 0,
      transcription: null,
      answers: [],
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// QUESTIONS_LOADED / NOTES_CHANGED - unconditional updates
// ═══════════════════════════════════════════════════════════════════════════

describe("QUESTIONS_LOADED", () => {
  it("sets questions regardless of current phase", () => {
    const questions = [makeQuestion("q1"), makeQuestion("q2")]
    const state = makeState({ phase: "complete" })
    const result = interviewReducer(state, {
      type: "QUESTIONS_LOADED",
      questions,
    })
    expect(result.questions).toBe(questions)
    expect(result.phase).toBe("complete")
  })
})

describe("NOTES_CHANGED", () => {
  it("updates notes regardless of current phase", () => {
    const state = makeState({ phase: "recording" })
    const result = interviewReducer(state, {
      type: "NOTES_CHANGED",
      notes: "typed while recording",
    })
    expect(result.notes).toBe("typed while recording")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-GUARDED TRANSITIONS - table-driven legal + illegal cases
// ═══════════════════════════════════════════════════════════════════════════

describe("START", () => {
  it("moves welcome -> question when questions are loaded", () => {
    const state = makeState({
      phase: "welcome",
      questions: [makeQuestion("q1")],
    })
    const result = interviewReducer(state, { type: "START" })
    expect(result.phase).toBe("question")
  })

  it("no-ops when questions have not loaded yet", () => {
    const state = makeState({ phase: "welcome", questions: [] })
    const result = interviewReducer(state, { type: "START" })
    expect(result).toBe(state)
  })

  it.each<InterviewSessionState["phase"]>([
    "question",
    "preparation",
    "recording",
    "transcribing",
    "review",
    "complete",
  ])("no-ops from phase %s", (phase) => {
    const state = makeState({ phase, questions: [makeQuestion("q1")] })
    const result = interviewReducer(state, { type: "START" })
    expect(result).toBe(state)
  })
})

describe("QUESTION_PLAYBACK_DONE", () => {
  it("moves question -> preparation", () => {
    const state = makeState({ phase: "question" })
    expect(
      interviewReducer(state, { type: "QUESTION_PLAYBACK_DONE" }).phase
    ).toBe("preparation")
  })

  it.each<InterviewSessionState["phase"]>([
    "welcome",
    "preparation",
    "recording",
    "transcribing",
    "review",
    "complete",
  ])("no-ops from phase %s", (phase) => {
    const state = makeState({ phase })
    const result = interviewReducer(state, { type: "QUESTION_PLAYBACK_DONE" })
    expect(result).toBe(state)
  })
})

describe("BEGIN_RECORDING", () => {
  it("moves preparation -> recording", () => {
    const state = makeState({ phase: "preparation" })
    expect(interviewReducer(state, { type: "BEGIN_RECORDING" }).phase).toBe(
      "recording"
    )
  })

  it("no-ops outside preparation", () => {
    const state = makeState({ phase: "question" })
    expect(interviewReducer(state, { type: "BEGIN_RECORDING" })).toBe(state)
  })
})

describe("RECORDING_COMPLETE", () => {
  it("moves recording -> transcribing and stamps audio/duration/pending transcription", () => {
    const state = makeState({ phase: "recording" })
    const result = interviewReducer(state, {
      type: "RECORDING_COMPLETE",
      audioUrl: "blob:abc",
      durationSeconds: 42,
    })
    expect(result.phase).toBe("transcribing")
    expect(result.audioUrl).toBe("blob:abc")
    expect(result.recordingDurationSeconds).toBe(42)
    expect(result.transcription).toEqual({ status: "pending" })
  })

  it("no-ops outside recording", () => {
    const state = makeState({ phase: "transcribing" })
    const result = interviewReducer(state, {
      type: "RECORDING_COMPLETE",
      audioUrl: "blob:abc",
      durationSeconds: 42,
    })
    expect(result).toBe(state)
  })
})

describe("TRANSCRIPTION_UPDATED", () => {
  it.each<InterviewSessionState["phase"]>(["transcribing", "review"])(
    "accepts updates from phase %s",
    (phase) => {
      const state = makeState({ phase })
      const result = interviewReducer(state, {
        type: "TRANSCRIPTION_UPDATED",
        result: { status: "processing" },
      })
      expect(result.transcription).toEqual({ status: "processing" })
      // Non-terminal status does not force a phase change
      expect(result.phase).toBe(phase)
    }
  )

  it("moves to review when the result is terminal (done)", () => {
    const state = makeState({ phase: "transcribing" })
    const result = interviewReducer(state, {
      type: "TRANSCRIPTION_UPDATED",
      result: { status: "done", transcript: "hello" },
    })
    expect(result.phase).toBe("review")
  })

  it("moves to review when the result is terminal (error)", () => {
    const state = makeState({ phase: "transcribing" })
    const result = interviewReducer(state, {
      type: "TRANSCRIPTION_UPDATED",
      result: { status: "error", error: "boom" },
    })
    expect(result.phase).toBe("review")
  })

  it.each<InterviewSessionState["phase"]>([
    "welcome",
    "question",
    "preparation",
    "recording",
    "complete",
  ])("no-ops from phase %s", (phase) => {
    const state = makeState({ phase })
    const result = interviewReducer(state, {
      type: "TRANSCRIPTION_UPDATED",
      result: { status: "done" },
    })
    expect(result).toBe(state)
  })
})

describe("TRANSCRIPT_EDITED", () => {
  it("edits the transcript when in review with a transcription present", () => {
    const state = makeState({
      phase: "review",
      transcription: { status: "done", transcript: "original" },
    })
    const result = interviewReducer(state, {
      type: "TRANSCRIPT_EDITED",
      transcript: "edited",
    })
    expect(result.transcription).toEqual({
      status: "done",
      transcript: "edited",
    })
  })

  it("no-ops in review without a transcription", () => {
    const state = makeState({ phase: "review", transcription: null })
    const result = interviewReducer(state, {
      type: "TRANSCRIPT_EDITED",
      transcript: "edited",
    })
    expect(result).toBe(state)
  })

  it("no-ops outside review", () => {
    const state = makeState({
      phase: "transcribing",
      transcription: { status: "pending" },
    })
    const result = interviewReducer(state, {
      type: "TRANSCRIPT_EDITED",
      transcript: "edited",
    })
    expect(result).toBe(state)
  })
})

describe("RETRY_ANSWER", () => {
  it("resets recording artifacts and returns to preparation", () => {
    const state = makeState({
      phase: "review",
      audioUrl: "blob:abc",
      recordingDurationSeconds: 30,
      transcription: { status: "done", transcript: "x" },
    })
    const result = interviewReducer(state, { type: "RETRY_ANSWER" })
    expect(result.phase).toBe("preparation")
    expect(result.audioUrl).toBeNull()
    expect(result.recordingDurationSeconds).toBe(0)
    expect(result.transcription).toBeNull()
  })

  it("no-ops outside review", () => {
    const state = makeState({ phase: "transcribing" })
    expect(interviewReducer(state, { type: "RETRY_ANSWER" })).toBe(state)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// CONTINUE - buildAnswer + last-question completion branch
// ═══════════════════════════════════════════════════════════════════════════

describe("CONTINUE", () => {
  const questions = [makeQuestion("q1"), makeQuestion("q2")]

  it("no-ops outside review", () => {
    const state = makeState({ phase: "recording", questions })
    expect(interviewReducer(state, { type: "CONTINUE" })).toBe(state)
  })

  it("builds an answer from current state and advances to the next question", () => {
    const state = makeState({
      phase: "review",
      questions,
      currentIndex: 0,
      notes: "my notes",
      recordingDurationSeconds: 12,
      transcription: { status: "done", transcript: "my transcript" },
    })

    const result = interviewReducer(state, { type: "CONTINUE" })

    expect(result.answers).toEqual<Array<SessionAnswer>>([
      {
        questionId: "q1",
        transcript: "my transcript",
        notes: "my notes",
        durationSeconds: 12,
      },
    ])
    expect(result.currentIndex).toBe(1)
    expect(result.phase).toBe("question")
    // Per-question state resets for the next round
    expect(result.notes).toBe("")
    expect(result.audioUrl).toBeNull()
    expect(result.recordingDurationSeconds).toBe(0)
    expect(result.transcription).toBeNull()
  })

  it("falls back to 'unknown' questionId if the index is out of range", () => {
    const state = makeState({
      phase: "review",
      questions: [],
      currentIndex: 0,
    })
    const result = interviewReducer(state, { type: "CONTINUE" })
    expect(result.answers[0]?.questionId).toBe("unknown")
  })

  it("completes the session on the last question instead of advancing", () => {
    const state = makeState({
      phase: "review",
      questions,
      currentIndex: 1, // last index
      notes: "final notes",
      recordingDurationSeconds: 8,
      transcription: { status: "done", transcript: "final transcript" },
    })

    const result = interviewReducer(state, { type: "CONTINUE" })

    expect(result.phase).toBe("complete")
    expect(result.currentIndex).toBe(1) // unchanged, no next question
    expect(result.answers).toHaveLength(1)
    expect(result.answers[0]).toEqual({
      questionId: "q2",
      transcript: "final transcript",
      notes: "final notes",
      durationSeconds: 8,
    })
    expect(result.audioUrl).toBeNull()
    expect(result.recordingDurationSeconds).toBe(0)
    expect(result.transcription).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// RESTART - keeps loaded questions, resets everything else
// ═══════════════════════════════════════════════════════════════════════════

describe("RESTART", () => {
  it("resets to initial state but preserves loaded questions", () => {
    const questions = [makeQuestion("q1")]
    const state = makeState({
      phase: "complete",
      questions,
      currentIndex: 1,
      notes: "leftover",
      answers: [
        { questionId: "q1", transcript: "t", notes: "n", durationSeconds: 1 },
      ],
    })

    const result = interviewReducer(state, { type: "RESTART" })

    expect(result).toEqual({
      ...createInitialInterviewState(),
      questions,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// HYDRATE - currentIndex clamping (applies regardless of phase)
// ═══════════════════════════════════════════════════════════════════════════

describe("HYDRATE", () => {
  const questions = [makeQuestion("q1"), makeQuestion("q2"), makeQuestion("q3")]

  it("restores notes/answers/currentIndex from a snapshot", () => {
    const state = makeState({ questions })
    const result = interviewReducer(state, {
      type: "HYDRATE",
      snapshot: {
        currentIndex: 1,
        notes: "resumed notes",
        answers: [
          { questionId: "q1", transcript: "t", notes: "n", durationSeconds: 5 },
        ],
        updatedAt: 12345,
      },
    })

    expect(result.currentIndex).toBe(1)
    expect(result.notes).toBe("resumed notes")
    expect(result.answers).toHaveLength(1)
  })

  it("clamps an out-of-range currentIndex down to the last valid question", () => {
    const state = makeState({ questions })
    const result = interviewReducer(state, {
      type: "HYDRATE",
      snapshot: { currentIndex: 99, notes: "", answers: [], updatedAt: 0 },
    })
    expect(result.currentIndex).toBe(questions.length - 1)
  })

  it("clamps to 0 when there are no questions loaded yet", () => {
    const state = makeState({ questions: [] })
    const result = interviewReducer(state, {
      type: "HYDRATE",
      snapshot: { currentIndex: 5, notes: "", answers: [], updatedAt: 0 },
    })
    expect(result.currentIndex).toBe(0)
  })

  it("applies regardless of current phase", () => {
    const state = makeState({ phase: "complete", questions })
    const result = interviewReducer(state, {
      type: "HYDRATE",
      snapshot: { currentIndex: 2, notes: "x", answers: [], updatedAt: 0 },
    })
    expect(result.currentIndex).toBe(2)
    expect(result.phase).toBe("complete")
  })
})
