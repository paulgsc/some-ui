import { describe, expect, it } from "vitest"

import {
  axisForCycle,
  computeFaceTransforms,
  computePerspective,
  isSquare,
  resolveAxis,
} from "./cube-geometry"

describe("isSquare", () => {
  it("treats equal dims as square", () => {
    expect(isSquare({ width: 180, height: 180 })).toBe(true)
  })

  it("tolerates sub-pixel difference", () => {
    expect(isSquare({ width: 180, height: 180.4 })).toBe(true)
  })

  it("rejects clearly non-square rects", () => {
    expect(isSquare({ width: 320, height: 120 })).toBe(false)
    expect(isSquare({ width: 120, height: 320 })).toBe(false)
  })
})

describe("axisForCycle", () => {
  it("maps cube:x to the X axis", () => {
    expect(axisForCycle("cube:x")).toBe("x")
  })

  it("maps every other cycle to the Y axis (lockstep with rotation adapter)", () => {
    expect(axisForCycle("cube:y")).toBe("y")
    expect(axisForCycle("hex:circumference")).toBe("y")
    expect(axisForCycle("hex:vertical")).toBe("y")
    expect(axisForCycle("carousel:circular")).toBe("y")
  })
})

describe("resolveAxis", () => {
  it("honors the requested axis for a square cube", () => {
    expect(resolveAxis({ width: 180, height: 180 }, "x")).toBe("x")
    expect(resolveAxis({ width: 180, height: 180 }, "y")).toBe("y")
  })

  it("forces X for a wide rect regardless of request", () => {
    expect(resolveAxis({ width: 320, height: 120 }, "y")).toBe("x")
    expect(resolveAxis({ width: 320, height: 120 }, "x")).toBe("x")
  })

  it("forces Y for a tall rect regardless of request", () => {
    expect(resolveAxis({ width: 120, height: 320 }, "x")).toBe("y")
    expect(resolveAxis({ width: 120, height: 320 }, "y")).toBe("y")
  })
})

describe("computePerspective", () => {
  it("never drops below the minimum focal distance", () => {
    expect(computePerspective({ width: 100, height: 100 }, "y")).toBe(700)
  })

  it("scales with the swept dimension (Y sweeps width)", () => {
    // width 400 * 3.5 = 1400 > maxDim*1.5 (600) and > min
    expect(computePerspective({ width: 400, height: 180 }, "y")).toBe(1400)
  })

  it("scales with the swept dimension (X sweeps height)", () => {
    // height 400 * 3.5 = 1400
    expect(computePerspective({ width: 180, height: 400 }, "x")).toBe(1400)
  })

  it("uses the larger in-plane dimension as a floor", () => {
    // X axis, swept = height 100 → 350, but width 600 * 1.5 = 900 floor wins
    expect(computePerspective({ width: 600, height: 100 }, "x")).toBe(900)
  })
})

describe("computeFaceTransforms", () => {
  it("returns six faces", () => {
    expect(
      computeFaceTransforms({ width: 180, height: 180 }, "y")
    ).toHaveLength(6)
  })

  it("shows all faces for a square cube on either axis", () => {
    for (const axis of ["x", "y"] as const) {
      const faces = computeFaceTransforms({ width: 180, height: 180 }, axis)
      expect(faces.every((f) => !f.hidden)).toBe(true)
    }
  })

  it("hides the left/right pair for a wide rect on X", () => {
    const faces = computeFaceTransforms({ width: 320, height: 120 }, "x")
    expect(faces[1]?.hidden).toBe(true) // right
    expect(faces[3]?.hidden).toBe(true) // left
    expect(faces[0]?.hidden).toBe(false) // front
    expect(faces[4]?.hidden).toBe(false) // top
    expect(faces[5]?.hidden).toBe(false) // bottom
  })

  it("hides the top/bottom pair for a tall rect on Y", () => {
    const faces = computeFaceTransforms({ width: 120, height: 320 }, "y")
    expect(faces[4]?.hidden).toBe(true) // top
    expect(faces[5]?.hidden).toBe(true) // bottom
    expect(faces[0]?.hidden).toBe(false) // front
    expect(faces[1]?.hidden).toBe(false) // right
    expect(faces[3]?.hidden).toBe(false) // left
  })

  it("pushes the front face out by half the swept dimension", () => {
    // Y axis sweeps width → front uses halfW
    const y = computeFaceTransforms({ width: 200, height: 120 }, "y")
    expect(y[0]?.transform).toBe("translateZ(100px)")
    // X axis sweeps height → front uses halfH
    const x = computeFaceTransforms({ width: 200, height: 120 }, "x")
    expect(x[0]?.transform).toBe("translateZ(60px)")
  })

  it("flips the back face 180° about its rotation axis", () => {
    const y = computeFaceTransforms({ width: 180, height: 180 }, "y")
    expect(y[2]?.transform).toBe("rotateY(180deg) translateZ(90px)")
    const x = computeFaceTransforms({ width: 180, height: 180 }, "x")
    expect(x[2]?.transform).toBe("rotateX(180deg) translateZ(90px)")
  })
})
