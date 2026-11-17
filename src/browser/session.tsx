import { Button } from "@qoder-space/design-system"
import type { PluginViewContext } from "@qoder/plugin-api/view"
import { formatPercent, formatTokens, shortPath } from "../shared/format.js"
import { SERVICE_NAME, type ContextEvent, type SessionDetail, type Tally } from "../shared/types.js"
import { Legend, RequestTrend, SERIES, StackBar } from "./charts.js"
import { registerView, useLoad } from "./host.js"
import { formatDuration, relativeTime, type Translate } from "./i18n.js"
import { AnimatedNumber, Card, contextTone, formatCount, Kpi, KpiSkeletons, Skeleton, Spinner } from "./ui.js"

type SessionResponse =
  | { readonly status: "ok"; readonly detail: SessionDetail }
  | { readonly status: "missing" | "unbound" }

const POLL_MS = 15_000

registerView((context, t) => <SessionContext context={context} t={t} />, { compact: true })

function SessionContext({ context, t }: { readonly context: PluginViewContext; readonly t: Translate }) {
  const sessionId = context.sourceSessionId
  const response = useLoad(
    context,
    async () =>
      (await context.api.node.callService(SERVICE_NAME, "session", sessionId ? { sessionId } : {}, { timeoutMs: 60_000 })) as unknown as SessionResponse,
    sessionId ?? "",
    POLL_MS,
  )
  const data = response.data
  return (
    <>
      <header className="qc-head">
        <div style={{ minWidth: 0 }}>
          <h1>{t("sessionTitle")}</h1>
          {data?.status === "ok" ? (
            <p className="qc-session-path" title={data.detail.summary.cwd ?? ""}>
              {[data.detail.summary.title, data.detail.summary.cwd && shortPath(data.detail.summary.cwd), data.detail.summary.model, data.detail.summary.gitBranch]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>
        <Button variant="secondary" size="sm" disabled={response.loading} onClick={response.reload}>
          <span className="qc-button-label">
            {response.loading && data ? <Spinner /> : null}
            {t("refresh")}
          </span>
        </Button>
      </header>
      {response.error && !data ? (
        <div className="qc-empty">
          <p className="qc-error">{t("loadFailed")}</p>
          <Button variant="secondary" size="sm" onClick={response.reload}>
            {t("retry")}
          </Button>
        </div>
      ) : !data ? (
        <>
          <KpiSkeletons count={8} />
          <div className="qc-grid">
            <Skeleton height={110} />
            <Skeleton height={210} />
          </div>
        </>
      ) : data.status !== "ok" ? (
        <div className="qc-empty">{t(data.status === "unbound" ? "unbound" : "missing")}</div>
      ) : (
        <Detail detail={data.detail} t={t} />
      )}
    </>
  )
}

function Detail({ detail, t }: { readonly detail: SessionDetail; readonly t: Translate }) {
  const { summary } = detail
  const billed = summary.tokens.prompt + summary.tokens.output
  return (
    <>
      <div className="qc-grid qc-kpis">
        <Kpi index={0} label={t("statTurns")} value={summary.turns} format={formatCount} />
        <Kpi index={1} label={t("statRequests")} value={summary.requests} format={formatCount} />
        <Kpi index={2} label={t("statTokens")} value={billed} format={formatTokenValue} tone="accent" />
        <Kpi
          index={3}
          label={t("statCacheHit")}
          value={summary.tokens.prompt > 0 ? summary.tokens.cacheRead / summary.tokens.prompt : null}
          format={formatRatio}
          tone="success"
        />
        <Kpi
          index={4}
          label={t("statToolRuns")}
          value={summary.toolRuns}
          format={formatCount}
          tone={summary.toolErrors > 0 ? "danger" : "neutral"}
          sub={summary.toolErrors > 0 ? t("statToolErrors", { count: summary.toolErrors }) : undefined}
        />
        <Kpi
          index={5}
          label={t("statCompactions")}
          value={summary.compactions}
          format={formatCount}
          tone={summary.compactions > 0 ? "warning" : "neutral"}
        />
        <Kpi index={6} label={t("statSubagents")} value={summary.subagents} format={formatCount} />
        <Kpi index={7} label={t("statSpan")} value={summary.lastAt - summary.firstAt} format={formatDuration} sub={relativeTime(t, summary.lastAt)} />
      </div>
      <CurrentContext detail={detail} t={t} />
      <Card
        index={9}
        className="qc-stack-gap"
        title={t("trendTitle")}
        hint={
          detail.requestsTruncated > 0
            ? t("trendTruncated", { shown: detail.requests.length, total: detail.requests.length + detail.requestsTruncated })
            : t("trendHint")
        }
      >
        <RequestTrend
          requests={detail.requests}
          events={detail.events}
          offset={detail.requestsTruncated}
          window={summary.contextWindow}
          t={t}
        />
        <Legend t={t} />
      </Card>
      <div className="qc-grid qc-two">
        <Events events={detail.events} t={t} />
        <Card index={11} title={t("filesTitle")} hint={detail.files.length > 0 ? detail.files.length : undefined}>
          {detail.files.length === 0 ? (
            <p className="qc-muted">{t("noneYet")}</p>
          ) : (
            <table className="qc-table">
              <tbody>
                {detail.files.slice(0, 15).map((file) => (
                  <tr key={file.path}>
                    <td title={file.path}>{file.path.split("/").slice(-2).join("/")}</td>
                    <td>
                      {[file.reads ? t("reads", { count: file.reads }) : "", file.writes ? t("writes", { count: file.writes }) : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <TallyTable index={12} title={t("toolsTitle")} tallies={summary.tools} t={t} />
        <TallyTable index={13} title={t("commandsTitle")} tallies={summary.commands} t={t} />
      </div>
    </>
  )
}

const formatTokenValue = (value: number | null) => formatTokens(value ?? 0)
const formatRatio = (value: number | null) => formatPercent(value)

function CurrentContext({ detail, t }: { readonly detail: SessionDetail; readonly t: Translate }) {
  const { summary } = detail
  const last = detail.requests.at(-1)
  const used = summary.contextTokens
  const window = summary.contextWindow
  const cached = last && last.prompt === used ? Math.min(last.cacheRead, used) : 0
  const ratio = window && window > 0 ? used / window : null
  return (
    <Card index={8} className="qc-stack-gap" title={t("currentTitle")}>
      <div>
        <span className="qc-big" data-tone={contextTone(ratio)}>
          <AnimatedNumber value={used} format={formatTokenValue} />
        </span>{" "}
        <span className="qc-muted">
          {window ? `${formatPercent(ratio)} ${t("currentOfWindow", { window: formatTokens(window) })}` : t("windowUnknown")}
        </span>
      </div>
      <StackBar
        large
        scale={window && window > 0 ? window : Math.max(used, 1)}
        label={`${formatTokens(used)} / ${window ? formatTokens(window) : "?"}`}
        parts={[
          { value: cached, color: SERIES.cacheRead },
          { value: used - cached, color: SERIES.uncached },
        ]}
      />
      <div className="qc-legend">
        <span>
          <i className="qc-swatch" style={{ background: SERIES.cacheRead }} />
          {t("cacheRead")} · {formatTokens(cached)}
        </span>
        <span>
          <i className="qc-swatch" style={{ background: SERIES.uncached }} />
          {t("uncached")} · {formatTokens(used - cached)}
        </span>
      </div>
    </Card>
  )
}

function Events({ events, t }: { readonly events: readonly ContextEvent[]; readonly t: Translate }) {
  const ordered = [...events].reverse()
  return (
    <Card index={10} title={t("eventsTitle")} aside={<span className="qc-badge">{events.length}</span>}>
      {ordered.length === 0 ? (
        <p className="qc-muted">{t("eventsEmpty")}</p>
      ) : (
        <ul className="qc-events">
          {ordered.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              <i className="qc-dot" data-tone={event.kind === "compaction" ? "warning" : event.kind === "error" ? "danger" : "neutral"} />
              <span className="qc-name" title={event.kind === "compaction" ? undefined : event.text}>
                {event.kind === "compaction" ? (
                  <>
                    {t("compaction", { trigger: event.trigger })}{" "}
                    <span className="qc-muted">
                      {t("compactionDetail", {
                        pre: event.preTokens === null ? "?" : formatTokens(event.preTokens),
                        post: event.postTokens === null ? "?" : formatTokens(event.postTokens),
                        duration: formatDuration(event.durationMs),
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    {t(event.kind === "retry" ? "retryEvent" : "errorEvent")} <span className="qc-muted">{event.text}</span>
                  </>
                )}
              </span>
              <span className="qc-muted">{relativeTime(t, event.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function TallyTable({
  index,
  title,
  tallies,
  t,
}: {
  readonly index: number
  readonly title: string
  readonly tallies: readonly Tally[]
  readonly t: Translate
}) {
  return (
    <Card index={index} title={title} hint={tallies.length > 0 ? tallies.length : undefined}>
      {tallies.length === 0 ? (
        <p className="qc-muted">{t("noneYet")}</p>
      ) : (
        <table className="qc-table">
          <tbody>
            {tallies.slice(0, 12).map((tally) => (
              <tr key={tally.name}>
                <td>{tally.name}</td>
                <td>{tally.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
