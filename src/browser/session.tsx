import { Button } from "@qoder-space/design-system"
import type { PluginViewContext } from "@qoder/plugin-api/view"
import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react"
import { formatPercent, formatTokens, shortPath } from "../shared/format.js"
import {
  SERVICE_NAME,
  type CommandRun,
  type CommandStatus,
  type ContextEvent,
  type FileActivity,
  type SessionDetail,
  type SessionResponse,
  type Tally,
  type TimingStats,
} from "../shared/types.js"
import { ContextRing, formatElapsed, Legend, RequestTrend, SERIES, StackBar, type TrendMode } from "./charts.js"
import { registerView, useLoad } from "./host.js"
import { clockTime, dateTime, formatDuration, relativeTime, type MessageKey, type Translate } from "./i18n.js"
import { highlight, searchTerms, TALLY_CAP } from "./lists.js"
import { enter, prefersReducedMotion } from "./motion.js"
import {
  contextGauge,
  displayCommand,
  eventRequest,
  isSlow,
  runFacts,
  SLOW_MS,
  splitPath,
  timeline,
  timingParts,
  visibleRuns,
  type Gauge,
  type RunFilter,
  type RunSort,
  type TimelineItem,
  type TimingPart,
} from "./session-model.js"
import { TipBody, Tooltip, useChartTip, useHoverTip } from "./tooltip.js"
import {
  AnimatedNumber,
  CappedList,
  Card,
  contextTone,
  EmptyState,
  formatCount,
  Icon,
  Kpi,
  KpiSkeletons,
  Segmented,
  Skeleton,
  Spinner,
  useDebounced,
  useNow,
  type IconName,
} from "./ui.js"

type Loaded = Exclude<SessionResponse, { status: "unchanged" }>
type Ok = Extract<SessionResponse, { status: "ok" }>

const POLL_MS = 15_000
/** Events shown before "Show all". */
const EVENT_CAP = 5
const TRIGGERS: Record<"manual" | "auto" | "unknown", MessageKey> = { manual: "triggerManual", auto: "triggerAuto", unknown: "triggerUnknown" }

registerView((context, t) => <SessionContext context={context} t={t} />, { compact: true })

function SessionContext({ context, t }: { readonly context: PluginViewContext; readonly t: Translate }) {
  const sessionId = context.sourceSessionId
  // The last full response for this session; polls send its version and get "unchanged" back while
  // the transcript is untouched, so the view keeps the same objects and nothing below re-renders.
  const last = useRef<{ readonly sessionId: typeof sessionId; readonly response: Ok } | null>(null)
  const response = useLoad(
    context,
    async (): Promise<{ readonly response: Loaded; readonly checkedAt: number }> => {
      const known = last.current?.sessionId === sessionId ? last.current.response : null
      const call = (version?: string) =>
        context.api.node.callService(SERVICE_NAME, "session", { ...(sessionId ? { sessionId } : {}), ...(version ? { version } : {}) }, { timeoutMs: 60_000 }) as unknown as Promise<SessionResponse>
      let result = await call(known?.version)
      if (result.status === "unchanged") result = known ?? (await call())
      if (result.status === "unchanged") throw new Error("unexpected unchanged response")
      last.current = result.status === "ok" ? { sessionId, response: result } : null
      return { response: result, checkedAt: Date.now() }
    },
    sessionId ?? "",
    POLL_MS,
  )
  const data = response.data?.response
  const detail = data?.status === "ok" ? data.detail : null

  return (
    <>
      <Header
        detail={detail}
        checkedAt={response.data?.checkedAt ?? null}
        loading={response.loading}
        failed={response.error && data !== undefined}
        onRefresh={response.reload}
        t={t}
      />
      {response.error && !data ? (
        <EmptyState
          icon="alert"
          title={t("loadFailed")}
          hint={t("loadFailedHint")}
          action={
            <Button variant="secondary" size="sm" onClick={response.reload}>
              {t("retry")}
            </Button>
          }
        />
      ) : !data ? (
        <Placeholder />
      ) : data.status !== "ok" ? (
        data.status === "unbound" ? (
          <EmptyState icon="gauge" title={t("unbound")} />
        ) : (
          <EmptyState icon="inbox" title={t("missing")} hint={t("missingHint")} />
        )
      ) : (
        <Detail detail={data.detail} t={t} />
      )}
    </>
  )
}

function Placeholder() {
  return (
    <div aria-hidden="true">
      <div className="qc-grid qc-hero">
        <Skeleton height={176} />
        <KpiSkeletons count={8} />
      </div>
      <Skeleton height={226} />
      <div className="qc-grid qc-pairs" style={{ marginTop: "var(--qc-space-3)" }}>
        <Skeleton height={180} />
        <Skeleton height={180} />
      </div>
      <Skeleton height={260} />
    </div>
  )
}

