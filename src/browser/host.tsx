import type { Disposable } from "@qoder/plugin-api"
import type { PluginViewContext } from "@qoder/plugin-api/view"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { createTranslate, type Translate } from "./i18n.js"
import { STYLES } from "./styles.js"
import { schemeOf } from "./theme.js"

type Render = (context: PluginViewContext, t: Translate) => ReactNode

/** Registers a React view and re-renders it in place when the host switches language. */
export function registerView(render: Render, options: { readonly compact?: boolean } = {}): void {
  const mounted = new Set<(locale: string) => void>()
  globalThis.qoderPluginView.register({
    mount(container, context) {
      const style = document.createElement("style")
      style.textContent = STYLES
      const host = document.createElement("div")
      host.className = options.compact ? "qc-root qc-compact" : "qc-root"
      container.append(style, host)
      const stopPalette = syncPalette(container, host)
      const stopWidth = watchWidth(host)
      const root = createRoot(host)
      const update = (locale: string) => root.render(render(context, createTranslate(locale)))
      mounted.add(update)
      update(context.locale)
      return {
        dispose() {
          stopPalette()
          stopWidth()
          mounted.delete(update)
          root.unmount()
          style.remove()
          host.remove()
        },
      }
    },
    updateLocale(locale) {
      for (const update of mounted) update(locale)
    },
  })
}

/**
 * Copies the host's computed text and background colours onto the view, tags it light or dark,
 * and follows theme switches; the packaged host hashes its design-token names, so they can't be
 * referenced.
 */
function syncPalette(container: HTMLElement, target: HTMLElement): () => void {
  const apply = () => {
    const text = getComputedStyle(container).color
    const surface = opaqueBackground(container)
    target.style.setProperty("--qc-text", text)
    target.style.setProperty("--qc-surface", surface)
    target.dataset.qcScheme = schemeOf(surface, text)
  }
  apply()
  const observer = new MutationObserver(() => requestAnimationFrame(apply))
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] })
  if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme", "style"] })
  return () => observer.disconnect()
}

/** The width class host.tsx tags the root with; styles.ts keys narrow and wide layouts off it. */
export function widthClass(width: number): "narrow" | "regular" | "wide" {
  return width < 520 ? "narrow" : width >= 1200 ? "wide" : "regular"
}

function watchWidth(target: HTMLElement): () => void {
  const apply = (width: number) => {
    const next = widthClass(width)
    if (target.dataset.qcWidth !== next) target.dataset.qcWidth = next
  }
  apply(target.clientWidth)
  if (typeof ResizeObserver === "undefined") return () => {}
  const observer = new ResizeObserver(() => apply(target.clientWidth))
  observer.observe(target)
  return () => observer.disconnect()
}

function opaqueBackground(start: Element): string {
  let element: Element | null = start
  while (element) {
    const color = getComputedStyle(element).backgroundColor
    if (color && color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)) return color
    const parent: Element | null = element.parentElement
    const root = element.getRootNode()
    element = parent ?? (root instanceof ShadowRoot ? root.host : null)
  }
  return "Canvas"
}

export interface Loadable<T> {
  readonly data: T | null
  readonly error: boolean
  readonly loading: boolean
  readonly reload: () => void
}

/**
 * Loads data when mounted or when `key` changes, reloads whenever the view becomes the
 * active tab again, and optionally polls while active. Late results of stale requests drop.
 */
export function useLoad<T>(
  context: PluginViewContext,
  load: () => Promise<T>,
  key: string,
  pollMs?: number,
): Loadable<T> {
  const [state, setState] = useState<{ data: T | null; error: boolean; loading: boolean }>({
    data: null,
    error: false,
    loading: true,
  })
  const generation = useRef(0)
  const loadRef = useRef(load)
  loadRef.current = load

  const reload = useCallback(() => {
    const current = ++generation.current
    setState((previous) => ({ ...previous, loading: true }))
    loadRef.current().then(
      (data) => {
        if (current === generation.current) setState({ data, error: false, loading: false })
      },
      () => {
        if (current === generation.current) setState((previous) => ({ ...previous, error: true, loading: false }))
      },
    )
  }, [])

  useEffect(() => {
    reload()
  }, [key, reload])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (pollMs && !timer) timer = setInterval(reload, pollMs)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    if (context.api.lifecycle.isActive()) start()
    const subscription: Disposable = context.api.lifecycle.onDidChangeActive((active) => {
      if (active) {
        reload()
        start()
      } else {
        stop()
      }
    })
    return () => {
      stop()
      subscription.dispose()
      generation.current += 1
    }
  }, [context, pollMs, reload])

  return { ...state, reload }
}
