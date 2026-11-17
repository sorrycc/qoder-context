import { describe, expect, it } from "vitest"
import { createTranslate } from "../../src/browser/i18n.js"
import { formatTokens, shortPath } from "../../src/shared/format.js"

describe("createTranslate", () => {
  it("picks Chinese for any zh locale and English otherwise, filling placeholders", () => {
    expect(createTranslate("zh-CN")("turnsShort", { count: 3 })).toBe("3 轮")
    expect(createTranslate("zh-HK")("insightsTitle")).toBe("上下文洞察")
    expect(createTranslate("ko-KR")("turnsShort", { count: 3 })).toBe("3 turns")
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