function Header({
  detail,
  checkedAt,
  loading,
  failed,
  onRefresh,
  t,
}: {
  readonly detail: SessionDetail | null
  readonly checkedAt: number | null
  readonly loading: boolean
  readonly failed: boolean
  readonly onRefresh: () => void
  readonly t: Translate
}) {
  const now = useNow(10_000)
  const summary = detail?.summary
  const tip = useChartTip()
  const hover = useHoverTip(tip, 300)
  const facts = summary
    ? ([
        summary.cwd ? { icon: "folder", label: t("factFolder"), short: shortPath(summary.cwd), full: summary.cwd } : null,
        summary.model ? { icon: "chip", label: t("factModel"), short: summary.model, full: summary.model } : null,
        summary.gitBranch ? { icon: "branch", label: t("factBranch"), short: summary.gitBranch, full: summary.gitBranch } : null,
      ].filter(Boolean) as { icon: IconName; label: string; short: string; full: string }[])
    : []
  const active = tip.active === null ? undefined : facts[tip.active]
  return (
    <header className="qc-head qc-session-head">
      <div className="qc-head-text">
        <h1 className="qc-name">{summary?.title ?? t("sessionTitle")}</h1>
        {facts.length > 0 ? (
          <div className="qc-tip-host qc-facts" ref={tip.hostRef} {...hover}>
            {facts.map((fact, index) => (
              <span key={fact.icon} className="qc-fact" tabIndex={0} data-qc-tip={index} aria-describedby={tip.id}>
                <Icon name={fact.icon} size={12} />
                <span className="qc-name">{fact.short}</span>
              </span>
            ))}
            <Tooltip tip={tip}>{active ? <TipBody title={active.label} rows={[]} note={active.full} /> : null}</Tooltip>
          </div>
        ) : null}
      </div>
      <div className="qc-actions">
        {checkedAt !== null ? (
          <span className="qc-live" data-state={failed ? "failed" : "live"} aria-live="polite">
            <i />
            {failed ? t("refreshFailed") : t("liveUpdated", { time: relativeTime(t, checkedAt, now) })}
          </span>
        ) : null}
        <button type="button" className="qc-icon-button" aria-label={t("refresh")} disabled={loading} onClick={onRefresh} data-busy={loading || undefined}>
          <Icon name="refresh" size={14} />
        </button>
      </div>
    </header>
  )
}

const Detail = memo(function Detail({ detail, t }: { readonly detail: SessionDetail; readonly t: Translate }) {
  const { summary } = detail
  const gauge = useMemo(() => contextGauge(detail), [detail])
  // The pinned request by its index in the whole session, so it stays put as old requests drop off
  // the front of the trend. `reveal` counts requests from outside the chart to scroll to it.
  const [pin, setPin] = useState<{ readonly index: number; readonly reveal: number } | null>(null)
  const reveals = useRef(0)
  const trendRef = useRef<HTMLElement | null>(null)
  const offset = detail.requestsTruncated
  const count = detail.requests.length
  const pinned = pin && pin.index >= offset && pin.index < offset + count ? pin.index - offset : null
  const onPin = useCallback(
    (index: number | null) => setPin((current) => (index === null ? null : { index: index + offset, reveal: current?.reveal ?? 0 })),
    [offset],
  )
  const showRequest = useCallback(
    (requestIndex: number) => {
      if (requestIndex < offset || requestIndex >= offset + count) return
      reveals.current += 1
      setPin({ index: requestIndex, reveal: reveals.current })
      trendRef.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" })
    },
    [offset, count],
  )
  const showEvent = useCallback(
    (event: ContextEvent) => {
      const index = eventRequest(event, offset, count)
      if (index !== null) showRequest(index + offset)
    },
    [offset, count, showRequest],
  )
  return (
    <>
      <div className="qc-grid qc-hero">
        <ContextCard gauge={gauge} t={t} />
        <div className="qc-grid qc-kpis">
          <Kpi index={1} label={t("statTurns")} value={summary.turns} format={formatCount} />
          <Kpi index={2} label={t("statRequests")} value={summary.requests} format={formatCount} />
          <Kpi index={3} label={t("statTokens")} value={summary.tokens.prompt + summary.tokens.output} format={formatTokenValue} tone="accent" />
          <Kpi
            index={4}
            label={t("statCacheHit")}
            value={summary.tokens.prompt > 0 ? summary.tokens.cacheRead / summary.tokens.prompt : null}
            format={formatRatio}
            tone="success"
          />
          <Kpi
            index={5}
            label={t("statToolRuns")}
            value={summary.toolRuns}
            format={formatCount}
            tone={summary.toolErrors > 0 ? "danger" : "neutral"}
            sub={summary.toolErrors > 0 ? t("statToolErrors", { count: summary.toolErrors }) : undefined}
          />
          <Kpi
            index={6}
            label={t("statCompactions")}
            value={summary.compactions}
            format={formatCount}
            tone={summary.compactions > 0 ? "warning" : "neutral"}
          />
          <Kpi index={7} label={t("statSubagents")} value={summary.subagents} format={formatCount} />
          <Kpi index={8} label={t("statSpan")} value={summary.lastAt - summary.firstAt} format={formatDuration} />
        </div>
      </div>
      <TrendCard detail={detail} pinned={pinned} reveal={pin?.reveal ?? 0} onPin={onPin} sectionRef={trendRef} t={t} />
      <div className="qc-grid qc-pairs">
        <Timing detail={detail} t={t} />
        <Events events={detail.events} reachable={(event) => eventRequest(event, offset, count) !== null} onShow={showEvent} t={t} />
        <Files files={detail.files} t={t} />
        <TallyCard index={13} title={t("toolsTitle")} tallies={summary.tools} empty={{ icon: "tool", title: t("emptySessionTools") }} t={t} />
      </div>
      <Commands detail={detail} onShowRequest={showRequest} t={t} />
    </>
  )
})

