import type { CursorModel } from "@noyau/protocol/entities/environment"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group"
import {
  Select,
  SelectGroup,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { isRuntimeMode, runtimeModes } from "@/lib/thread-commands"

const automaticValue = "__noyau_automatic__"

const shouldSubmitComposerOnEnter = (event: {
  readonly key: string
  readonly shiftKey: boolean
  readonly isComposing: boolean
}) => event.key === "Enter" && !event.shiftKey && !event.isComposing

export function ThreadComposer({
  isRunning,
  disabled,
  text,
  runtimeMode,
  models,
  modelSelection,
  error,
  onSubmit,
  onTextChange,
  onRuntimeModeChange,
  onModelSelectionChange,
  onPaste,
  onDrop,
  onInterrupt,
}: {
  readonly isRunning: boolean
  readonly disabled: boolean
  readonly text: string
  readonly runtimeMode: RuntimeMode
  readonly models: ReadonlyArray<CursorModel>
  readonly modelSelection: ModelSelection | null
  readonly error: string | undefined
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
  readonly onTextChange: (value: string) => void
  readonly onRuntimeModeChange: (runtimeMode: RuntimeMode) => void
  readonly onModelSelectionChange: (modelSelection: ModelSelection | null) => void
  readonly onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  readonly onDrop: (event: DragEvent<HTMLTextAreaElement>) => void
  readonly onInterrupt: () => void
}) {
  const sendDisabled = text.trim() === "" || isRunning || disabled
  const selectedModel = models.find((model) => model.modelId === modelSelection?.modelId)
  const modelItems = [
    { value: automaticValue, label: "Modèle automatique" },
    ...models.map((model) => ({ value: model.modelId, label: model.label })),
    ...(modelSelection !== null && selectedModel === undefined
      ? [{ value: modelSelection.modelId, label: modelSelection.modelId }]
      : []),
  ]
  const effortItems = [
    { value: automaticValue, label: "Effort automatique" },
    ...(selectedModel?.reasoningEfforts ?? []),
  ]
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      !shouldSubmitComposerOnEnter({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      return
    }
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <form
      onSubmit={onSubmit}
      className="sticky bottom-0 z-20 shrink-0 border-t bg-background/95 p-4 backdrop-blur-xl sm:px-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <InputGroup>
          <InputGroupTextarea
            value={text}
            onChange={(event) => {
              onTextChange(event.target.value)
            }}
            onKeyDown={handleKeyDown}
            onPaste={onPaste}
            onDrop={onDrop}
            onDragOver={(event) => {
              if (Array.from(event.dataTransfer.types).includes("Files")) {
                event.preventDefault()
              }
            }}
            className="min-h-24 max-h-60"
            placeholder="Écrire un message…"
            aria-label="Composer un message"
            disabled={isRunning || disabled}
            rows={3}
          />
          <InputGroupAddon align="block-end" className="flex-wrap gap-2">
            <Select
              items={modelItems}
              value={modelSelection?.modelId ?? automaticValue}
              disabled={isRunning || disabled || models.length === 0}
              onValueChange={(value) => {
                if (value === null || value === automaticValue) {
                  onModelSelectionChange(null)
                  return
                }
                const model = models.find((candidate) => candidate.modelId === value)
                const reasoningEffort = model?.reasoningEfforts.some(
                  (effort) => effort.value === modelSelection?.reasoningEffort,
                )
                  ? modelSelection?.reasoningEffort
                  : undefined
                onModelSelectionChange(
                  reasoningEffort === undefined
                    ? { modelId: value }
                    : { modelId: value, reasoningEffort },
                )
              }}
            >
              <SelectTrigger size="sm" className="w-auto max-w-52" aria-label="Modèle">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup alignItemWithTrigger={false}>
                <SelectGroup>
                  {modelItems.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectPopup>
            </Select>
            <Select
              items={effortItems}
              value={modelSelection?.reasoningEffort ?? automaticValue}
              disabled={
                isRunning ||
                disabled ||
                modelSelection === null ||
                (selectedModel?.reasoningEfforts.length ?? 0) === 0
              }
              onValueChange={(value) => {
                if (modelSelection === null) {
                  return
                }
                onModelSelectionChange(
                  value === null || value === automaticValue
                    ? { modelId: modelSelection.modelId }
                    : { modelId: modelSelection.modelId, reasoningEffort: value },
                )
              }}
            >
              <SelectTrigger size="sm" className="w-auto max-w-44" aria-label="Effort">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup alignItemWithTrigger={false}>
                <SelectGroup>
                  {effortItems.map((effort) => (
                    <SelectItem key={effort.value} value={effort.value}>
                      {effort.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectPopup>
            </Select>
            <Select
              items={runtimeModes}
              value={runtimeMode}
              disabled={isRunning || disabled}
              onValueChange={(value) => {
                if (value !== null && isRuntimeMode(value)) {
                  onRuntimeModeChange(value)
                }
              }}
            >
              <SelectTrigger size="sm" className="w-auto max-w-52" aria-label="Niveau d’accès">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup alignItemWithTrigger={false}>
                <SelectGroup>
                  {runtimeModes.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectPopup>
            </Select>
            <div className="ml-auto flex gap-2">
              {isRunning ? (
                <Button type="button" size="sm" variant="outline" onClick={onInterrupt}>
                  Interrompre
                </Button>
              ) : null}
              <Button type="submit" size="sm" disabled={sendDisabled}>
                Envoyer
              </Button>
            </div>
          </InputGroupAddon>
        </InputGroup>
        {error === undefined ? null : (
          <p className="text-xs text-muted-foreground" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}
