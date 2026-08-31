import type { ProviderInstanceView } from "@noyau/contracts/entities/environment"
import { ChevronDownIcon } from "lucide-react"
import { type ReactElement, type ReactNode, useEffect, useState } from "react"

import {
  SettingsPage,
  SettingsSection,
  SettingsTarget,
} from "@/components/settings/settings-layout"
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useProviders } from "@/hooks/use-control-plane"
import { patchSettings } from "@/lib/control-plane"
import { resolveCursorReadiness } from "@/lib/cursor-readiness"
import { showFailureToast } from "@/lib/failure-toast"
import { orderedProviderViews, providerIconOf, providerLabelOf } from "@/lib/provider-presentation"
import {
  presentProviderInstanceConnection,
  presentProviderInstancePlan,
  presentProviderInstanceVersion,
  PROVIDER_STATUS_DOT_CLASS,
  type ProviderConnectionPresentation,
} from "@/lib/providers-catalog"
import { cn } from "@/lib/utils"

const settingsPatchFailure = {
  surface: "toast",
  tone: "warning",
  title: "Could not update provider settings",
  persistence: "until-dismissed",
} as const

function ProviderTitle({
  icon,
  statusDot,
  children,
}: {
  readonly icon: ReturnType<typeof providerIconOf>
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

function BinaryPathField({ view }: { readonly view: ProviderInstanceView }): ReactElement {
  const [value, setValue] = useState(view.binaryPath ?? "")

  useEffect(() => {
    setValue(view.binaryPath ?? "")
  }, [view.binaryPath, view.instanceId])

  const commit = () => {
    const next = value.trim()
    if (next === (view.binaryPath ?? "")) {
      return
    }
    void patchSettings({
      providerInstances: {
        [view.instanceId]: { config: { binaryPath: next } },
      },
    }).then((result) => {
      if (!result.ok) {
        setValue(view.binaryPath ?? "")
        showFailureToast(settingsPatchFailure)
      }
      return undefined
    })
  }

  return (
    <label className="block" htmlFor={`${view.instanceId}-binary-path`}>
      <span className="text-xs font-medium text-foreground">Binary path</span>
      <Input
        id={`${view.instanceId}-binary-path`}
        className="mt-1.5 font-mono"
        size="sm"
        value={value}
        placeholder={view.driver}
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
      />
      <span className="mt-1 block text-xs text-muted-foreground">
        Path to the {providerLabelOf(view.driver)} binary.
      </span>
    </label>
  )
}

function ProviderInstanceRow({ view }: { readonly view: ProviderInstanceView }): ReactElement {
  const connection = presentProviderInstanceConnection(view)
  const readiness = view.enabled ? resolveCursorReadiness(view) : "unknown"
  const version = presentProviderInstanceVersion(view)
  const plan = presentProviderInstancePlan(view)
  const isUnknown = view.enabled && readiness === "unknown"
  const title = providerLabelOf(view.driver)
  const subtitle = plan ?? (connection.detail === null ? connection.headline : null)

  const setEnabled = (enabled: boolean) => {
    void patchSettings({
      providerInstances: {
        [view.instanceId]: { enabled },
      },
    }).then((result) => {
      if (!result.ok) {
        showFailureToast(settingsPatchFailure)
      }
      return undefined
    })
  }

  return (
    <SettingsTarget
      id={`provider-${view.instanceId}`}
      className="rounded-xl transition-colors hover:bg-muted/20"
    >
      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center gap-3 px-3 py-3 text-left sm:px-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium tracking-[-0.005em] text-foreground">
              <ProviderTitle icon={providerIconOf(view.driver)} statusDot={connection.statusDot}>
                {title}
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
          <Switch
            checked={view.enabled}
            aria-label={`${view.enabled ? "Disable" : "Enable"} ${title}`}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={setEnabled}
          />
          <ChevronDownIcon
            className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-panel-open:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div className="px-3 pb-4 pt-2 sm:px-4">
            <BinaryPathField view={view} />
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </SettingsTarget>
  )
}

export function ProvidersSettingsPanel(): ReactElement {
  const providers = useProviders()
  const rows = orderedProviderViews(providers)

  return (
    <SettingsPage>
      <SettingsSection id="providers" title="Providers">
        {rows.map((view) => (
          <ProviderInstanceRow key={view.instanceId} view={view} />
        ))}
      </SettingsSection>
    </SettingsPage>
  )
}
