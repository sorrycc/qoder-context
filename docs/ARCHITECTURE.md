# Architecture

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
| Credits | the same `usage`: `credits` (after discounts), `original_credits`, and `billable: false` counted as 0. Requests without `credits` (`auto`, transcripts from before August 2026) count as not metered, and the views say how many were |
| Prompt size | `input_tokens` (Qoder reports it inclusive of cache reads); when cache reads exceed it (Anthropic-style BYOK), prompt = input + cache read + cache creation |
| Context window | latest `runtime-config.contextWindow`, else derived from `usage.context_usage_ratio` |
| Compactions | `system/compact_boundary` with `compactMetadata` |
| Turns | user entries with `humanInput` (slash-command turns are meta entries that still carry it) |
| Model / tool time | entry timestamps: a reply's time minus the prompt or tool result before it; a reply's tool calls until their last result; compactions' reported `durationMs`. Waits for the user and gaps over an hour aren't counted |
| Command outcomes | the Bash/Monitor `tool_result` (`is_error`) and its `toolUseResult` (`exitCode`, `interrupted`, `kind: backgrounded/cancelled`); a non-zero exit the tool explains (grep's "No matches found") counts as success |
| Tools, commands, files, skills | `tool_use` blocks (`Bash`/`Monitor` commands with heredoc bodies, quoted strings and shell keywords ignored; `Read`/`Edit`/`Write` paths; `Skill`), plus "Skill … activated" notices; tallies are kept per day |
| Search hits | the `filenames` of `Grep`/`Glob` results (relative ones resolved against the session folder), up to 50 per result |
| Context events | `attachment` entries: skill list, loaded skills, memories, hook output and messages, MCP instructions and tools, attached and restored files, the agent list (size estimated from their text); `plan_mode` / `plan_mode_exit` / `auto_mode` / `auto_mode_exit`; changes of `runtime-config` `model` or `reasoningEffort` |
| Request brief | `humanInput.text` of each turn, the start of each reply's text, and whether a request followed your message, tool results, a compaction or something else |
| Context composition | estimated from the main transcript since the last compaction: message text, attachments, thinking, tool inputs and results (about four characters a token, nearer one for CJK). The system prompt and tool schemas aren't on disk, so they get the rest of the prompt; see below for Qoder's own meter |
| Subagents | `<session>/subagents/agent-<id>.jsonl` for usage, its `.meta.json` (type, task, the launching tool call) and `task-*.json` (status, model, final report); launchers come from which transcript issued that `Agent`/`Task` call |

Limits worth knowing:

- Subagent transcripts count toward totals and the Subagents card but not toward the current context
  or the trend.
- Context composition is an estimate. When Qoder Desktop has measured the session, the view reads the
  latest snapshot of its own context meter (shares of the window for the system prompt, tool schemas,
  skills and messages) from the app's database (`main.sqlite`, table `chat_session_context_usage`,
  two folders above the plugin's `storagePath`), read-only through `node:sqlite`, and uses it for the
  system prompt, tools and skills. That table is private to Qoder and not part of the plugin API: when
  the module, file, table, row or shape isn't there, the view falls back to the estimate. Only the
  latest snapshot per session exists, so it can lag the transcript.
- Range KPIs and tallies are bucketed by each request's or run's local day.
- Credits are what each request reported, not a bill: Qoder's own billing is the reference, and
  requests that report none aren't counted. There is no money estimate, since Qoder models have no
  per-token list price. Account quota isn't available to plugins.
- Remote SSH sessions keep their transcripts on the remote host and are not shown.
- Overview data is cached in the plugin's `storagePath` (`overview-cache.json`), keyed by each
  transcript's size and mtime; only transcripts touched in the last 8 weeks are scanned.

## Performance

- Transcripts are append-only, so the folds of the most recently read ones (shared by the overview
  and the session view) remember how far each file was read; a grown transcript only reads its new
  bytes. A file that shrank or was rewritten is folded again from the start.
- Files are read in 256 KB chunks, so a large history never holds the host's event loop for long.
- A project folder's listing is reused while its mtime is unchanged, so a refresh costs a stat per
  folder and transcript rather than a readdir per folder.
- Both services answer `unchanged` for the version the view already holds; the view then keeps its
  data objects and nothing re-renders.
- Active time and shell outcomes are bucketed per day inside each cached session summary, so the
  overview sums them per range without re-reading a transcript.
- Each view's bundle ships only its own CSS (blocks marked `@view` in `styles.ts` are stripped from
  the other view at build time) and only the messages it uses: the build keeps an `i18n.ts` entry
  when its key appears as a string literal in that view's sources, and refuses `as MessageKey` casts
  that would hide a key.
- Measured with `npm run bench` on 404 local transcripts (Apple Silicon, median of 5 runs):

  | Measure | Time |
  | --- | ---: |
  | Overview, cold (no cache) | 459 ms |
  | Overview, warm (disk cache) | 72 ms |
  | Overview, hot (in memory) | 20 ms |
  | Session fold, 15 MB transcript | 37 ms |
  | Session poll, unchanged or one line appended | ≤ 1 ms |

  The longest event-loop stall in any of these was 2 ms. Per-day tallies make the disk cache
  (683 KB here) and the overview (56 KB for today, 147 KB for 30 days) larger than a plain range
  total would. Bundles: `insights.cjs` 77 KB, `session.cjs` 128 KB, `main.cjs` 65 KB (minified,
  React and the design system come from the host).
- `npm run bench` measures the scan, polls, payloads and bundle sizes against your own transcripts
  (`node scripts/bench.mjs --root <projects dir> --runs 5` to point it elsewhere).

## Source layout

```
.qoder-app-plugin/plugin.json  manifest: views, sidebar entry, session resource, permissions
assets/context.svg             sidebar icon (rendered as a mask in the host colour)
src/node/                      transcript locator + fold, overview index, service and provider,
                               read-only reader of Qoder's saved context meter (host-usage.ts)
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

Compared with dsh-context: a context browser for each request's contents, the Fleet view's
collaboration timeline and team tasks, a `/context` modal, preferences, and a system prompt
prefix/suffix. A modal slash command and the prompt prefix/suffix need host capabilities that App
Plugins don't have today, and an exact per-category composition needs Qoder to share its context meter
with plugins (see Limits).