const formatTokenValue = (value: number | null) => formatTokens(value ?? 0)
const formatRatio = (value: number | null) => formatPercent(value)

function ContextCard({ gauge, t }: { readonly gauge: Gauge; readonly t: Translate }) {
  const tone = contextTone(gauge.ratio)
  const scale = gauge.window ?? Math.max(gauge.used, 1)
  const label = gauge.window
    ? t("ringLabel", { used: formatTokens(gauge.used), window: formatTokens(gauge.window) })
    : `${formatTokens(gauge.used)} · ${t("windowUnknown")}`
  return (
    <Card index={0} className="qc-context-card" title={t("currentTitle")}>
      <div className="qc-context" data-tone={tone}>
        <ContextRing cached={gauge.cached} uncached={gauge.uncached} scale={scale} label={label} warn={tone !== "neutral"}>
          {gauge.ratio !== null ? (
            <>
              <span className="qc-ring-value">
                <AnimatedNumber value={gauge.ratio * 100} format={formatShare} />
              </span>
              <span className="qc-ring-caption">{t("ofWindow", { window: formatTokens(gauge.window ?? 0) })}</span>
            </>
          ) : (
            <>
              <span className="qc-ring-value">
                <AnimatedNumber value={gauge.used} format={formatTokenValue} />
              </span>
              <span className="qc-ring-caption">{t("windowUnknown")}</span>
            </>
          )}
        </ContextRing>
        <dl className="qc-context-stats">
          <Stat label={t("usedNow")}>
            <AnimatedNumber value={gauge.used} format={formatTokenValue} />
          </Stat>
          {gauge.headroom !== null ? (
            <Stat label={t("headroom")} tone={tone}>
              {gauge.headroom > 0 ? (
                <AnimatedNumber value={gauge.headroom} format={formatTokenValue} />
              ) : (
                t("windowFull")
              )}
            </Stat>
          ) : null}
          <Stat label={t("cacheRead")} color={SERIES.cacheRead}>
            <AnimatedNumber value={gauge.cached} format={formatTokenValue} />
          </Stat>
          <Stat label={t("uncached")} color={SERIES.uncached}>
            <AnimatedNumber value={gauge.uncached} format={formatTokenValue} />
          </Stat>
          {gauge.growth !== null ? (
            <Stat label={t("pace")}>{t("paceValue", { tokens: formatTokens(gauge.growth) })}</Stat>
          ) : null}
        </dl>
      </div>
      {gauge.requestsLeft !== null && gauge.headroom ? (
        <p className="qc-context-note" data-tone={tone}>
          {tone === "neutral" ? t("requestsLeft", { count: gauge.requestsLeft.toLocaleString() }) : t("nearFull", { count: gauge.requestsLeft.toLocaleString() })}
        </p>
      ) : null}
    </Card>
  )
}

const formatShare = (value: number | null) => `${(value ?? 0).toFixed(1)}%`

function Stat({ label, tone, color, children }: { readonly label: string; readonly tone?: string; readonly color?: string; readonly children: ReactNode }) {
  return (
    <div data-tone={tone}>
      <dt>
        {color ? <i className="qc-swatch" style={{ background: color }} /> : null}
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  )
}

const EVENT_ICONS: Record<ContextEvent["kind"], IconName> = { compaction: "scissors", retry: "refresh", error: "alert" }
const EVENT_TONES: Record<ContextEvent["kind"], string> = { compaction: "warning", retry: "neutral", error: "danger" }

function Events({
  events,
  reachable,
  onShow,
  t,
}: {
  readonly events: readonly ContextEvent[]
  /** Whether the request an event led into is in the trend. */
  readonly reachable: (event: ContextEvent) => boolean
  readonly onShow: (event: ContextEvent) => void
  readonly t: Translate
}) {
  const items = useMemo(() => timeline(events), [events])
  const now = useNow(30_000)
  const tip = useChartTip()
  const hover = useHoverTip(tip, 250)
  const active = tip.active === null ? undefined : items[tip.active]
  const activate = (item: TimelineItem) => (reachable(item.event) ? () => onShow(item.event) : undefined)
  const onKeyDown = (item: TimelineItem) => (event: KeyboardEvent) => {
    if ((event.key === "Enter" || event.key === " ") && reachable(item.event)) {
      event.preventDefault()
      onShow(item.event)
    }
  }
  const row = (item: TimelineItem, position: number) => (
    <li
      key={item.key}
      className="qc-enter"
      style={enter(position % EVENT_CAP)}
      data-tone={EVENT_TONES[item.event.kind]}
      data-qc-tip={position}
      data-clickable={reachable(item.event) || undefined}
      tabIndex={0}
      aria-describedby={tip.id}
      onClick={activate(item)}
      onKeyDown={onKeyDown(item)}
    >
      <span className="qc-timeline-node">
        <Icon name={EVENT_ICONS[item.event.kind]} size={12} />
      </span>
      <span className="qc-timeline-body">
        <span className="qc-timeline-title">
          <span className="qc-name">{eventTitle(item.event, t)}</span>
          {item.count > 1 ? <span className="qc-badge">×{item.count}</span> : null}
          <time className="qc-timeline-time">{relativeTime(t, item.event.at, now)}</time>
        </span>
        <span className="qc-timeline-detail">{eventDetail(item.event)}</span>
      </span>
    </li>
  )
  return (
    <Card index={11} title={t("eventsTitle")} hint={items.length > 0 ? events.length : undefined}>
      {items.length === 0 ? (
        <EmptyState compact icon="sparkle" title={t("eventsEmpty")} hint={t("eventsEmptyHint")} />
      ) : (
        <div className="qc-tip-host qc-tally-host" ref={tip.hostRef} {...hover}>
          <CappedList
            className="qc-timeline"
            items={items}
            cap={EVENT_CAP}
            render={row}
            showAll={t("showAll", { count: items.length })}
            showLess={t("showLess")}
          />
          <Tooltip tip={tip}>{active ? <EventTip item={active} linked={reachable(active.event)} t={t} /> : null}</Tooltip>
        </div>
      )}
    </Card>
  )
}

