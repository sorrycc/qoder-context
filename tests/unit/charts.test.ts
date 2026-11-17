import { describe, expect, it } from "vitest"
import { heatLevel, labelEvery, niceScale, toolList } from "../../src/browser/charts.js"
import { nextIndex, placeTip } from "../../src/browser/tooltip.js"

describe("chart scales", () => {
  it("rounds the axis top up to a 1/2/2.5/5 step", () => {
    expect(niceScale(0)).toEqual({ top: 1, ticks: [] })
    expect(niceScale(90)).toEqual({ top: 100, ticks: [50, 100] })
    expect(niceScale(130_000)).toEqual({ top: 150_000, ticks: [50_000, 100_000, 150_000] })
    expect(niceScale(200_000)).toEqual({ top: 200_000, ticks: [100_000, 200_000] })
    expect(niceScale(7)).toEqual({ top: 7.5, ticks: [2.5, 5, 7.5] })
  })

  it("spaces axis labels so they don't collide", () => {
    expect(labelEvery(30, 28)).toBe(1)
    expect(labelEvery(10, 28)).toBe(5)
    expect(labelEvery(5, 28)).toBe(10)
    expect(labelEvery(0.01, 28)).toBe(1000)
  })

  it("scales heat by square root with a visible floor", () => {
    expect(heatLevel(0, 10)).toBe(0)
    expect(heatLevel(10, 10)).toBe(1)
    expect(heatLevel(1, 100)).toBeCloseTo(0.262)
    expect(heatLevel(50, 10)).toBe(1)
  })

  it("lists a few distinct tools", () => {
    expect(toolList([])).toBe("")
    expect(toolList(["Read", "Read", "Edit"])).toBe("Read, Edit")
    expect(toolList(["A", "B", "C", "D", "E"])).toBe("A, B, C +2")
  })
})

describe("tooltip", () => {
  const anchor = { x: 100, top: 50, bottom: 60 }

  it("centres above the anchor and clamps to the host", () => {
    expect(placeTip(anchor, 80, 40, 300, 200)).toEqual({ left: 60, top: 2, below: false })
    expect(placeTip({ ...anchor, x: 10 }, 80, 40, 300, 200).left).toBe(4)
    expect(placeTip({ ...anchor, x: 295 }, 80, 40, 300, 200).left).toBe(216)
  })

  it("centres in a host narrower than itself and flips below without room above", () => {
    expect(placeTip(anchor, 200, 40, 150, 200).left).toBe(-25)
    expect(placeTip(anchor, 80, 40, 300, 30)).toEqual({ left: 60, top: 68, below: true })
  })

  it("moves through a row and clamps at the ends", () => {
    const row = { kind: "row" } as const
    expect(nextIndex("ArrowRight", null, 5, row)).toBe(0)
    expect(nextIndex("ArrowLeft", null, 5, row)).toBe(4)
    expect(nextIndex("ArrowRight", 4, 5, row)).toBe(4)
    expect(nextIndex("ArrowLeft", 2, 5, row)).toBe(1)
    expect(nextIndex("ArrowDown", 2, 5, row)).toBeUndefined()
    expect(nextIndex("End", 0, 5, row)).toBe(4)
    expect(nextIndex("Home", 3, 5, row)).toBe(0)
    expect(nextIndex("ArrowRight", null, 0, row)).toBeUndefined()
  })

  it("moves by day and week through a column-major grid", () => {
    const grid = { kind: "grid", rows: 7 } as const
    expect(nextIndex("ArrowDown", 3, 56, grid)).toBe(4)
    expect(nextIndex("ArrowUp", 3, 56, grid)).toBe(2)
    expect(nextIndex("ArrowRight", 3, 56, grid)).toBe(10)
    expect(nextIndex("ArrowLeft", 3, 56, grid)).toBe(0)
    expect(nextIndex("ArrowRight", 52, 56, grid)).toBe(55)
  })
})
