import { describe, expect, it } from "vitest"
import { commandOutcome, commandPrograms, editLines, RIBBON_SLICES, SessionFold } from "../../src/node/fold.js"
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
      { path: "/work/demo/a.ts", reads: 1, writes: 1, added: 0, removed: 0, lastAt: Date.parse(at(3)) },
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

describe("command runs", () => {
  it("records each shell run with its outcome, wall time, request and turn", () => {
    const detail = fold([
      human("go", 0),
      assistant("m1", 1, [toolUse("t1", "Bash", { command: "  npm test  " }), toolUse("t2", "Read", { file_path: "/a" })], {
        input_tokens: 10,
        output_tokens: 1,
      }),
      { ...toolResult("t1", 3, true), toolUseResult: { kind: "completed", exitCode: 2 } },
      assistant("m2", 4, [toolUse("t3", "Bash", { command: "grep x y" })], { input_tokens: 20, output_tokens: 1 }),
      { ...toolResult("t3", 4.5), toolUseResult: { kind: "completed", exitCode: 1, returnCodeInterpretation: "No matches found" } },
      assistant("m3", 5, [toolUse("t4", "Bash", { command: "sleep 99" })], { input_tokens: 30, output_tokens: 1 }),
      assistant("m4", 6, [toolUse("t5", "Bash", { command: "npm run dev" })], { input_tokens: 40, output_tokens: 1 }),
    ]).detail()
    expect(detail.commands.map(({ command, status, exitCode, durationMs, requestIndex, turn, programs }) => ({ command, status, exitCode, durationMs, requestIndex, turn, programs }))).toEqual([
      { command: "npm test", status: "failed", exitCode: 2, durationMs: 120_000, requestIndex: 0, turn: 1, programs: ["npm"] },
      { command: "grep x y", status: "ok", exitCode: 1, durationMs: 30_000, requestIndex: 1, turn: 1, programs: ["grep"] },
      // No result and a later request moved on: it was cut off.
      { command: "sleep 99", status: "cancelled", exitCode: null, durationMs: null, requestIndex: 2, turn: 1, programs: ["sleep"] },
      { command: "npm run dev", status: "running", exitCode: null, durationMs: null, requestIndex: 3, turn: 1, programs: ["npm"] },
    ])
  })

  it("reads background, cancelled and failed outcomes from the tool result", () => {
    expect(commandOutcome({ kind: "backgrounded", taskId: "b1" }, false)).toEqual({ status: "background", exitCode: null })
    expect(commandOutcome({ taskId: "m1", persistent: true }, false)).toEqual({ status: "background", exitCode: null })
    expect(commandOutcome({ kind: "cancelled", isHardFailure: true }, true)).toEqual({ status: "cancelled", exitCode: null })
    expect(commandOutcome({ kind: "tool-status", status: "cancelled" }, true)).toEqual({ status: "cancelled", exitCode: null })
    expect(commandOutcome({ kind: "completed", exitCode: 0, interrupted: true }, false)).toEqual({ status: "cancelled", exitCode: 0 })
    expect(commandOutcome(null, true)).toEqual({ status: "failed", exitCode: null })
    expect(commandOutcome({ kind: "completed", exitCode: 0 }, false)).toEqual({ status: "ok", exitCode: 0 })
  })

  it("counts finished runs and failures on the day each run started", () => {
    const days = fold([
      human("go", 0),
      assistant("m1", 1, [toolUse("t1", "Bash", { command: "npm test" }), toolUse("t2", "Bash", { command: "ls" }), toolUse("t3", "Bash", { command: "npm run dev" })], {
        input_tokens: 10,
        output_tokens: 1,
      }),
      { ...toolResult("t1", 2, true), toolUseResult: { kind: "completed", exitCode: 1 } },
      { ...toolResult("t2", 2), toolUseResult: { kind: "completed", exitCode: 0 } },
      { ...toolResult("t3", 2), toolUseResult: { kind: "backgrounded", taskId: "b" } },
    ]).summary().days
    expect(days).toMatchObject([{ shellRuns: 2, shellFailures: 1 }])
  })

  it("marks subagent runs and gives them no main request", () => {
    const detail = fold([human("go", 0)], [[assistant("s1", 1, [toolUse("t1", "Bash", { command: "ls" })], { input_tokens: 5 }, { isSidechain: true }), toolResult("t1", 2)]]).detail()
    expect(detail.commands).toMatchObject([{ command: "ls", status: "ok", subagent: true, requestIndex: null }])
  })
})