function eventTitle(event: ContextEvent, t: Translate): string {
  if (event.kind === "compaction") return t("compaction", { trigger: t(TRIGGERS[event.trigger]) })
  return t(event.kind === "retry" ? "retryEvent" : "errorEvent")
}

function eventDetail(event: ContextEvent): string {
  if (event.kind !== "compaction") return event.text
  const tokens = (value: number | null) => (value === null ? "?" : formatTokens(value))
  return `${tokens(event.preTokens)} → ${tokens(event.postTokens)}${event.durationMs !== null ? ` · ${formatDuration(event.durationMs)}` : ""}`
}

function EventTip({ item, linked, t }: { readonly item: TimelineItem; readonly linked: boolean; readonly t: Translate }) {
  const { event } = item
  const when = (at: number) => dateTime(t, at)
  const rows: { label: string; value: string }[] = [
    { label: t("eventWhen"), value: when(event.at) },
    { label: t("eventPosition"), value: event.requestIndex > 0 ? t("afterRequest", { index: event.requestIndex }) : t("sessionStart") },
  ]
  if (event.kind === "compaction") {
    if (event.preTokens !== null) rows.push({ label: t("compactBefore"), value: formatTokens(event.preTokens) })
    if (event.postTokens !== null) rows.push({ label: t("compactAfter"), value: formatTokens(event.postTokens) })
    if (event.preTokens !== null && event.postTokens !== null) {
      rows.push({ label: t("compactFreed"), value: formatTokens(Math.max(0, event.preTokens - event.postTokens)) })
    }
    if (event.durationMs !== null) rows.push({ label: t("compactTook"), value: formatDuration(event.durationMs) })
  } else if (item.count > 1) {
    rows.push({ label: t("occurrences"), value: item.count.toLocaleString() }, { label: t("eventFirst"), value: when(item.firstAt) })
  }
  const hint = linked ? <div className="qc-tip-hint">{t("showInTrend")}</div> : null
  return (
    <TipBody
      title={eventTitle(event, t)}
      rows={rows}
      note={
        event.kind === "compaction" ? (
          hint
        ) : (
          <>
            {event.text}
            {hint}
          </>
        )
      }
    />
  )
}

function Files({ files, t }: { readonly files: readonly FileActivity[]; readonly t: Translate }) {
  const tip = useChartTip()
  const hover = useHoverTip(tip, 250)
  const max = Math.max(1, ...files.map((file) => file.reads + file.writes))
  const active = tip.active === null ? undefined : files[tip.active]
  const row = (file: FileActivity, position: number) => {
    const { name, dir } = splitPath(file.path)
    return (
      <li key={file.path} className="qc-row" tabIndex={0} data-qc-tip={position} aria-describedby={tip.id}>
        <span className="qc-name">
          {name}
          {dir ? <span className="qc-row-dir"> {dir}</span> : null}
        </span>
        <span className="qc-count">
          {file.writes > 0 ? <span className="qc-write-count">{t("writesShort", { count: file.writes })}</span> : null}
          {file.reads > 0 ? <span>{t("readsShort", { count: file.reads })}</span> : null}
        </span>
        <span className="qc-tally-bar qc-split-bar">
          <span style={{ width: `${(file.writes / max) * 100}%`, background: SERIES.output, ...enter(position) }} />
          <span style={{ width: `${(file.reads / max) * 100}%`, ...enter(position) }} />
        </span>
      </li>
    )
  }
  return (
    <Card
      index={12}
      title={t("filesTitle")}
      hint={files.length > 0 ? files.length : undefined}
      aside={
        files.length > 0 ? (
          <span className="qc-legend qc-legend-inline">
            <span>
              <i className="qc-swatch" style={{ background: SERIES.output }} />
              {t("filesWritten")}
            </span>
            <span>
              <i className="qc-swatch qc-swatch-read" />
              {t("filesRead")}
            </span>
          </span>
        ) : undefined
      }
    >
      {files.length === 0 ? (
        <EmptyState compact icon="file" title={t("emptyFiles")} />
      ) : (
        <div className="qc-tip-host qc-tally-host" ref={tip.hostRef} {...hover}>
          <CappedList className="qc-tally" items={files} cap={TALLY_CAP} render={row} showAll={t("showAll", { count: files.length })} showLess={t("showLess")} />
          <Tooltip tip={tip}>
            {active ? (
              <TipBody
                title={splitPath(active.path).name}
                rows={[
                  { label: t("filesWritten"), value: active.writes.toLocaleString(), color: SERIES.output },
                  { label: t("filesRead"), value: active.reads.toLocaleString(), color: "var(--qc-read)" },
                  { label: t("tallyLastUsed"), value: relativeTime(t, active.lastAt) },
                ]}
                note={active.path}
              />
            ) : null}
          </Tooltip>
        </div>
      )}
    </Card>
  )
}

