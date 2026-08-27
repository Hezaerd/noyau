import type { CursorModel, Provider } from "@noyau/protocol/entities/environment"
import type {
  DefaultModelSelection,
  ModelSelection,
} from "@noyau/protocol/entities/model-selection"
import { CheckIcon, ChevronsUpDownIcon, PinIcon, StarIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { ClaudeIcon, CodexIcon, CursorIcon, type ProviderIcon } from "@/components/provider-icons"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandCollection,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { useKeybindingHandler } from "@/hooks/use-keybinding-handler"
import { useKeybinding } from "@/hooks/use-keybindings"
import {
  favoriteModelKey,
  persistFavoriteModels,
  readStoredFavoriteModels,
  type FavoriteModel,
} from "@/lib/model-picker-preferences"
import { cn } from "@/lib/utils"

type ProviderTab = "favorites" | Provider
type ModelPickerItem = {
  readonly provider: Provider
  readonly model: CursorModel
  readonly key: string
  readonly searchValue: string
  readonly favorite: boolean
}

const providerIcons = {
  cursor: CursorIcon,
  claude: ClaudeIcon,
  codex: CodexIcon,
} as const satisfies Record<Provider, ProviderIcon>

const providerLabels = {
  cursor: "Cursor",
  claude: "Claude Code",
  codex: "Codex",
} as const satisfies Record<Provider, string>

const sameDefault = (
  value: DefaultModelSelection | null,
  provider: Provider,
  modelId: string,
): boolean => value?.provider === provider && value.modelSelection.modelId === modelId

export function ThreadModelPicker({
  cursorModels,
  claudeModels,
  codexModels,
  availableProviders,
  lockedProvider,
  selectedProvider,
  modelSelection,
  defaultModelSelection,
  disabled,
  onModelSelectionChange,
  onProviderChange,
  onDefaultModelSelectionChange,
}: {
  readonly cursorModels: ReadonlyArray<CursorModel>
  readonly claudeModels: ReadonlyArray<CursorModel>
  readonly codexModels: ReadonlyArray<CursorModel>
  readonly availableProviders: ReadonlyArray<Provider>
  readonly lockedProvider?: Provider | undefined
  readonly selectedProvider?: Provider | undefined
  readonly modelSelection: ModelSelection | null
  readonly defaultModelSelection: DefaultModelSelection | null
  readonly disabled: boolean
  readonly onModelSelectionChange: (modelSelection: ModelSelection) => void
  readonly onProviderChange?: ((provider: Provider) => void) | undefined
  readonly onDefaultModelSelectionChange: (selection: DefaultModelSelection | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [favorites, setFavorites] = useState<ReadonlyArray<FavoriteModel>>(readStoredFavoriteModels)
  const catalogs = useMemo<Record<Provider, ReadonlyArray<CursorModel>>>(
    () => ({ cursor: cursorModels, claude: claudeModels, codex: codexModels }),
    [claudeModels, codexModels, cursorModels],
  )
  const allowedProviders = useMemo<ReadonlyArray<Provider>>(
    () => (lockedProvider === undefined ? availableProviders : [lockedProvider]),
    [availableProviders, lockedProvider],
  )
  const activeProvider = lockedProvider ?? selectedProvider ?? allowedProviders[0] ?? "cursor"
  const [activeTab, setActiveTab] = useState<ProviderTab>(activeProvider)
  const modelPickerHotkey = useKeybinding("thread.model-picker.open")
  const favoriteKeys = useMemo(() => new Set(favorites.map(favoriteModelKey)), [favorites])
  const selectedModel = catalogs[activeProvider].find(
    (model) => model.modelId === modelSelection?.modelId,
  )
  const SelectedIcon = providerIcons[activeProvider]

  useEffect(() => {
    if (activeTab !== "favorites" && !allowedProviders.includes(activeTab)) {
      setActiveTab(allowedProviders[0] ?? "favorites")
    }
  }, [activeTab, allowedProviders])

  useKeybindingHandler("thread.model-picker.open", () => setOpen(true), !disabled)

  const allItems = useMemo(() => {
    const items = allowedProviders.flatMap((provider) =>
      catalogs[provider].map((model): ModelPickerItem => {
        const favorite = favoriteKeys.has(favoriteModelKey({ provider, modelId: model.modelId }))
        return {
          provider,
          model,
          key: `${provider}:${model.modelId}`,
          searchValue: `${model.label} ${model.modelId} ${providerLabels[provider]}`,
          favorite,
        }
      }),
    )
    return items.toSorted((left, right) => Number(right.favorite) - Number(left.favorite))
  }, [allowedProviders, catalogs, favoriteKeys])

  const visibleItems = useMemo(() => {
    if (query.trim() !== "") return allItems
    if (activeTab === "favorites") return allItems.filter((item) => item.favorite)
    return allItems.filter((item) => item.provider === activeTab)
  }, [activeTab, allItems, query])

  const selectModel = (item: ModelPickerItem) => {
    setOpen(false)
    setQuery("")
    onProviderChange?.(item.provider)
    const nextSelection: ModelSelection = { modelId: item.model.modelId }
    if (
      item.model.reasoningEfforts.some((value) => value.value === modelSelection?.reasoningEffort)
    ) {
      Object.assign(nextSelection, { reasoningEffort: modelSelection?.reasoningEffort })
    }
    if (item.model.serviceTiers.some((value) => value.value === modelSelection?.serviceTier)) {
      Object.assign(nextSelection, { serviceTier: modelSelection?.serviceTier })
    }
    if (item.model.thinking !== undefined && modelSelection?.thinking !== undefined) {
      Object.assign(nextSelection, { thinking: modelSelection.thinking })
    }
    onModelSelectionChange(nextSelection)
  }

  const toggleFavorite = (item: ModelPickerItem) => {
    const next = item.favorite
      ? favorites.filter(
          (favorite) =>
            favorite.provider !== item.provider || favorite.modelId !== item.model.modelId,
        )
      : [...favorites, { provider: item.provider, modelId: item.model.modelId }]
    setFavorites(next)
    persistFavoriteModels(next)
  }

  const toggleDefault = (item: ModelPickerItem) => {
    onDefaultModelSelectionChange(
      sameDefault(defaultModelSelection, item.provider, item.model.modelId)
        ? null
        : { provider: item.provider, modelSelection: { modelId: item.model.modelId } },
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setQuery("")
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            aria-label={`Modèle (${modelPickerHotkey})`}
            className="max-w-52 justify-start"
          />
        }
      >
        <SelectedIcon aria-hidden="true" data-icon="inline-start" />
        <span className="truncate">
          {selectedModel?.label ?? modelSelection?.modelId ?? "Choisir un modèle"}
        </span>
        <ChevronsUpDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverPopup side="top" align="start" className="w-96 [&>[data-slot=popover-viewport]]:p-0">
        <PopoverTitle className="sr-only">Choisir un modèle</PopoverTitle>
        <Command items={visibleItems} value={query} onValueChange={setQuery}>
          <CommandInput placeholder="Rechercher un modèle…" aria-label="Rechercher un modèle" />
          <div
            role="tablist"
            aria-label="Providers"
            className="flex gap-1 overflow-x-auto border-b px-2 py-2"
          >
            <Button
              type="button"
              role="tab"
              aria-selected={activeTab === "favorites"}
              size="xs"
              variant={activeTab === "favorites" ? "secondary" : "ghost"}
              onClick={() => setActiveTab("favorites")}
            >
              <StarIcon className="size-3.5" /> Favoris
            </Button>
            {allowedProviders.map((provider) => {
              const Icon = providerIcons[provider]
              return (
                <Button
                  key={provider}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === provider}
                  size="xs"
                  variant={activeTab === provider ? "secondary" : "ghost"}
                  onClick={() => setActiveTab(provider)}
                >
                  <Icon className="size-3.5" /> {providerLabels[provider]}
                </Button>
              )
            })}
          </div>
          <CommandEmpty>Aucun modèle trouvé.</CommandEmpty>
          <CommandList className="max-h-80 p-1">
            <CommandCollection>
              {(item: ModelPickerItem) => {
                const Icon = providerIcons[item.provider]
                const selected =
                  item.provider === activeProvider && item.model.modelId === modelSelection?.modelId
                const isDefault = sameDefault(
                  defaultModelSelection,
                  item.provider,
                  item.model.modelId,
                )
                return (
                  <CommandItem
                    key={item.key}
                    value={item.searchValue}
                    className="group gap-3 rounded-lg px-3 py-2.5"
                    onClick={() => selectModel(item)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{item.model.label}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon className="size-3.5" /> {providerLabels[item.provider]}
                      </div>
                    </div>
                    {selected ? (
                      <CheckIcon className="size-4" aria-label="Modèle sélectionné" />
                    ) : null}
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={isDefault ? "Retirer le modèle par défaut" : "Définir par défaut"}
                      title={isDefault ? "Modèle par défaut" : "Définir par défaut"}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleDefault(item)
                      }}
                    >
                      <PinIcon className={cn("size-3.5", isDefault && "fill-current")} />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={item.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                      title={item.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleFavorite(item)
                      }}
                    >
                      <StarIcon
                        className={cn(
                          "size-3.5",
                          item.favorite && "fill-yellow-500 text-yellow-500",
                        )}
                      />
                    </Button>
                  </CommandItem>
                )
              }}
            </CommandCollection>
          </CommandList>
        </Command>
      </PopoverPopup>
    </Popover>
  )
}
