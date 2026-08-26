import { ChevronDownIcon } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import { ClaudeIcon, CodexIcon, CursorIcon, type ProviderIcon } from "@/components/provider-icons"
import {
  SettingsPage,
  SettingsSection,
  SettingsTarget,
} from "@/components/settings/settings-layout"
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useClaude, useCodex, useCursor } from "@/hooks/use-control-plane"
import { resolveCursorReadiness } from "@/lib/cursor-readiness"
import {
  presentClaudeConnection,
  presentClaudePlan,
  presentClaudeVersion,
  presentCodexConnection,
  presentCodexPlan,
  presentCodexVersion,
  presentCursorConnection,
  presentCursorPlan,
  presentCursorVersion,
  PROVIDER_CATALOG,
  PROVIDER_STATUS_DOT_CLASS,
  type ProviderCatalogEntry,
  type ProviderCatalogId,
  type ProviderConnectionPresentation,
} from "@/lib/providers-catalog"
import { cn } from "@/lib/utils"

const providerIcons = {
  cursor: CursorIcon,
  "claude-code": ClaudeIcon,
  codex: CodexIcon,
} as const satisfies Record<ProviderCatalogId, ProviderIcon>

function ProviderTitle({
  icon,
  statusDot,
  children,
}: {
  readonly icon: ProviderIcon
  readonly statusDot: ProviderConnectionPresentation["statusDot"]
  readonly children: ReactNode
}): ReactElement {
  const Icon = icon
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
        <Icon className="size-4" aria-hidden />
        <span
          className={cn(
            "pointer-events-none absolute -top-0.5 -left-0.5 size-2 rounded-full ring-2 ring-background",
            PROVIDER_STATUS_DOT_CLASS[statusDot],
          )}
          aria-hidden
        />
      </span>
      {children}
    </span>
  )
}

function HarnessProviderRow({
  provider,
  connection,
  version,
  plan,
  binaryPath,
  isUnknown,
  binaryId,
  binaryPlaceholder,
  binaryHint,
}: {
  readonly provider: ProviderCatalogEntry
  readonly connection: ProviderConnectionPresentation
  readonly version: string | null
  readonly plan: string | null
  readonly binaryPath: string | null | undefined
  readonly isUnknown: boolean
  readonly binaryId: string
  readonly binaryPlaceholder: string
  readonly binaryHint: string
}): ReactElement {
  const subtitle = plan ?? (connection.detail === null ? connection.headline : null)

  return (
    <SettingsTarget
      id={`provider-${provider.id}`}
      className="rounded-xl transition-colors hover:bg-muted/20"
    >
      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center gap-3 px-3 py-3 text-left sm:px-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium tracking-[-0.005em] text-foreground">
              <ProviderTitle icon={providerIcons[provider.id]} statusDot={connection.statusDot}>
                {provider.title}
                {version === null ? null : (
                  <code className="text-xs font-normal text-muted-foreground">{version}</code>
                )}
              </ProviderTitle>
            </span>
            {isUnknown ? (
              <Skeleton className="h-3.5 w-44" />
            ) : (
              <span className="max-w-xl text-[13px] leading-[1.45] text-muted-foreground">
                {subtitle === null ? (
                  <>
                    {connection.headline}
                    {connection.detail === null ? null : <> — {connection.detail}</>}
                  </>
                ) : (
                  subtitle
                )}
              </span>
            )}
          </div>
          <ChevronDownIcon
            className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-panel-open:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div className="px-3 pb-4 pt-2 sm:px-4">
            <label className="block" htmlFor={binaryId}>
              <span className="text-xs font-medium text-foreground">Chemin du binaire</span>
              <Input
                id={binaryId}
                className="mt-1.5 font-mono"
                readOnly
                size="sm"
                value={binaryPath ?? ""}
                placeholder={binaryPlaceholder}
                spellCheck={false}
              />
              <span className="mt-1 block text-xs text-muted-foreground">{binaryHint}</span>
            </label>
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </SettingsTarget>
  )
}

export function ProvidersSettingsPanel(): ReactElement {
  const cursor = useCursor()
  const claude = useClaude()
  const codex = useCodex()
  const cursorConnection = presentCursorConnection(cursor)
  const cursorReadiness = resolveCursorReadiness(cursor)
  const cursorVersion = presentCursorVersion(cursor?.version)
  const cursorPlan = presentCursorPlan(cursor?.plan)
  const cursorUnknown = cursorReadiness === "unknown"
  const claudeConnection = presentClaudeConnection(claude)
  const claudeReadiness = resolveCursorReadiness(claude)
  const claudeVersion = presentClaudeVersion(claude?.version)
  const claudePlan = presentClaudePlan(claude?.plan)
  const claudeUnknown = claudeReadiness === "unknown"
  const codexConnection = presentCodexConnection(codex)
  const codexReadiness = resolveCursorReadiness(codex)
  const codexVersion = presentCodexVersion(codex?.version)
  const codexPlan = presentCodexPlan(codex?.plan)
  const codexUnknown = codexReadiness === "unknown"

  return (
    <SettingsPage>
      <SettingsSection id="providers" title="Providers">
        {PROVIDER_CATALOG.map((provider) => {
          switch (provider.id) {
            case "cursor":
              return (
                <HarnessProviderRow
                  key={provider.id}
                  provider={provider}
                  connection={cursorConnection}
                  version={cursorVersion}
                  plan={cursorPlan}
                  binaryPath={cursor?.binaryPath}
                  isUnknown={cursorUnknown}
                  binaryId="cursor-binary-path"
                  binaryPlaceholder="cursor-agent"
                  binaryHint="Chemin vers le binaire de l’agent Cursor."
                />
              )
            case "claude-code":
              return (
                <HarnessProviderRow
                  key={provider.id}
                  provider={provider}
                  connection={claudeConnection}
                  version={claudeVersion}
                  plan={claudePlan}
                  binaryPath={claude?.binaryPath}
                  isUnknown={claudeUnknown}
                  binaryId="claude-binary-path"
                  binaryPlaceholder="claude"
                  binaryHint="Chemin vers le binaire Claude Code."
                />
              )
            case "codex":
              return (
                <HarnessProviderRow
                  key={provider.id}
                  provider={provider}
                  connection={codexConnection}
                  version={codexVersion}
                  plan={codexPlan}
                  binaryPath={codex?.binaryPath}
                  isUnknown={codexUnknown}
                  binaryId="codex-binary-path"
                  binaryPlaceholder="codex"
                  binaryHint="Chemin vers le binaire Codex."
                />
              )
          }
        })}
      </SettingsSection>
    </SettingsPage>
  )
}