function TallyCard({
  index,
  title,
  tallies,
  empty,
  t,
}: {
  readonly index: number
  readonly title: string
  readonly tallies: readonly Tally[]
  readonly empty: { readonly icon: IconName; readonly title: string }
  readonly t: Translate
}) {
  const tip = useChartTip()
  const hover = useHoverTip(tip, 250)
  const max = Math.max(1, ...tallies.map((tally) => tally.count))
  const total = tallies.reduce((sum, tally) => sum + tally.count, 0)
  const active = tip.active === null ? undefined : tallies[tip.active]
  const row = (tally: Tally, position: number) => (
    <li key={tally.name} className="qc-row" tabIndex={0} data-qc-tip={position} aria-describedby={tip.id}>
      <span className="qc-name">{tally.name}</span>
      <span className="qc-count">{tally.count.toLocaleString()}</span>
      <span className="qc-tally-bar">
        <span style={{ width: `${(tally.count / max) * 100}%`, ...enter(position) }} />
      </span>
    </li>
  )
  return (
    <Card index={index} title={title} hint={tallies.length > 0 ? tallies.length : undefined}>
      {tallies.length === 0 ? (
        <EmptyState compact icon={empty.icon} title={empty.title} />
      ) : (
        <div className="qc-tip-host qc-tally-host" ref={tip.hostRef} {...hover}>
          <CappedList className="qc-tally" items={tallies} cap={TALLY_CAP} render={row} showAll={t("showAll", { count: tallies.length })} showLess={t("showLess")} />
          <Tooltip tip={tip}>
            {active ? (
              <TipBody
                title={active.name}
                rows={[
                  { label: t("tallyRuns"), value: active.count.toLocaleString() },
                  { label: t("tallyShare"), value: formatPercent(total > 0 ? active.count / total : null, 0) },
                  { label: t("tallyLastUsed"), value: relativeTime(t, active.lastAt) },
                ]}
              />
            ) : null}
          </Tooltip>
        </div>
      )}
    </Card>
  )
}

function TrendCard({
  detail,
  pinned,
  reveal,
  onPin,
  sectionRef,
  t,
}: {
  readonly detail: SessionDetail
  readonly pinned: number | null
  readonly reveal: number
  readonly onPin: (index: number | null) => void
  readonly sectionRef: RefObject<HTMLElement | null>
  readonly t: Translate
}) {
  const [mode, setMode] = useState<TrendMode>("total")
  const options = useMemo(
    () => [
      { value: "total" as const, label: t("trendTotal") },
      { value: "delta" as const, label: t("trendDelta") },
    ],
    [t],
  )
  const { requests, requestsTruncated, summary } = detail
  return (
    <Card
      index={9}
      className="qc-stack-gap"
      sectionRef={sectionRef}
      title={t("trendTitle")}
      hint={
        requestsTruncated > 0
          ? t("trendTruncated", { shown: requests.length, total: requests.length + requestsTruncated })
          : t(mode === "delta" ? "trendHintDelta" : "trendHint")
      }
      aside={<Segmented label={t("trendModeLabel")} value={mode} options={options} onChange={setMode} />}
    >
      <RequestTrend
        requests={requests}
        events={detail.events}
        offset={requestsTruncated}
        window={summary.contextWindow}
        mode={mode}
        pinned={pinned}
        reveal={reveal}
        onPin={onPin}
        t={t}
      >
        {mode === "total" ? (
          <Legend t={t} window={summary.contextWindow} compactions={detail.events.some((event) => event.kind === "compaction")} />
        ) : (
          <div className="qc-legend">
            <span>
              <i className="qc-swatch" style={{ background: SERIES.uncached }} />
              {t("deltaGrowth")}
            </span>
            <span>
              <i className="qc-swatch" style={{ background: "var(--qc-success)" }} />
              {t("deltaShrink")}
            </span>
          </div>
        )}
      </RequestTrend>
    </Card>
  )
}

const TIMING_COLORS: Record<TimingPart["kind"], string> = { model: "var(--qc-time-model)", tool: "var(--qc-time-tool)", compact: "var(--qc-warning)" }
const TIMING_LABELS: Record<TimingPart["kind"], MessageKey> = { model: "timingModel", tool: "timingTools", compact: "timingCompaction" }

