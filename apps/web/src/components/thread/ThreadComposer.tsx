import type { CursorModel } from "@noyau/protocol/entities/environment"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import {
  ChevronDownIcon,
  GaugeIcon,
  ImagePlusIcon,
  LockIcon,
  LockOpenIcon,
  PenLineIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"
import {
  useRef,
  type ClipboardEvent,
  type ComponentType,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react"

import { ThreadModelPicker } from "@/components/thread/ThreadModelPicker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group"
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import { Separator } from "@/components/ui/separator"
import type { ComposerImage } from "@/lib/composer-images"
import { isRuntimeMode, runtimeModes } from "@/lib/thread-commands"
import { cn } from "@/lib/utils"

const runtimeModeIcons = {
  "approval-required": LockIcon,
  "auto-accept-edits": PenLineIcon,
  auto: SparklesIcon,
  "full-access": LockOpenIcon,
} satisfies Record<RuntimeMode, ComponentType<{ className?: string }>>

const shouldSubmitComposerOnEnter = (event: {
  readonly key: string
  readonly shiftKey: boolean
  readonly isComposing: boolean
}) => event.key === "Enter" && !event.shiftKey && !event.isComposing

export function ThreadComposer({
  isRunning,
  disabled,
  text,
  images,
  runtimeMode,
  models,
  modelSelection,
  error,
  placement = "docked",
  onSubmit,
  onTextChange,
  onRuntimeModeChange,
  onModelSelectionChange,
  onPaste,
  onDrop,
  onImagesAdd,
  onImageRemove,
  onInterrupt,
}: {
  readonly isRunning: boolean
  readonly disabled: boolean
  readonly text: string
  readonly images: ReadonlyArray<ComposerImage>
  readonly runtimeMode: RuntimeMode
  readonly models: ReadonlyArray<CursorModel>
  readonly modelSelection: ModelSelection | null
  readonly error: ReactNode
  readonly placement?: "docked" | "hero"
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
  readonly onTextChange: (value: string) => void
  readonly onRuntimeModeChange: (runtimeMode: RuntimeMode) => void
  readonly onModelSelectionChange: (modelSelection: ModelSelection | null) => void
  readonly onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  readonly onDrop: (event: DragEvent<HTMLTextAreaElement>) => void
  readonly onImagesAdd: (files: ReadonlyArray<File>) => void
  readonly onImageRemove: (localId: string) => void
  readonly onInterrupt: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const controlsDisabled = isRunning || disabled
  const sendDisabled = (text.trim() === "" && images.length === 0) || controlsDisabled
  const selectedModel = models.find((model) => model.modelId === modelSelection?.modelId)
  const selectedEffort =
    selectedModel?.reasoningEfforts.find(
      (effort) => effort.value === modelSelection?.reasoningEffort,
    ) ?? selectedModel?.reasoningEfforts.find((effort) => effort.isDefault === true)
  const selectedTier =
    selectedModel?.serviceTiers.find((tier) => tier.value === modelSelection?.serviceTier) ??
    selectedModel?.serviceTiers.find((tier) => tier.isDefault === true)
  const selectedThinking = modelSelection?.thinking ?? selectedModel?.thinking?.defaultValue
  const hasTraits =
    (selectedModel?.reasoningEfforts.length ?? 0) > 0 ||
    (selectedModel?.serviceTiers.length ?? 0) > 0 ||
    selectedModel?.thinking !== undefined
  const traitsLabel = [
    (selectedModel?.reasoningEfforts.length ?? 0) > 0
      ? (selectedEffort?.label ?? "Effort")
      : undefined,
    (selectedModel?.serviceTiers.length ?? 0) > 0
      ? (selectedTier?.label ?? "Service tier")
      : undefined,
    selectedModel?.thinking === undefined
      ? undefined
      : `Réflexion ${selectedThinking === true ? "activée" : "désactivée"}`,
  ]
    .filter((label) => label !== undefined)
    .join(" · ")
  const selectedRuntimeMode =
    runtimeModes.find((mode) => mode.value === runtimeMode) ?? runtimeModes[0]
  const SelectedRuntimeModeIcon = runtimeModeIcons[runtimeMode]

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
      className={cn(placement === "hero" ? "w-full" : "sticky bottom-0 shrink-0 px-4 pb-4 sm:px-6")}
    >
      <div
        className={cn("flex flex-col gap-2", placement === "hero" ? "w-full" : "mx-auto max-w-3xl")}
      >
        <InputGroup className="rounded-xl bg-background has-[[data-slot=input-group-control]:focus-visible]:ring-0">
          {images.length === 0 ? null : (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {images.map((image) => (
                <span
                  key={image.localId}
                  className="relative size-16 overflow-hidden rounded-md border"
                >
                  <img
                    alt={image.upload.name}
                    src={image.previewUrl}
                    className="size-full object-cover"
                  />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    disabled={controlsDisabled}
                    aria-label={`Retirer ${image.upload.name}`}
                    className="absolute top-0.5 right-0.5 size-5"
                    onClick={() => {
                      onImageRemove(image.localId)
                    }}
                  >
                    <XIcon className="size-3" />
                  </Button>
                </span>
              ))}
            </div>
          )}
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
            className="max-h-52 min-h-24 overflow-hidden [&>textarea]:max-h-52 [&>textarea]:resize-none [&>textarea]:overflow-y-auto"
            placeholder="Écrire un message…"
            aria-label="Composer un message"
            autoFocus={placement === "hero"}
            disabled={controlsDisabled}
            rows={3}
          />
          <InputGroupAddon align="block-end" className="flex-wrap gap-1.5">
            <ThreadModelPicker
              models={models}
              modelSelection={modelSelection}
              disabled={controlsDisabled || models.length === 0}
              onModelSelectionChange={onModelSelectionChange}
            />

            <Separator orientation="vertical" className="mx-0.5 h-4" />

            {modelSelection !== null && hasTraits ? (
              <>
                <Menu>
                  <MenuTrigger
                    render={
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={controlsDisabled}
                        aria-label="Configuration du modèle"
                      />
                    }
                  >
                    <GaugeIcon data-icon="inline-start" />
                    <span className="max-w-36 truncate">{traitsLabel}</span>
                    <ChevronDownIcon data-icon="inline-end" />
                  </MenuTrigger>
                  <MenuPopup side="top" align="start" className="w-max">
                    {(selectedModel?.reasoningEfforts.length ?? 0) > 0 ? (
                      <MenuGroup>
                        <MenuGroupLabel>Niveau d’effort</MenuGroupLabel>
                        <MenuRadioGroup
                          value={selectedEffort?.value ?? ""}
                          onValueChange={(reasoningEffort) => {
                            onModelSelectionChange({ ...modelSelection, reasoningEffort })
                          }}
                        >
                          {selectedModel?.reasoningEfforts.map((effort) => (
                            <MenuRadioItem
                              key={effort.value}
                              value={effort.value}
                              closeOnClick
                              hideIndicator
                              className="py-2 data-checked:bg-accent data-checked:text-accent-foreground"
                            >
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="flex items-center gap-1.5">
                                  <span>{effort.label}</span>
                                  {effort.isDefault === true ? (
                                    <Badge variant="outline" size="sm">
                                      Par défaut
                                    </Badge>
                                  ) : null}
                                </span>
                                {effort.description === undefined ? null : (
                                  <span className="whitespace-nowrap text-muted-foreground text-xs">
                                    {effort.description}
                                  </span>
                                )}
                              </span>
                            </MenuRadioItem>
                          ))}
                        </MenuRadioGroup>
                      </MenuGroup>
                    ) : null}
                    {(selectedModel?.reasoningEfforts.length ?? 0) > 0 &&
                    ((selectedModel?.serviceTiers.length ?? 0) > 0 ||
                      selectedModel?.thinking !== undefined) ? (
                      <MenuSeparator />
                    ) : null}
                    {(selectedModel?.serviceTiers.length ?? 0) > 0 ? (
                      <MenuGroup>
                        <MenuGroupLabel>Service tier</MenuGroupLabel>
                        <MenuRadioGroup
                          value={selectedTier?.value ?? ""}
                          onValueChange={(serviceTier) => {
                            onModelSelectionChange({ ...modelSelection, serviceTier })
                          }}
                        >
                          {selectedModel?.serviceTiers.map((tier) => (
                            <MenuRadioItem
                              key={tier.value}
                              value={tier.value}
                              closeOnClick
                              hideIndicator
                              className="py-2 data-checked:bg-accent data-checked:text-accent-foreground"
                            >
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="flex items-center gap-1.5">
                                  <span>{tier.label}</span>
                                  {tier.isDefault === true ? (
                                    <Badge variant="outline" size="sm">
                                      Par défaut
                                    </Badge>
                                  ) : null}
                                </span>
                                {tier.description === undefined ? null : (
                                  <span className="whitespace-nowrap text-muted-foreground text-xs">
                                    {tier.description}
                                  </span>
                                )}
                              </span>
                            </MenuRadioItem>
                          ))}
                        </MenuRadioGroup>
                      </MenuGroup>
                    ) : null}
                    {(selectedModel?.serviceTiers.length ?? 0) > 0 &&
                    selectedModel?.thinking !== undefined ? (
                      <MenuSeparator />
                    ) : null}
                    {selectedModel?.thinking === undefined ? null : (
                      <MenuGroup>
                        <MenuGroupLabel>{selectedModel.thinking.label}</MenuGroupLabel>
                        <MenuRadioGroup
                          value={selectedThinking === true ? "on" : "off"}
                          onValueChange={(value) => {
                            onModelSelectionChange({ ...modelSelection, thinking: value === "on" })
                          }}
                        >
                          <MenuRadioItem
                            value="off"
                            closeOnClick
                            hideIndicator
                            className="py-2 data-checked:bg-accent data-checked:text-accent-foreground"
                          >
                            <span className="flex items-center gap-1.5">
                              <span>Désactivée</span>
                              {selectedModel.thinking.defaultValue === false ? (
                                <Badge variant="outline" size="sm">
                                  Par défaut
                                </Badge>
                              ) : null}
                            </span>
                          </MenuRadioItem>
                          <MenuRadioItem
                            value="on"
                            closeOnClick
                            hideIndicator
                            className="py-2 data-checked:bg-accent data-checked:text-accent-foreground"
                          >
                            <span className="flex items-center gap-1.5">
                              <span>Activée</span>
                              {selectedModel.thinking.defaultValue === true ? (
                                <Badge variant="outline" size="sm">
                                  Par défaut
                                </Badge>
                              ) : null}
                            </span>
                          </MenuRadioItem>
                        </MenuRadioGroup>
                      </MenuGroup>
                    )}
                  </MenuPopup>
                </Menu>
                <Separator orientation="vertical" className="mx-0.5 h-4" />
              </>
            ) : null}

            <Menu>
              <MenuTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={controlsDisabled}
                    aria-label="Niveau d’accès"
                    className="max-w-52"
                  />
                }
              >
                <SelectedRuntimeModeIcon data-icon="inline-start" />
                <span className="truncate">{selectedRuntimeMode.label}</span>
                <ChevronDownIcon data-icon="inline-end" />
              </MenuTrigger>
              <MenuPopup side="top" align="start" className="w-max">
                <MenuGroup>
                  <MenuGroupLabel>Niveau d’accès</MenuGroupLabel>
                  <MenuRadioGroup
                    value={runtimeMode}
                    onValueChange={(value) => {
                      if (isRuntimeMode(value)) {
                        onRuntimeModeChange(value)
                      }
                    }}
                  >
                    {runtimeModes.map((mode) => {
                      const ModeIcon = runtimeModeIcons[mode.value]
                      return (
                        <MenuRadioItem
                          key={mode.value}
                          value={mode.value}
                          closeOnClick
                          hideIndicator
                          className="py-2 data-checked:bg-accent data-checked:text-accent-foreground data-highlighted:bg-accent/60"
                        >
                          <span className="flex items-start gap-2">
                            <ModeIcon className="mt-0.5 shrink-0" />
                            <span className="flex flex-col gap-0.5">
                              <span className="font-medium">{mode.label}</span>
                              <span className="whitespace-nowrap text-muted-foreground text-xs leading-snug">
                                {mode.description}
                              </span>
                            </span>
                          </span>
                        </MenuRadioItem>
                      )
                    })}
                  </MenuRadioGroup>
                </MenuGroup>
              </MenuPopup>
            </Menu>

            <div className="ml-auto flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                hidden
                onChange={(event) => {
                  onImagesAdd(Array.from(event.target.files ?? []))
                  event.target.value = ""
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={controlsDisabled}
                aria-label="Joindre une image"
                onClick={() => {
                  fileInputRef.current?.click()
                }}
              >
                <ImagePlusIcon />
              </Button>
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
        {error === undefined ? null : <div id="thread-composer-error">{error}</div>}
      </div>
    </form>
  )
}
