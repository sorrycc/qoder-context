import { describe, expect, it } from "vitest"
import { commandPrograms, SessionFold } from "../../src/node/fold.js"
import { assistant, at, human, toolResult, toolUse } from "./fixtures.js"

function fold(entries: unknown[], subagents: unknown[][] = []) {
  const session = new SessionFold("session-0001")
  for (const entry of entries) session.add(entry)
  for (const child of subagents) {
    session.beginSubagent()
    for (const entry of child) session.add(entry, true)
  }
  return session
}

describe("SessionFold", () => {
  it("counts one request per response even when usage is split across entries", () => {
    const summary = fold([
      human("hi", 0),
      assistant("m1", 1, [{ type: "thinking", thinking: "..." }]),
      assistant("m1", 1, [{ type: "text", text: "hello" }], {
        input_tokens: 1_000,
        cache_read_input_tokens: 800,
        output_tokens: 50,
        context_usage_ratio: 0.001,
      }),
      assistant("m1", 1, [{ type: "text", text: "dup" }], { input_tokens: 1_000, output_tokens: 50 }),
    ]).summary()
    expect(summary.requests).toBe(1)
    expect(summary.tokens).toEqual({ prompt: 1_000, cacheRead: 800, cacheCreate: 0, output: 50 })
    expect(summary.contextTokens).toBe(1_000)
    expect(summary.contextWindow).toBe(1_000_000)
    expect(summary.turns).toBe(1)
  })

  it("treats cache reads above input as exclusive usage and adds them to the prompt", () => {
    const summary = fold([
      assistant("m1", 1, [], { input_tokens: 10, cache_read_input_tokens: 900, cache_creation_input_tokens: 90, output_tokens: 5 }),
    ]).summary()
    expect(summary.tokens.prompt).toBe(1_000)
    expect(summary.contextTokens).toBe(1_000)
  })

  it("prefers the configured context window over the derived one", () => {
    const summary = fold([
      { type: "runtime-config", contextWindow: 200_000, model: "dfmodel", timestamp: Date.parse(at(0)) },
      assistant("m1", 1, [], { input_tokens: 100, context_usage_ratio: 0.0001 }),
    ]).summary()
    expect(summary.contextWindow).toBe(200_000)
  })

  it("tallies tools, commands, skills, files and tool errors once per tool use", () => {
    const session = fold([
      human("go", 0),
      assistant("m1", 1, [
        toolUse("t1", "Bash", { command: "cd /x && FOO=1 npm test | tee out.log" }),
        toolUse("t2", "Read", { file_path: "/work/demo/a.ts" }),
      ]),
      assistant("m1", 1, [toolUse("t1", "Bash", { command: "cd /x && npm test" })], { input_tokens: 10, output_tokens: 1 }),
      toolResult("t1", 2, true),
      assistant("m2", 3, [toolUse("t3", "Edit", { file_path: "/work/demo/a.ts" }), toolUse("t4", "Skill", { skill: "review" })], {
        input_tokens: 20,
        output_tokens: 1,
      }),
      { type: "system", subtype: "informational", content: "Skill **deploy** activated.", timestamp: at(4) },
    ])
    const summary = session.summary()
    expect(summary.toolRuns).toBe(4)
    expect(summary.toolErrors).toBe(1)
    expect(Object.fromEntries(summary.commands.map((tally) => [tally.name, tally.count]))).toEqual({ npm: 1, tee: 1 })
    expect(summary.skills.map((tally) => tally.name).sort()).toEqual(["deploy", "review"])
    expect(session.detail().files).toEqual([
      { path: "/work/demo/a.ts", reads: 1, writes: 1, lastAt: Date.parse(at(3)) },
    ])
    expect(session.detail().requests.map((request) => request.tools)).toEqual([["Bash", "Read"], ["Edit", "Skill"]])
  })

  it("records compactions as events and resets the current context to the compacted size", () => {
    const session = fold([
      assistant("m1", 1, [], { input_tokens: 90_000, output_tokens: 10 }),
      {
        type: "system",
        subtype: "compact_boundary",
        timestamp: at(2),
        compactMetadata: { trigger: "auto", preTokens: 90_000, postTokens: 4_000, durationMs: 1_500 },
      },
    ])
    expect(session.summary().compactions).toBe(1)
    expect(session.summary().contextTokens).toBe(4_000)
    expect(session.detail().events).toEqual([
      { kind: "compaction", at: Date.parse(at(2)), trigger: "auto", preTokens: 90_000, postTokens: 4_000, durationMs: 1_500, requestIndex: 1 },
    ])
  })

  it("adds subagent usage to totals without changing the main context or trend", () => {
    const session = fold(
      [human("go", 0), assistant("m1", 1, [], { input_tokens: 100, output_tokens: 10 })],
      [[assistant("s1", 2, [toolUse("t9", "Grep", { pattern: "x" })], { input_tokens: 5_000, output_tokens: 20 }, { isSidechain: true })]],
    )
    const summary = session.summary()
    expect(summary.subagents).toBe(1)
    expect(summary.requests).toBe(2)
    expect(summary.tokens.prompt).toBe(5_100)
    expect(summary.contextTokens).toBe(100)
    expect(summary.toolRuns).toBe(1)
    expect(session.detail().requests).toHaveLength(1)
  })

  it("counts slash-command turns, ignores entries without humanInput and malformed lines", () => {
    const summary = fold([
      null,
      "x",
      { type: 3 },
      human("/digest", 0, { isMeta: true }),
      { type: "user", isMeta: true, humanInput: null, message: { content: "notification" } },
    ]).summary()
    expect(summary.turns).toBe(1)
    expect(summary.requests).toBe(0)
  })

  it("keeps the user's custom title over the generated one", () => {
    const summary = fold([
      { type: "ai-title", aiTitle: "Generated" },
      { type: "custom-title", customTitle: "Mine" },
    ]).summary()
    expect(summary.title).toBe("Mine")
  })
})

describe("commandPrograms", () => {
  it("skips shell keywords so loops don't show up as programs", () => {
    expect(commandPrograms("for f in *.md; do wc -l $f; done")).toEqual(["wc"])
  })

  it("returns distinct programs across chained segments, skipping cd, env assignments and wrappers", () => {
    expect(commandPrograms("cd a && A=1 sudo git status; ls -la | grep x\n/usr/bin/env node s.js")).toEqual([
      "git",
      "ls",
      "grep",
      "node",
    ])
  })
})
