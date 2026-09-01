import {
  DEFAULT_PROVIDER_INSTANCE_ID,
  type CursorModel,
  type Provider,
} from "@noyau/contracts/entities/environment"
import type {
  DefaultModelSelection,
  ModelSelection,
} from "@noyau/contracts/entities/model-selection"
import { CheckIcon, ChevronRightIcon, ChevronsUpDownIcon, PinIcon, StarIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

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
import { useProviders } from "@/hooks/use-control-plane"
import { useKeybindingHandler } from "@/hooks/use-keybinding-handler"
import { useKeybinding } from "@/hooks/use-keybindings"
import {
  favoriteModelKey,
  persistFavoriteModels,
  readStoredFavoriteModels,
  type FavoriteModel,
} from "@/lib/model-picker-preferences"
import { providerInstanceIconOf, providerInstanceLabelOf } from "@/lib/provider-presentation"
import { cn } from "@/lib/utils"

type ProviderTab = "favorites" | Provider
type ModelPickerItem = {
  readonly kind: "model"
  readonly provider: Provider
  readonly model: CursorModel
  readonly key: string
  readonly searchValue: string
  readonly favorite: boolean
}
type LegacySectionItem = {
  readonly kind: "legacy-section"
  readonly provider: Provider
  readonly key: string
  readonly searchValue: string
  readonly count: number
  readonly expanded: boolean
}
type ModelPickerEntry = ModelPickerItem | LegacySectionItem

const LEGACY_SECTION_PREFIX = "model-picker-legacy:"
const legacySectionKey = (provider: Provider): string => `${LEGACY_SECTION_PREFIX}${provider}`

const sameDefault = (
  value: DefaultModelSelection | null,
  provider: Provider,
  modelId: string,
): boolean => value?.provider === provider && value.modelSelection.modelId === modelId

export function ThreadModelPicker({
  modelsByProvider,
  availableProviders,
  lockedProvider,
  selectedProvider,
  modelSelection,
  defaultModelSelection,
  disabled,
  onModelSelectionChange,
  onProviderChange,
  onDefaultModelSelectionChange,
  onOpenChange,
}: {
  readonly modelsByProvider: Readonly<Record<string, ReadonlyArray<CursorModel>>>
  readonly availableProviders: ReadonlyArray<Provider>
  readonly lockedProvider?: Provider | undefined
  readonly selectedProvider?: Provider | undefined
  readonly modelSelection: ModelSelection | null
  readonly defaultModelSelection: DefaultModelSelection | null
  readonly disabled: boolean
  readonly onModelSelectionChange: (modelSelection: ModelSelection) => void
  readonly onProviderChange?: ((provider: Provider) => void) | undefined
  readonly onDefaultModelSelectionChange: (selection: DefaultModelSelection | null) => void
  readonly onOpenChange?: ((open: boolean) => void) | undefined
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [favorites, setFavorites] = useState<ReadonlyArray<FavoriteModel>>(readStoredFavoriteModels)
  const providers = useProviders()
  const catalogs = modelsByProvider
  const allowedProviders = useMemo<ReadonlyArray<Provider>>(
    () => (lockedProvider === undefined ? availableProviders : [lockedProvider]),
    [availableProviders, lockedProvider],
  )
  const activeProvider =
    lockedProvider ?? selectedProvider ?? allowedProviders[0] ?? DEFAULT_PROVIDER_INSTANCE_ID
  const [activeTab, setActiveTab] = useState<ProviderTab>(() =>
    favorites.some(
      (favorite) =>
        allowedProviders.includes(favorite.provider) &&
        (catalogs[favorite.provider] ?? []).some((model) => model.modelId === favorite.modelId),
    )
      ? "favorites"
      : activeProvider,
  )
  const [expandedLegacyProviders, setExpandedLegacyProviders] = useState<ReadonlySet<Provider>>(
    () => new Set(),
  )
  const modelPickerHotkey = useKeybinding("thread.model-picker.open")
  const favoriteKeys = useMemo(() => new Set(favorites.map(favoriteModelKey)), [favorites])
  const selectedModel = (catalogs[activeProvider] ?? []).find(
    (model) => model.modelId === modelSelection?.modelId,
  )
  const SelectedIcon = providerInstanceIconOf(activeProvider, providers)

  useEffect(() => {
    if (activeTab !== "favorites" && !allowedProviders.includes(activeTab)) {
      setActiveTab(allowedProviders[0] ?? "favorites")
    }
  }, [activeTab, allowedProviders])

  useEffect(() => {
    const selectedIsLegacy = (catalogs[activeProvider] ?? []).some(
      (model) => model.modelId === modelSelection?.modelId && model.isLegacy === true,
    )
    if (!selectedIsLegacy) return
    setExpandedLegacyProviders((expanded) => {
      if (expanded.has(activeProvider)) return expanded
      return new Set([...expanded, activeProvider])
    })
  }, [activeProvider, catalogs, modelSelection?.modelId])

  const changeOpen = (nextOpen: boolean) => {
    onOpenChange?.(nextOpen)
    setOpen(nextOpen)
    if (!nextOpen) setQuery("")
  }

  useKeybindingHandler("thread.model-picker.open", () => changeOpen(true), !disabled)

  const allItems = useMemo(() => {
    const items = allowedProviders.flatMap((provider) =>
      (catalogs[provider] ?? []).map((model): ModelPickerItem => {
        const favorite = favoriteKeys.has(favoriteModelKey({ provider, modelId: model.modelId }))
        return {
          kind: "model",
          provider,
          model,
          key: `${provider}:${model.modelId}`,
          searchValue: `${model.label} ${model.modelId} ${providerInstanceLabelOf(provider, providers)}`,
          favorite,
        }
      }),
    )
    return items.toSorted((left, right) => Number(right.favorite) - Number(left.favorite))
  }, [allowedProviders, catalogs, favoriteKeys, providers])

  const visibleItems = useMemo(() => {
    if (query.trim() !== "") return allItems
    if (activeTab === "favorites") return allItems.filter((item) => item.favorite)
    const providerItems = allItems.filter((item) => item.provider === activeTab)
    const currentItems = providerItems.filter((item) => item.model.isLegacy !== true)
    const legacyItems = providerItems.filter((item) => item.model.isLegacy === true)
    if (legacyItems.length === 0) return currentItems
    const expanded = expandedLegacyProviders.has(activeTab)
    const section: LegacySectionItem = {
      kind: "legacy-section",
      provider: activeTab,
      key: legacySectionKey(activeTab),
      searchValue: legacySectionKey(activeTab),
      count: legacyItems.length,
      expanded,
    }
    return [...currentItems, section, ...(expanded ? legacyItems : [])]
  }, [activeTab, allItems, expandedLegacyProviders, query])

  const toggleLegacySection = (provider: Provider) => {
    setExpandedLegacyProviders((expanded) => {
      const next = new Set(expanded)
      if (next.has(provider)) next.delete(provider)
      else next.add(provider)
      return next
    })
  }

  const selectModel = (item: ModelPickerItem) => {
    changeOpen(false)
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
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            aria-label={`Model (${modelPickerHotkey})`}
            className="max-w-52 justify-start"
          />
        }
      >
        <SelectedIcon aria-hidden="true" data-icon="inline-start" />
        <span className="truncate">
          {selectedModel?.label ?? modelSelection?.modelId ?? "Choose a model"}
        </span>
        <ChevronsUpDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverPopup
        side="top"
        align="start"
        finalFocus={false}
        className="w-96 [&>[data-slot=popover-viewport]]:p-0"
      >
        <PopoverTitle className="sr-only">Choose a model</PopoverTitle>
        <div className="flex min-h-80 overflow-hidden">
          <div
            role="tablist"
            aria-label="Providers"
            aria-orientation="vertical"
            className="flex w-12 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-muted/30 p-1"
          >
            <Button
              type="button"
              role="tab"
              aria-selected={activeTab === "favorites"}
              aria-label="Favorites"
              title="Favorites"
              size="icon-lg"
              variant={activeTab === "favorites" ? "secondary" : "ghost"}
              className="w-full"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setActiveTab("favorites")}
            >
              <StarIcon className="size-5 fill-current" />
            </Button>
            <div className="mx-1 border-b" aria-hidden="true" />
            {allowedProviders.map((provider) => {
              const Icon = providerInstanceIconOf(provider, providers)
              const label = providerInstanceLabelOf(provider, providers)
              return (
                <Button
                  key={provider}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === provider}
                  aria-label={label}
                  title={label}
                  size="icon-lg"
                  variant={activeTab === provider ? "secondary" : "ghost"}
                  className="w-full"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setActiveTab(provider)}
                >
                  <Icon className="size-5" />
                </Button>
              )
            })}
          </div>
          <Command
            items={visibleItems}
            value={query}
            onValueChange={(value) => {
              if (!value.startsWith(LEGACY_SECTION_PREFIX)) setQuery(value)
            }}
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="border-b">
                <CommandInput placeholder="Search a model…" aria-label="Search a model" />
              </div>
              <CommandEmpty>No models found.</CommandEmpty>
              <CommandList className="max-h-80 flex-1 p-1">
                <CommandCollection>
                  {(item: ModelPickerEntry) => {
                    if (item.kind === "legacy-section") {
                      return (
                        <CommandItem
                          key={item.key}
                          value={item.searchValue}
                          aria-expanded={item.expanded}
                          className="group gap-3 rounded-lg px-3 py-2.5"
                          onClick={() => toggleLegacySection(item.provider)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">Legacy models</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.count} {item.count === 1 ? "model" : "models"}
                            </div>
                          </div>
                          <ChevronRightIcon
                            className={cn(
                              "size-4 transition-transform",
                              item.expanded && "rotate-90",
                            )}
                          />
                        </CommandItem>
                      )
                    }
                    const Icon = providerInstanceIconOf(item.provider, providers)
                    const selected =
                      item.provider === activeProvider &&
                      item.model.modelId === modelSelection?.modelId
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
                            <Icon className="size-3.5" />{" "}
                            {providerInstanceLabelOf(item.provider, providers)}
                          </div>
                        </div>
                        {selected ? (
                          <CheckIcon className="size-4" aria-label="Selected model" />
                        ) : null}
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={isDefault ? "Remove the default model" : "Set as default"}
                          title={isDefault ? "Default model" : "Set as default"}
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
                          aria-label={item.favorite ? "Remove from favorites" : "Add to favorites"}
                          title={item.favorite ? "Remove from favorites" : "Add to favorites"}
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
            </div>
          </Command>
        </div>
      </PopoverPopup>
    </Popover>
  )
}
