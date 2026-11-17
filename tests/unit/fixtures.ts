export const T0 = Date.parse("2026-03-10T10:00:00Z")

export function at(minutes: number): string {
  return new Date(T0 + minutes * 60_000).toISOString()
}

export function human(text: string, minutes: number, extra: Record<string, unknown> = {}) {
  return {
    type: "user",
    timestamp: at(minutes),
    cwd: "/work/demo",
    gitBranch: "main",
    humanInput: { text },
    message: { role: "user", content: text },
    ...extra,
  }
}

export function assistant(
  id: string,
  minutes: number,
  content: unknown[],
  usage?: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return {
    type: "assistant",
    timestamp: at(minutes),
    message: { id, model: "dfmodel", role: "assistant", content, ...(usage ? { usage } : {}) },
    ...extra,
  }
}

export function toolUse(id: string, name: string, input: Record<string, unknown>) {
  return { type: "tool_use", id, name, input }
}

export function toolResult(toolUseId: string, minutes: number, isError = false) {
  return {
    type: "user",
    timestamp: at(minutes),
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: toolUseId, is_error: isError, content: "x" }] },
  }
}
