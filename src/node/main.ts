import type { Activate, PluginNodeJsonValue } from "@qoder/plugin-api"
import { join } from "node:path"
import { SERVICE_NAME, type Range } from "../shared/types.js"
import { OverviewIndex } from "./overview.js"
import { resolveProjectsRoot, TranscriptLocator } from "./transcripts.js"

const RANGES: readonly Range[] = ["today", "7d", "30d"]

export const activate: Activate = (context) => {
  const locator = new TranscriptLocator(resolveProjectsRoot(context.product.id))
  const report = (event: string, error: unknown) =>
    context.diagnostics.emit({
      level: "warn",
      source: SERVICE_NAME,
      event,
      data: { error: error instanceof Error ? error.name : "unknown" },
    })
  const index = new OverviewIndex(locator, join(context.storagePath, "overview-cache.json"), report)

  context.subscriptions.push(
    context.api.node.registerService({
      name: SERVICE_NAME,
      methods: {
        overview: async (input) => {
          const range = RANGES.find((candidate) => candidate === input.range) ?? "7d"
          return json(await index.overview(range))
        },
      },
    }),
  )
}

function json(value: unknown): PluginNodeJsonValue {
  return value as PluginNodeJsonValue
}
