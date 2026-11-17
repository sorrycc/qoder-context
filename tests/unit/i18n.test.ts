import { describe, expect, it } from "vitest"
import { createTranslate } from "../../src/browser/i18n.js"
import { formatTokens, shortPath } from "../../src/shared/format.js"

describe("createTranslate", () => {
  it("picks Chinese for any zh locale and English otherwise, filling placeholders", () => {
    expect(createTranslate("zh-CN")("turnsShort", { count: 3 })).toBe("3 轮")
    expect(createTranslate("zh-HK")("insightsTitle")).toBe("上下文洞察")
    expect(createTranslate("ko-KR")("turnsShort", { count: 3 })).toBe("3 turns")
  })

  it("picks English plural forms by count and keeps Chinese counts unchanged", () => {
    const en = createTranslate("en")
    expect([0, 1, 2].map((count) => en("turnsShort", { count }))).toEqual(["0 turns", "1 turn", "2 turns"])
    expect(en("kpiFailSub", { failed: 0, count: 1 })).toBe("0 of 1 run")
    expect(en("requestsLeft", { count: 1 })).toBe("At this pace, about 1 more request fits before the window is full.")
    expect(createTranslate("zh-CN")("timingModelSub", { count: 1 })).toBe("1 次请求")
  })

  it("groups counts in the host locale but leaves request numbers alone", () => {
    const en = createTranslate("en-US")
    expect(en("scanned", { count: 12_345 })).toBe("12,345 transcripts scanned")
    expect(en("request", { index: 1234 })).toBe("Request #1234")
    expect(en("compactionDetail", { pre: "120k", post: "30k", duration: "4s" })).toBe("120k → 30k · 4s")
  })
})

describe("format", () => {
  it("abbreviates token counts", () => {
    expect([formatTokens(950), formatTokens(30_100), formatTokens(1_000_000), formatTokens(113_400_000)]).toEqual([
      "950",
      "30.1k",
      "1M",
      "113M",
    ])
  })

  it("shortens home-relative paths", () => {
    expect(shortPath("/Users/me/Projects/app")).toBe("~/Projects/app")
    expect(shortPath("/home/me")).toBe("~")
    expect(shortPath("/opt/work")).toBe("/opt/work")
  })
})
