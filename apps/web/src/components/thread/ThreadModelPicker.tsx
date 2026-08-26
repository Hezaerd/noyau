import type { CursorModel, Provider } from "@noyau/protocol/entities/environment"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { useState } from "react"

import { ClaudeIcon, CodexIcon, CursorIcon, type ProviderIcon } from "@/components/provider-icons"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandCollection,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { composerOverlayGlassClassName } from "@/lib/composer-glass"
import { cn } from "@/lib/utils"

const automaticModelId = "__noyau_automatic__"

type ModelPickerItem = {
  readonly value: string
  readonly label: string
  readonly searchValue: string
}

const toItems = (
  models: ReadonlyArray<CursorModel>,
  provider: Provider,
  modelSelection: ModelSelection | null,
  activeProvider: Provider,
): ReadonlyArray<ModelPickerItem> => {
  const selected = models.find((model) => model.modelId === modelSelection?.modelId)
  const injectUnknown =
    modelSelection !== null && selected === undefined && provider === activeProvider
  return [
    ...models.map((model) => ({
      value: model.modelId,
      label: model.label,
      searchValue: `${model.label} ${model.modelId} ${provider}`,
    })),
    ...(injectUnknown
      ? [
          {
            value: modelSelection.modelId,
            label: modelSelection.modelId,
            searchValue: `${modelSelection.modelId} ${provider}`,
          },
        ]
      : []),
  ]
}

const providerIcons = {
  cursor: CursorIcon,
  claude: ClaudeIcon,
  codex: CodexIcon,
} as const satisfies Record<Provider, ProviderIcon>

const modelsFor = (
  provider: Provider,
  catalogs: {
    readonly cursor: ReadonlyArray<CursorModel>
    readonly claude: ReadonlyArray<CursorModel>
    readonly codex: ReadonlyArray<CursorModel>
  },
): ReadonlyArray<CursorModel> =>
  provider === "claude" ? catalogs.claude : provider === "codex" ? catalogs.codex : catalogs.cursor

export function ThreadModelPicker({
  cursorModels,
  claudeModels,
  codexModels,
  lockedProvider,
  selectedProvider,
  modelSelection,
  disabled,
  onModelSelectionChange,
  onProviderChange,
}: {
  readonly cursorModels: ReadonlyArray<CursorModel>
  readonly claudeModels: ReadonlyArray<CursorModel>
  readonly codexModels: ReadonlyArray<CursorModel>
  readonly lockedProvider?: Provider | undefined
  readonly selectedProvider?: Provider | undefined
  readonly modelSelection: ModelSelection | null
  readonly disabled: boolean
  readonly onModelSelectionChange: (modelSelection: ModelSelection | null) => void
  readonly onProviderChange?: ((provider: Provider) => void) | undefined
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const catalogs = { cursor: cursorModels, claude: claudeModels, codex: codexModels }
  const activeProvider: Provider = lockedProvider ?? selectedProvider ?? "cursor"
  const selectedModel = modelsFor(activeProvider, catalogs).find(
    (model) => model.modelId === modelSelection?.modelId,
  )
  const SelectedIcon = providerIcons[activeProvider]
  const automaticItem: ModelPickerItem = {
    value: automaticModelId,
    label: "Auto",
    searchValue: "Auto automatique",
  }
  const showProvider = (provider: Provider) =>
    lockedProvider === undefined || lockedProvider === provider
  const cursorItems = showProvider("cursor")
    ? toItems(cursorModels, "cursor", modelSelection, activeProvider)
    : []
  const claudeItems = showProvider("claude")
    ? toItems(claudeModels, "claude", modelSelection, activeProvider)
    : []
  const codexItems = showProvider("codex")
    ? toItems(codexModels, "codex", modelSelection, activeProvider)
    : []
  const groups = [
    { id: "automatic", label: "Sélection", items: [automaticItem] },
    ...(cursorItems.length > 0
      ? [{ id: "cursor" as const, label: "Cursor", items: cursorItems }]
      : []),
    ...(claudeItems.length > 0
      ? [{ id: "claude" as const, label: "Claude", items: claudeItems }]
      : []),
    ...(codexItems.length > 0 ? [{ id: "codex" as const, label: "Codex", items: codexItems }] : []),
  ]

  const selectModel = (value: string, groupId: string) => {
    setOpen(false)
    setQuery("")
    if (value === automaticModelId) {
      onModelSelectionChange(null)
      return
    }
    if (groupId === "cursor" || groupId === "claude" || groupId === "codex") {
      onProviderChange?.(groupId)
    }
    const provider =
      groupId === "cursor" || groupId === "claude" || groupId === "codex" ? groupId : activeProvider
    const models = modelsFor(provider, catalogs)
    const model = models.find((candidate) => candidate.modelId === value)
    const reasoningEffort = model?.reasoningEfforts.some(
      (effort) => effort.value === modelSelection?.reasoningEffort,
    )
      ? modelSelection?.reasoningEffort
      : undefined
    const serviceTier = model?.serviceTiers.some(
      (tier) => tier.value === modelSelection?.serviceTier,
    )
      ? modelSelection?.serviceTier
      : undefined
    const thinking = model?.thinking === undefined ? undefined : modelSelection?.thinking
    const nextSelection: ModelSelection = { modelId: value }
    if (reasoningEffort !== undefined) {
      Object.assign(nextSelection, { reasoningEffort })
    }
    if (serviceTier !== undefined) {
      Object.assign(nextSelection, { serviceTier })
    }
    if (thinking !== undefined) {
      Object.assign(nextSelection, { thinking })
    }
    onModelSelectionChange(nextSelection)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setQuery("")
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            aria-label="Modèle"
            className="max-w-52 justify-start"
          />
        }
      >
        <SelectedIcon aria-hidden="true" data-icon="inline-start" />
        <span className="truncate">
          {selectedModel?.label ?? modelSelection?.modelId ?? "Auto"}
        </span>
        <ChevronsUpDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverPopup
        side="top"
        align="start"
        className={cn("w-80 [&>[data-slot=popover-viewport]]:p-0", composerOverlayGlassClassName)}
      >
        <PopoverTitle className="sr-only">Choisir un modèle</PopoverTitle>
        <Command items={groups} value={query} onValueChange={setQuery}>
          <CommandInput placeholder="Rechercher un modèle…" aria-label="Rechercher un modèle" />
          <CommandEmpty>Aucun modèle trouvé.</CommandEmpty>
          <CommandList className="max-h-72">
            {(group) => (
              <CommandGroup key={group.id} items={group.items}>
                <CommandGroupLabel className="flex items-center gap-1.5">
                  {group.id === "cursor" ? <CursorIcon className="size-3" /> : null}
                  {group.id === "claude" ? <ClaudeIcon className="size-3" /> : null}
                  {group.id === "codex" ? <CodexIcon className="size-3" /> : null}
                  {group.label}
                </CommandGroupLabel>
                <CommandCollection>
                  {(item: ModelPickerItem) => (
                    <CommandItem
                      key={item.value}
                      value={item.searchValue}
                      className="gap-2"
                      onClick={() => selectModel(item.value, group.id)}
                    >
                      <span className="truncate">{item.label}</span>
                      {(modelSelection?.modelId ?? automaticModelId) === item.value ? (
                        <CheckIcon className="ms-auto" />
                      ) : null}
                    </CommandItem>
                  )}
                </CommandCollection>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverPopup>
    </Popover>
  )
}
