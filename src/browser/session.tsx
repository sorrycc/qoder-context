import { Button } from "@qoder-space/design-system"
import type { PluginViewContext } from "@qoder/plugin-api/view"
import { formatPercent, formatTokens, shortPath } from "../shared/format.js"
import { SERVICE_NAME, type ContextEvent, type SessionDetail, type Tally } from "../shared/types.js"
import { Legend, RequestTrend, SERIES } from "./charts.js"
import { registerView, useLoad } from "./host.js"
import { formatDuration, relativeTime, type Translate } from "./i18n.js"

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
          {t("refresh")}
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
        <div className="qc-grid">
          <div className="qc-skeleton" />
          <div className="qc-skeleton" style={{ height: 200 }} />
        </div>
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
        <Stat label={t("statTurns")} value={String(summary.turns)} />
        <Stat label={t("statRequests")} value={String(summary.requests)} />
        <Stat label={t("statTokens")} value={formatTokens(billed)} />
        <Stat label={t("statCacheHit")} value={formatPercent(summary.tokens.prompt > 0 ? summary.tokens.cacheRead / summary.tokens.prompt : null)} />
        <Stat
          label={t("statToolRuns")}
          value={String(summary.toolRuns)}
          sub={summary.toolErrors > 0 ? t("statToolErrors", { count: summary.toolErrors }) : undefined}
        />
        <Stat label={t("statCompactions")} value={String(summary.compactions)} />
        <Stat label={t("statSubagents")} value={String(summary.subagents)} />
        <Stat label={t("statSpan")} value={formatDuration(summary.lastAt - summary.firstAt)} sub={relativeTime(t, summary.lastAt)} />
      </div>
      <CurrentContext detail={detail} t={t} />
      <section className="qc-card" style={{ marginBottom: 12 }}>
        <h2>
          {t("trendTitle")}
          <small>
            {detail.requestsTruncated > 0
              ? t("trendTruncated", { shown: detail.requests.length, total: detail.requests.length + detail.requestsTruncated })
              : t("trendHint")}
          </small>
        </h2>
        <RequestTrend
          requests={detail.requests}
          events={detail.events}
          offset={detail.requestsTruncated}
          window={summary.contextWindow}
          t={t}
        />
        <Legend t={t} />
      </section>
      <div className="qc-grid qc-two">
        <Events events={detail.events} t={t} />
        <section className="qc-card">
          <h2>{t("filesTitle")}</h2>
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
        </section>
        <TallyTable title={t("toolsTitle")} tallies={summary.tools} t={t} />
        <TallyTable title={t("commandsTitle")} tallies={summary.commands} t={t} />
      </div>
    </>
  )
}

function Stat({ label, value, sub }: { readonly label: string; readonly value: string; readonly sub?: string }) {
  return (
    <div className="qc-card qc-kpi">
      <div className="qc-kpi-label">{label}</div>
      <div className="qc-kpi-value">{value}</div>
      {sub ? <div className="qc-kpi-sub">{sub}</div> : null}
    </div>
  )
}

function CurrentContext({ detail, t }: { readonly detail: SessionDetail; readonly t: Translate }) {
  const { summary } = detail
  const last = detail.requests.at(-1)
  const used = summary.contextTokens
  const window = summary.contextWindow
  const cached = last && last.prompt === used ? Math.min(last.cacheRead, used) : 0
  const scale = window && window > 0 ? window : Math.max(used, 1)
  const width = (value: number) => `${Math.min(100, (value / scale) * 100)}%`
  return (
    <section className="qc-card" style={{ marginBottom: 12 }}>
      <h2>{t("currentTitle")}</h2>
      <div>
        <span className="qc-big">{formatTokens(used)}</span>{" "}
        <span className="qc-muted">
          {window ? `${formatPercent(used / window)} ${t("currentOfWindow", { window: formatTokens(window) })}` : t("windowUnknown")}
        </span>
      </div>
      <div className="qc-context-bar" role="img" aria-label={`${formatTokens(used)} / ${window ? formatTokens(window) : "?"}`}>
        <span style={{ width: width(cached), background: SERIES.cacheRead }} />
        <span style={{ width: width(used - cached), background: SERIES.uncached }} />
      </div>
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
    </section>
  )
}

function Events({ events, t }: { readonly events: readonly ContextEvent[]; readonly t: Translate }) {
  const ordered = [...events].reverse()
  return (
    <section className="qc-card">
      <h2>
        {t("eventsTitle")}
        <small>{events.length}</small>
      </h2>
      {ordered.length === 0 ? (
        <p className="qc-muted">{t("eventsEmpty")}</p>
      ) : (
        <ul className="qc-events">
          {ordered.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              <i
                className="qc-dot"
                style={{ background: event.kind === "compaction" ? "var(--qc-warning)" : event.kind === "error" ? "var(--qc-error)" : "var(--qc-text-3)" }}
              />
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
    </section>
  )
}

function TallyTable({ title, tallies, t }: { readonly title: string; readonly tallies: readonly Tally[]; readonly t: Translate }) {
  return (
    <section className="qc-card">
      <h2>{title}</h2>
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
    </section>
  )
}
