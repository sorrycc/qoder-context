import { describe, expect, it } from "vitest"
import { easeOutCubic, enter, tween } from "../../src/browser/motion.js"
import { STYLES } from "../../src/browser/styles.js"
import { luminance, parseRgb, schemeOf } from "../../src/browser/theme.js"
import { contextTone, formatCount } from "../../src/browser/ui.js"

describe("theme", () => {
  it("parses computed rgb colours in comma and space syntax", () => {
    expect(parseRgb("rgb(30, 30, 30)")).toEqual([30, 30, 30, 1])
    expect(parseRgb("rgba(255, 255, 255, 0)")).toEqual([255, 255, 255, 0])
    expect(parseRgb("rgb(10 20 30 / 50%)")).toEqual([10, 20, 30, 0.5])
    expect(parseRgb("Canvas")).toBeNull()
  })

  it("measures luminance from black to white", () => {
    expect(luminance([0, 0, 0])).toBe(0)
    expect(luminance([255, 255, 255])).toBeCloseTo(1)
  })

  it("judges the scheme from the surface, then the text colour", () => {
    expect(schemeOf("rgb(24, 24, 27)", "rgb(230, 230, 230)")).toBe("dark")
    expect(schemeOf("rgb(255, 255, 255)", "rgb(20, 20, 20)")).toBe("light")
    expect(schemeOf("Canvas", "rgb(230, 230, 230)")).toBe("dark")
    expect(schemeOf("rgba(0, 0, 0, 0)", "rgb(20, 20, 20)")).toBe("light")
    expect(schemeOf("Canvas", "CanvasText")).toBe("light")
  })
})

describe("motion", () => {
  it("eases out and clamps progress", () => {
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875)
    expect(easeOutCubic(2)).toBe(1)
  })

  it("tweens between values and lands exactly on the target", () => {
    expect(tween(0, 100, 0)).toBe(0)
    expect(tween(100, 0, 0.5)).toBeCloseTo(12.5)
    expect(tween(3, 7, 1)).toBe(7)
    expect(tween(3, 7, 1.4)).toBe(7)
  })

  it("caps the stagger index", () => {
    expect(enter(3)).toEqual({ "--qc-i": 3 })
    expect(enter(40)).toEqual({ "--qc-i": 12 })
    expect(enter(40, 16)).toEqual({ "--qc-i": 16 })
  })

  it("pairs every per-view style block with an end marker, without nesting", () => {
    const markers = [...STYLES.matchAll(/\/\* @(view \w+|end) \*\//g)].map((match) => (match[1] === "end" ? "end" : "view"))
    expect(markers.length).toBeGreaterThan(0)
    expect(markers.every((marker, index) => marker === (index % 2 === 0 ? "view" : "end"))).toBe(true)
    expect(markers.length % 2).toBe(0)
  })

  it("drops motion under prefers-reduced-motion", () => {
    expect(STYLES).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/)
  })
})

describe("ui", () => {
  it("tones the context window by fill", () => {
    expect([contextTone(null), contextTone(0.5), contextTone(0.8), contextTone(0.97)]).toEqual(["neutral", "neutral", "warning", "danger"])
  })

  it("rounds tweened counts", () => {
    expect(formatCount(null)).toBe("—")
    expect(formatCount(41.6)).toBe((42).toLocaleString())
  })
})