function Timing({ detail, t }: { readonly detail: SessionDetail; readonly t: Translate }) {
  const { timing, requests, summary } = detail
  const { activeMs, parts, rate } = useMemo(() => timingParts(timing), [timing])
  const counts = useMemo(
    () => ({
      model: requests.filter((request) => request.latencyMs !== null).length,
      tool: requests.reduce((sum, request) => sum + request.tools.length, 0),
      compact: summary.compactions,
    }),
    [requests, summary.compactions],
  )
  const tip = useChartTip()
  const hover = useHoverTip(tip, 200)
  const subs: Record<TimingPart["kind"], string> = {
    model: t("timingModelSub", { count: counts.model.toLocaleString() }),
    tool: t("timingToolsSub", { count: counts.tool.toLocaleString() }),
    compact: t("timingCompactSub", { count: counts.compact.toLocaleString() }),
  }
  return (
    <Card
      index={10}
      title={t("timingTitle")}
      hint={activeMs > 0 ? t("timingHint") : undefined}
      aside={
        rate !== null ? (
          <span className="qc-tip-host" ref={tip.hostRef} {...hover}>
            <span className="qc-badge qc-rate" tabIndex={0} data-qc-tip={0} aria-describedby={tip.id}>
              {t("timingRate", { rate: Math.round(rate).toLocaleString() })}
            </span>
            <Tooltip tip={tip}>{tip.active !== null ? <TipBody title={t("timingRate", { rate: rate.toFixed(1) })} rows={[]} note={t("timingRateHint")} /> : null}</Tooltip>
          </span>
        ) : undefined
      }
    >
      {activeMs <= 0 ? (
        <EmptyState compact icon="clock" title={t("timingEmpty")} hint={t("timingEmptyHint")} />
      ) : (
        <>
          <div className="qc-timing-total">
            <span className="qc-timing-value">
              <AnimatedNumber value={activeMs} format={formatDurationValue} />
            </span>
            <span className="qc-muted">{t("timingActive")}</span>
          </div>
          <StackBar large scale={activeMs} parts={parts.map((part) => ({ value: part.ms, color: TIMING_COLORS[part.kind] }))} label={t("timingActive")} />
          <ul className="qc-timing-parts">
            {parts.map((part, position) => (
              <li key={part.kind} className="qc-enter" style={enter(position)}>
                <i className="qc-swatch" style={{ background: TIMING_COLORS[part.kind] }} />
                <span className="qc-timing-label">
                  {t(TIMING_LABELS[part.kind])}
                  <span className="qc-muted">{subs[part.kind]}</span>
                </span>
                <span className="qc-timing-ms">{formatElapsed(part.ms)}</span>
                <span className="qc-timing-share">{formatPercent(part.share, part.share < 0.1 ? 1 : 0)}</span>
              </li>
            ))}
          </ul>
          <TimingRibbon ribbon={timing.ribbon} activeMs={activeMs} t={t} />
        </>
      )}
    </Card>
  )
}

const formatDurationValue = (value: number | null) => formatDuration(value)

/** The active time as a strip of slices, oldest first, each stacked by what it was spent on. */
function TimingRibbon({ ribbon, activeMs, t }: { readonly ribbon: TimingStats["ribbon"]; readonly activeMs: number; readonly t: Translate }) {
  const tip = useChartTip()
  const slice = activeMs / Math.max(1, ribbon.length)
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const index = Math.min(ribbon.length - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * ribbon.length)))
    if (index !== tip.active) tip.show(index)
  }
  const active = tip.active === null ? undefined : ribbon[tip.active]
  const kinds = ["model", "tool", "compact"] as const
  return (
    <div className="qc-tip-host qc-ribbon-wrap" ref={tip.hostRef}>
      <svg
        className="qc-ribbon qc-chart"
        viewBox={`0 0 ${ribbon.length} 1`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t("timingRibbon")}
        data-active={active ? "true" : undefined}
        onPointerMove={move}
        onPointerLeave={tip.hide}
        {...tip.keyboard(ribbon.length)}
      >
        {ribbon.map((cell, index) => {
          const total = cell.model + cell.tool + cell.compact || 1
          let y = 1
          return (
            <g key={index} data-qc-tip={index} data-active={tip.active === index || undefined}>
              {kinds.map((kind) => {
                const height = cell[kind] / total
                y -= height
                return height > 0 ? <rect key={kind} x={index + 0.08} y={y} width={0.84} height={height} fill={TIMING_COLORS[kind]} /> : null
              })}
            </g>
          )
        })}
      </svg>
      <div className="qc-ribbon-axis" aria-hidden="true">
        <span>0</span>
        <span>{formatDuration(activeMs / 2)}</span>
        <span>{formatDuration(activeMs)}</span>
      </div>
      <Tooltip tip={tip}>
        {active && tip.active !== null ? (
          <TipBody
            title={t("timingSlice", { from: formatDuration(tip.active * slice), to: formatDuration((tip.active + 1) * slice) })}
            rows={kinds
              .filter((kind) => active[kind] > 0)
              .map((kind) => ({ label: t(TIMING_LABELS[kind]), value: formatElapsed(active[kind]), color: TIMING_COLORS[kind] }))}
          />
        ) : null}
      </Tooltip>
    </div>
  )
}

const RUN_CAP = 8
const STATUS_ICONS: Record<CommandStatus, IconName | null> = { ok: "check", failed: "close", cancelled: "stop", background: "layers", running: null }
const STATUS_LABELS: Record<CommandStatus, MessageKey> = {
  ok: "statusOk",
  failed: "statusFailed",
  cancelled: "statusCancelled",
  background: "statusBackground",
  running: "statusRunning",
}

