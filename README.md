# qoder-context

A Qoder Desktop App Plugin for context and token insight, in the spirit of
[dsh-context](https://github.com/bowenliang123/dsh-context) for DeepSeek Harness.

- **Context Insights** (sidebar, `workbench.sidebar.secondary`): KPIs for the picked range
  (sessions, billed tokens, cache-hit rate, turns, requests, tool runs), a 7-day usage chart, an
  8-week activity heatmap, the token composition, tool/skill/command tallies, and searchable session
  cards that open the session in Qoder. Clicking a heatmap day or a tally filters the cards.
- **Context** (per conversation, in the Task Monitor's "Context" section): turn/request/token/cache
  stats, the current context against the model window, a per-request stacked trend with compaction
  markers, context events (compactions, retries, errors), file activity, tools and commands.
  It refreshes every 15 s while visible.
- Charts show a tooltip on hover. Focus a chart (Tab) and use the arrow keys, Home and End to
  step through days or requests; in the heatmap, Up/Down move by day, Left/Right by week, and Enter
  filters by the focused day.

UI is in English and Simplified Chinese and follows the host language and theme.

## Where the data comes from

Qoder's plugin API does not expose transcripts, token usage or tool calls to plugins. This plugin's
Node layer therefore reads qodercli's local JSONL transcripts directly:

```
<config root>/projects/<cwd with / replaced by ->/<sessionId>.jsonl
<config root>/projects/<...>/<sessionId>/subagents/*.jsonl
```

`<config root>` is `~/.qoder` (or `~/.qoder-cn` for Qoder CN), overridable with `QODER_CONFIG_DIR` /
`QODERCN_CONFIG_DIR`. Desktop ChatSession IDs are the CLI session IDs, so a conversation maps to its
transcript file directly.

What is read:

| Figure | Source |
| --- | --- |
| Per-request tokens | `assistant.message.usage`, deduplicated by `message.id` |
| Prompt size | `input_tokens` (Qoder reports it inclusive of cache reads); when cache reads exceed it (Anthropic-style BYOK), prompt = input + cache read + cache creation |
| Context window | latest `runtime-config.contextWindow`, else derived from `usage.context_usage_ratio` |
| Compactions | `system/compact_boundary` with `compactMetadata` |
| Turns | user entries with `humanInput` (slash-command turns are meta entries that still carry it) |
| Tools, commands, files, skills | `tool_use` blocks (`Bash`/`Monitor` commands with heredoc bodies, quoted strings and shell keywords ignored; `Read`/`Edit`/`Write` paths; `Skill`), plus "Skill … activated" notices |

Limits worth knowing:

- Subagent transcripts count toward totals but not toward the current context or the trend.
- Composition is cached prompt / uncached prompt / output. The system prompt, tool schemas and
  injected context are not written to disk, so a per-category split would need a host API.
- Range KPIs are bucketed by each request's local day. Tool, skill and command tallies cover the
  whole life of sessions active in the range.
- No cost estimate: most Qoder models are `auto` or credit-based, with no per-token list price.
- Remote SSH sessions keep their transcripts on the remote host and are not shown.
- Overview data is cached in the plugin's `storagePath` (`overview-cache.json`), keyed by each
  transcript's size and mtime; only transcripts touched in the last 8 weeks are scanned.

## Build

```sh
npm install
npm run check      # typecheck + unit tests + build
npm run build      # dist/node/main.cjs, dist/browser/{insights,session}.cjs
```

## Install into a local Qoder

Unpackaged (dev) Qoder loads unverified plugins from `QODER_APP_PLUGIN_DEV_DIRS` or from
`<config root>/app/dev-extensions/`:

```sh
npm run link-dev           # symlink this repo into ~/.qoder/app/dev-extensions/context-insights
npm run unlink-dev
# or, without touching ~/.qoder:
QODER_APP_PLUGIN_DEV_DIRS=$PWD npm run dev   # from ~/Projects/qoder
```

The dev Desktop needs the Qoder checkout's dependencies current (`npm ci` under Node 22, as pinned
by its `engines`) and a sign-in in the dev window; the dev instance keeps its own sessions, so start a
conversation there to see the per-session view.

A packaged Qoder only loads them when started with `QODER_APP_PLUGIN_ALLOW_UNVERIFIED=true`:

```sh
QODER_APP_PLUGIN_ALLOW_UNVERIFIED=true QODER_APP_PLUGIN_DEV_DIRS=$PWD \
  /Applications/Qoder.app/Contents/MacOS/Qoder
```

Then open **Context Insights** from the lower-left sidebar. In a conversation, open the Task
Monitor: the **Context** section lists this session's context usage; click it to open the view.

## Layout

```
.qoder-app-plugin/plugin.json  manifest: views, sidebar entry, session resource, permissions
assets/context.svg             sidebar icon (rendered as a mask in the host colour)
src/node/                      transcript locator + fold, overview index, service and provider
src/browser/                   React views (host-provided React and design system), i18n, charts
src/shared/                    types and helpers shared by both sides
types/qoder-host.d.ts          the subset of @qoder/plugin-api and design-system types used here
tests/unit/                    fold and aggregation tests on synthetic transcripts
```

Permissions: `node.callService`, `session.provideResources`, `chat.revealLocalSession`.

Theming: packaged Qoder hashes its CSS variable names (`--color-text` does not exist at runtime), so
views derive their palette from the host's computed text and background colours and follow theme
switches through a `MutationObserver`; only `Button` and `Input` come from the host design system.

## Not yet covered

Compared with dsh-context: a context browser for each request's contents, a Fleet view for the
agent family, a `/context` modal, preferences, and a system prompt prefix/suffix. A modal slash
command and the prompt prefix/suffix need host capabilities that App Plugins don't have today.
