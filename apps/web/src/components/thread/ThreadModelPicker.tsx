import type { CursorModel } from "@noyau/protocol/entities/environment"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { useState } from "react"

import { CursorIcon } from "@/components/provider-icons"
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

const automaticModelId = "__noyau_automatic__"

type ModelPickerItem = {
  readonly value: string
  readonly label: string
  readonly searchValue: string
}

export function ThreadModelPicker({
  models,
  modelSelection,
  disabled,
  onModelSelectionChange,
}: {
  readonly models: ReadonlyArray<CursorModel>
  readonly modelSelection: ModelSelection | null
  readonly disabled: boolean
  readonly onModelSelectionChange: (modelSelection: ModelSelection | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const selectedModel = models.find((model) => model.modelId === modelSelection?.modelId)
  const automaticItem: ModelPickerItem = {
    value: automaticModelId,
    label: "Auto",
    searchValue: "Auto automatique",
  }
  const cursorItems: ReadonlyArray<ModelPickerItem> = [
    ...models.map((model) => ({
      value: model.modelId,
      label: model.label,
      searchValue: `${model.label} ${model.modelId} Cursor`,
    })),
    ...(modelSelection !== null && selectedModel === undefined
      ? [
          {
            value: modelSelection.modelId,
            label: modelSelection.modelId,
            searchValue: `${modelSelection.modelId} Cursor`,
          },
        ]
      : []),
  ]
  const groups = [
    { id: "automatic", label: "Sélection", items: [automaticItem] },
    { id: "cursor", label: "Cursor", items: cursorItems },
  ]

  const selectModel = (value: string) => {
    setOpen(false)
    setQuery("")
    if (value === automaticModelId) {
      onModelSelectionChange(null)
      return
    }

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
        <CursorIcon aria-hidden="true" data-icon="inline-start" />
        <span className="truncate">
          {selectedModel?.label ?? modelSelection?.modelId ?? "Auto"}
        </span>
        <ChevronsUpDownIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverPopup side="top" align="start" className="w-80 [&>[data-slot=popover-viewport]]:p-0">
        <PopoverTitle className="sr-only">Choisir un modèle</PopoverTitle>
        <Command items={groups} value={query} onValueChange={setQuery}>
          <CommandInput placeholder="Rechercher un modèle…" aria-label="Rechercher un modèle" />
          <CommandEmpty>Aucun modèle trouvé.</CommandEmpty>
          <CommandList className="max-h-72">
            {(group) => (
              <CommandGroup key={group.id} items={group.items}>
                <CommandGroupLabel className="flex items-center gap-1.5">
                  {group.id === "cursor" ? <CursorIcon className="size-3" /> : null}
                  {group.label}
                </CommandGroupLabel>
                <CommandCollection>
                  {(item: ModelPickerItem) => (
                    <CommandItem
                      key={item.value}
                      value={item.searchValue}
                      className="gap-2"
                      onClick={() => selectModel(item.value)}
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