function Commands({
  detail,
  onShowRequest,
  t,
}: {
  readonly detail: SessionDetail
  readonly onShowRequest: (requestIndex: number) => void
  readonly t: Translate
}) {
  const runs = detail.commands
  const programs = detail.summary.commands
  const facts = useMemo(() => runFacts(runs), [runs])
  const [filter, setFilter] = useState<RunFilter>("all")
  const [sort, setSort] = useState<RunSort>("latest")
  const [program, setProgram] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const query = useDebounced(search, 150)
  const shown = useMemo(() => visibleRuns(runs, { filter, program, query, sort }), [runs, filter, program, query, sort])
  const terms = useMemo(() => [...searchTerms(query), ...(program ? [program.toLowerCase()] : [])], [query, program])
  const filterOptions = useMemo(
    () =>
      (
        [
          ["all", "runsAll"],
          ["failed", "runsFailed"],
          ["slow", "runsSlow"],
          ["background", "runsBackground"],
        ] as const
      ).map(([value, key]) => ({ value, label: `${t(key)} ${facts.counts[value].toLocaleString()}` })),
    [facts, t],
  )
  const sortOptions = useMemo(
    () => [
      { value: "latest" as const, label: t("runsLatest") },
      { value: "slowest" as const, label: t("runsSlowest") },
    ],
    [t],
  )
  const tip = useChartTip()
  const hover = useHoverTip(tip, 300)
  const active = tip.active === null ? undefined : shown[tip.active]
  const offset = detail.requestsTruncated
  const reachable = (run: CommandRun) => run.requestIndex !== null && run.requestIndex >= offset && run.requestIndex < offset + detail.requests.length
  const programMax = Math.max(1, ...programs.map((tally) => tally.count))
  const programTotal = programs.reduce((sum, tally) => sum + tally.count, 0)

  const row = (run: CommandRun, position: number) => (
    <li key={run.id} className="qc-run" data-status={run.status} data-qc-tip={position} tabIndex={0} aria-describedby={tip.id}>
      <span className="qc-run-status">{STATUS_ICONS[run.status] ? <Icon name={STATUS_ICONS[run.status]!} size={11} /> : <Spinner />}</span>
      <code className="qc-run-command">
        {highlight(displayCommand(run.command, detail.summary.cwd), terms).map((segment, index) =>
          segment.match ? (
            <mark key={index} className="qc-mark">
              {segment.text}
            </mark>
          ) : (
            segment.text
          ),
        )}
      </code>
      <span className="qc-run-meta">
        {run.subagent ? <span className="qc-badge">{t("runSub")}</span> : null}
        {run.status === "background" ? <span className="qc-badge" data-tone="accent">{t("runBg")}</span> : null}
        {run.status === "failed" && run.exitCode !== null ? (
          <span className="qc-badge" data-tone="danger">
            {t("runExit", { code: run.exitCode })}
          </span>
        ) : null}
        <span className="qc-run-time" data-slow={isSlow(run) || undefined}>
          {run.durationMs === null ? "—" : formatElapsed(run.durationMs)}
        </span>
        {reachable(run) ? (
          <button
            type="button"
            className="qc-run-link"
            aria-label={t("showRequest", { index: run.requestIndex! + 1 })}
            onClick={() => onShowRequest(run.requestIndex!)}
          >
            #{run.requestIndex! + 1}
          </button>
        ) : null}
        <time className="qc-run-clock">{clockTime(t, run.at)}</time>
      </span>
    </li>
  )

  if (runs.length === 0) {
    return (
      <Card index={14} title={t("runsTitle")}>
        <EmptyState compact icon="terminal" title={t("emptySessionCommands")} />
      </Card>
    )
  }
  const settledFailedRate = facts.settled > 0 ? facts.counts.failed / facts.settled : null
  return (
    <Card
      index={14}
      className="qc-runs-card"
      title={t("runsTitle")}
      hint={detail.commandsTruncated > 0 ? t("runsTruncated", { shown: runs.length, total: runs.length + detail.commandsTruncated }) : runs.length}
    >
      <div className="qc-runs">
        <aside className="qc-runs-rail">
          <h3 className="qc-rail-title">{t("runsSummary")}</h3>
          <dl className="qc-mini-stats">
            <div>
              <dd>
                <AnimatedNumber value={facts.settled} format={formatCount} />
              </dd>
              <dt>{t("runsSettled")}</dt>
            </div>
            <div data-tone={facts.counts.failed > 0 ? "danger" : undefined}>
              <dd>
                <AnimatedNumber value={facts.counts.failed} format={formatCount} />
              </dd>
              <dt>{t("runsFailedRate", { rate: formatPercent(settledFailedRate, 0) })}</dt>
            </div>
            <div>
              <dd>{formatElapsed(facts.totalMs)}</dd>
              <dt>{t("runsTotalTime")}</dt>
            </div>
            <div>
              <dd>
                <AnimatedNumber value={facts.counts.background} format={formatCount} />
              </dd>
              <dt>{t("runsBackground")}</dt>
            </div>
          </dl>
          {facts.slowest || facts.lastFailure ? (
            <>
              <h3 className="qc-rail-title">{t("runsAttention")}</h3>
              <ul className="qc-attention">
                {facts.slowest ? (
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setFilter("all")
                        setSort("slowest")
                      }}
                    >
                      <span className="qc-attention-label">{t("runsSlowestRun")}</span>
                      <code className="qc-name">{displayCommand(facts.slowest.command, detail.summary.cwd)}</code>
                      <span className="qc-run-time" data-slow={isSlow(facts.slowest) || undefined}>
                        {formatElapsed(facts.slowest.durationMs ?? 0)}
                      </span>
                    </button>
                  </li>
                ) : null}
                {facts.lastFailure ? (
                  <li data-tone="danger">
                    <button
                      type="button"
                      onClick={() => {
                        setFilter("failed")
                        setSort("latest")
                      }}
                    >
                      <span className="qc-attention-label">{t("runsLastFailure")}</span>
                      <code className="qc-name">{displayCommand(facts.lastFailure.command, detail.summary.cwd)}</code>
                      <span className="qc-run-clock">{relativeTime(t, facts.lastFailure.at)}</span>
                    </button>
                  </li>
                ) : null}
              </ul>
            </>
          ) : null}
          {programs.length > 0 ? (
            <>
              <h3 className="qc-rail-title">
                {t("runsPrograms")} <span className="qc-muted">· {programs.length}</span>
              </h3>
              <CappedList
                className="qc-tally"
                items={programs}
                cap={TALLY_CAP}
                showAll={t("showAll", { count: programs.length })}
                showLess={t("showLess")}
                forceOpen={program !== null && programs.findIndex((tally) => tally.name === program) >= TALLY_CAP}
                render={(tally, position) => (
                  <li key={tally.name}>
                    <button
                      type="button"
                      aria-pressed={program === tally.name}
                      aria-label={`${tally.name} · ${t("runsProgramsHint")}`}
                      onClick={() => setProgram(program === tally.name ? null : tally.name)}
                    >
                      <span className="qc-name">{tally.name}</span>
                      <span className="qc-count">
                        ×{tally.count.toLocaleString()} <span className="qc-muted">{formatPercent(tally.count / Math.max(1, programTotal), 0)}</span>
                      </span>
                      <span className="qc-tally-bar">
                        <span style={{ width: `${(tally.count / programMax) * 100}%`, ...enter(position) }} />
                      </span>
                    </button>
                  </li>
                )}
              />
            </>
          ) : null}
        </aside>
        <div className="qc-runs-main">
          <div className="qc-toolbar">
            <Segmented className="qc-run-filter" label={t("runsFilterLabel")} value={filter} options={filterOptions} onChange={setFilter} />
            <div className="qc-search">
              <Icon name="search" size={14} />
              <input type="search" value={search} placeholder={t("runsSearch")} aria-label={t("runsSearch")} onChange={(event) => setSearch(event.target.value)} />
              {search ? (
                <button type="button" className="qc-search-clear" aria-label={t("clearSearch")} onClick={() => setSearch("")}>
                  <Icon name="close" size={10} />
                </button>
              ) : null}
            </div>
            <Segmented label={t("runsSortLabel")} value={sort} options={sortOptions} onChange={setSort} />
            {program ? (
              <span className="qc-chip">
                {program}
                <button type="button" aria-label={t("clearFilter")} onClick={() => setProgram(null)}>
                  <Icon name="close" size={10} />
                </button>
              </span>
            ) : null}
          </div>
          {shown.length === 0 ? (
            <EmptyState
              compact
              icon="search"
              title={t("runsNoMatch")}
              hint={filter === "slow" ? t("runsSlowHint", { threshold: formatElapsed(SLOW_MS) }) : undefined}
              action={
                <button
                  type="button"
                  className="qc-more"
                  onClick={() => {
                    setFilter("all")
                    setProgram(null)
                    setSearch("")
                  }}
                >
                  {t("clearAll")}
                </button>
              }
            />
          ) : (
            <div className="qc-tip-host qc-tally-host" ref={tip.hostRef} {...hover}>
              <CappedList
                key={`${filter}|${program}|${sort}|${query}`}
                className="qc-run-list"
                items={shown}
                cap={RUN_CAP}
                render={row}
                showAll={t("showAll", { count: shown.length })}
                showLess={t("showLess")}
              />
              <Tooltip tip={tip}>{active ? <RunTip run={active} t={t} /> : null}</Tooltip>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function RunTip({ run, t }: { readonly run: CommandRun; readonly t: Translate }) {
  const rows: { label: string; value: string }[] = [{ label: t("runStatus"), value: t(STATUS_LABELS[run.status]) }]
  if (run.exitCode !== null) rows.push({ label: t("runExit", { code: "" }).trim(), value: String(run.exitCode) })
  if (run.durationMs !== null) rows.push({ label: t("runDuration"), value: formatElapsed(run.durationMs) })
  rows.push({ label: t("eventWhen"), value: dateTime(t, run.at) })
  if (run.requestIndex !== null) rows.push({ label: t("runRequest"), value: `#${run.requestIndex + 1} · ${t("turn", { turn: run.turn })}` })
  if (run.subagent) rows.push({ label: t("runSubagent"), value: "✓" })
  return <TipBody title={<code className="qc-tip-code">{run.command}</code>} rows={rows} />
}