describe("timing", () => {
  it("splits active time into model waits, tool runs and compactions, skipping idle gaps", () => {
    const detail = fold([
      human("go", 0),
      assistant("m1", 1, [toolUse("t1", "Bash", { command: "make" })], { input_tokens: 10, output_tokens: 600 }),
      toolResult("t1", 3),
      assistant("m2", 4, [{ type: "text", text: "done" }], { input_tokens: 20, output_tokens: 60 }),
      // The user is away for two hours: not active time.
      human("again", 124),
      {
        type: "system",
        subtype: "compact_boundary",
        timestamp: at(126),
        compactMetadata: { trigger: "manual", preTokens: 20, postTokens: 5, durationMs: 60_000 },
      },
      assistant("m3", 127, [], { input_tokens: 5, output_tokens: 10 }),
    ]).detail()
    const minute = 60_000
    expect(detail.timing).toMatchObject({ modelMs: 3 * minute, toolMs: 2 * minute, compactMs: minute, timedOutput: 670 })
    expect(detail.requests.map((request) => request.latencyMs)).toEqual([minute, minute, minute])
    const ribbon = detail.timing.ribbon
    expect(ribbon).toHaveLength(RIBBON_SLICES)
    const sum = (kind: "model" | "tool" | "compact") => ribbon.reduce((total, cell) => total + cell[kind], 0)
    expect([sum("model"), sum("tool"), sum("compact")]).toEqual([3 * minute, 2 * minute, minute])
    // Oldest first: the run opens on model time; the compaction fills the fifth of six minutes.
    expect(ribbon[0]).toMatchObject({ model: 6 * minute / RIBBON_SLICES, tool: 0 })
    expect(ribbon.at(-17)!.compact).toBeGreaterThan(0)
  })

  it("fills every ribbon slice when spans end on awkward boundaries", () => {
    const entries: unknown[] = [human("go", 0)]
    // Seven-second spans never line up with the slice width.
    for (let index = 0; index < 400; index += 1) {
      entries.push(assistant(`m${index}`, (index * 2 + 1) * (7 / 60), [], { input_tokens: 10, output_tokens: 1 }))
      entries.push(human("more", (index * 2 + 2) * (7 / 60)))
    }
    const ribbon = fold(entries).detail().timing.ribbon
    expect(ribbon.every((cell) => cell.model > 0)).toBe(true)
  })

  it("adds active time to the day its spans start", () => {
    const summary = fold([
      human("go", 0),
      assistant("m1", 1, [toolUse("t1", "Bash", { command: "ls" })], { input_tokens: 10, output_tokens: 1 }),
      toolResult("t1", 3),
      assistant("m2", 4, [], { input_tokens: 20, output_tokens: 1 }),
    ]).summary()
    // model 0→1 and 3→4, tools 1→3
    expect(summary.days).toMatchObject([{ activeMs: 4 * 60_000 }])
  })

  it("leaves the timing empty without timestamps", () => {
    const session = new SessionFold("s")
    session.add({ type: "assistant", message: { id: "m", usage: { input_tokens: 1 } } })
    expect(session.detail().timing).toEqual({ modelMs: 0, toolMs: 0, compactMs: 0, timedOutput: 0, ribbon: [] })
  })
})

describe("editLines", () => {
  it("counts only the lines an edit changes", () => {
    expect(editLines("Edit", { old_string: "a\nb\nc", new_string: "a\nB\nB2\nc" })).toEqual({ added: 2, removed: 1 })
    expect(editLines("Edit", { old_string: "x", new_string: "" })).toEqual({ added: 0, removed: 1 })
  })

  it("sums MultiEdit edits and counts a whole-file write as added", () => {
    expect(
      editLines("MultiEdit", {
        edits: [
          { old_string: "a", new_string: "b" },
          { old_string: "c", new_string: "c\nd" },
        ],
      }),
    ).toEqual({ added: 2, removed: 1 })
    expect(editLines("Write", { content: "one\ntwo\n" })).toEqual({ added: 2, removed: 0 })
    expect(editLines("Write", {})).toEqual({ added: 0, removed: 0 })
  })

  it("adds an edit's lines to its file's activity", () => {
    const files = fold([
      human("go", 0),
      assistant("m1", 1, [toolUse("t1", "Edit", { file_path: "/a", old_string: "x", new_string: "y\nz" }), toolUse("t2", "Write", { file_path: "/a", content: "q" })], {
        input_tokens: 10,
      }),
    ]).detail().files
    expect(files).toMatchObject([{ path: "/a", writes: 2, added: 3, removed: 1 }])
  })
})

describe("commandPrograms", () => {
  it("ignores script text inside heredocs and quoted strings", () => {
    expect(commandPrograms("cat > a.ts <<'EOF'\nconst x = 1\nEOF\nnode -e 'const y = 2\nconsole.log(y)' | grep \"a|b\"")).toEqual([
      "cat",
      "node",
      "grep",
    ])
  })

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
