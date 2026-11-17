// Subset of Qoder's @qoder/plugin-api (packages/pluginApi in the Qoder repo) and of the
// @qoder-space/design-system plugin runtime that this plugin uses. Names and shapes are
// copied from the host contract so the repo builds without a Qoder checkout.

declare module "@qoder/plugin-api" {
  export interface Disposable {
    dispose(): void
  }

  export type PluginNodeJsonValue =
    | string
    | number
    | boolean
    | null
    | readonly PluginNodeJsonValue[]
    | { readonly [key: string]: PluginNodeJsonValue }

  export interface PluginSessionResourceContext {
    readonly sessionId: string | null
    readonly workspaceId: string | null
  }

  export interface PluginSessionViewResource {
    readonly kind: "session-resource"
    readonly contributionId: string
    readonly resourceId: string
  }

  export interface PluginNodeServiceContext {
    readonly sessionResource?: PluginSessionResourceContext & {
      readonly contributionId: string
      readonly resource?: PluginSessionViewResource
    }
    readonly viewInstanceId?: string
  }

  export type PluginNodeServiceHandler = (
    input: Readonly<Record<string, PluginNodeJsonValue>>,
    context: PluginNodeServiceContext,
  ) => PluginNodeJsonValue | Promise<PluginNodeJsonValue>

  export interface PluginNodeServiceDefinition {
    readonly name: string
    readonly methods?: Readonly<Record<string, PluginNodeServiceHandler>>
  }

  export interface PluginSessionResourceItem {
    readonly id: string
    readonly label: string
    readonly description?: string
    readonly icon?: "book-ai" | "repowiki"
  }

  export interface PluginSessionResourceProvider {
    listResources(
      input: { readonly cursor?: string },
      context: PluginSessionResourceContext,
    ):
      | { readonly items: readonly PluginSessionResourceItem[]; readonly nextCursor?: string }
      | Promise<{ readonly items: readonly PluginSessionResourceItem[]; readonly nextCursor?: string }>
    resolveResourcePreview(
      input: { readonly resourceId: string },
      context: PluginSessionResourceContext,
    ): { readonly title: string } | Promise<{ readonly title: string }>
  }

  export interface PluginDiagnosticsApi {
    emit(event: {
      readonly level: "debug" | "info" | "warn" | "error"
      readonly source: string
      readonly event: string
      readonly data?: Readonly<Record<string, string | number | boolean | null>>
    }): void
  }

  export interface QoderPluginApi {
    readonly node: { registerService(service: PluginNodeServiceDefinition): Disposable }
    readonly sessionResources: {
      registerProvider(contributionId: string, provider: PluginSessionResourceProvider): Disposable
    }
  }

  export interface PluginContext {
    readonly plugin: { readonly id: string; readonly name: string; readonly version: string }
    readonly extensionPath: string
    readonly storagePath: string
    readonly product: { readonly id: string }
    readonly diagnostics: PluginDiagnosticsApi
    readonly api: QoderPluginApi
    readonly subscriptions: Disposable[]
  }

  export type Activate = (context: PluginContext) => void | Promise<void>
}

declare module "@qoder/plugin-api/view" {
  import type { Disposable, PluginNodeJsonValue, PluginSessionViewResource } from "@qoder/plugin-api"

  export interface PluginViewContext {
    readonly pluginId: string
    readonly viewId: string
    readonly sourceSessionId: string | null
    readonly locale: string
    readonly sessionResource?: PluginSessionViewResource | null
    readonly api: {
      readonly lifecycle: {
        isActive(): boolean
        onDidChangeActive(listener: (active: boolean) => void): Disposable
      }
      readonly chat: { revealLocalSession(sessionId: string): Promise<void> }
      readonly node: {
        callService(
          serviceName: string,
          method: string,
          input?: Readonly<Record<string, PluginNodeJsonValue>>,
          options?: { readonly timeoutMs?: number },
        ): Promise<PluginNodeJsonValue>
      }
    }
  }

  export interface PluginViewRegistration {
    mount(container: HTMLElement, context: PluginViewContext): Disposable | void
    updateLocale?(locale: string): void
  }

  global {
    var qoderPluginView: { register(registration: PluginViewRegistration): void }
  }
}

declare module "@qoder-space/design-system" {
  import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react"

  export function Button(
    props: ButtonHTMLAttributes<HTMLButtonElement> & {
      readonly variant?: "primary" | "secondary" | "tertiary" | "ghost" | "text" | "outline"
      readonly size?: "sm" | "md" | "lg" | "custom"
      readonly children: ReactNode
    },
  ): ReactNode

  export function Input(props: InputHTMLAttributes<HTMLInputElement>): ReactNode
}
