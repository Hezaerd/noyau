import type { CursorModel } from "@noyau/protocol/entities/environment"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { WorkspacePathEntry } from "@noyau/protocol/entities/workspace-path"
import { serializeComposerTicketMention } from "@noyau/shared/composer-inline-tokens"
import {
  detectComposerTrigger,
  replaceTextRange,
  serializeComposerMentionPath,
} from "@noyau/shared/composer-trigger"
import {
  ArrowUpIcon,
  ChevronDownIcon,
  GaugeIcon,
  LockIcon,
  LockOpenIcon,
  PenLineIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type ComponentType,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react"

import { ComposerMentionMenu } from "@/components/thread/ComposerMentionMenu"
import {
  ComposerPromptField,
  type ComposerPromptFieldHandle,
} from "@/components/thread/ComposerPromptField"
import { ExpandedImageDialog } from "@/components/thread/ExpandedImageDialog"
import { ImageThumbnail } from "@/components/thread/ImageThumbnail"
import { ThreadModelPicker } from "@/components/thread/ThreadModelPicker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group"
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
import {
  buildComposerMentionEntries,
  EMPTY_COMPOSER_TICKETS,
  filterComposerTickets,
  type ComposerMentionEntry,
  type ComposerTicket,
} from "@/lib/composer-tickets"
import { buildExpandedImagePreview, type ExpandedImagePreview } from "@/lib/expanded-image-preview"
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
  onImageRemove,
  onInterrupt,
  searchPaths,
  tickets = EMPTY_COMPOSER_TICKETS,
  context,
  toolbar,
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
  readonly onPaste: (event: ClipboardEvent<HTMLElement>) => void
  readonly onDrop: (event: DragEvent<HTMLElement>) => void
  readonly onImageRemove: (localId: string) => void
  readonly onInterrupt: () => void
  readonly searchPaths?: (query: string) => Promise<ReadonlyArray<WorkspacePathEntry>>
  readonly tickets?: ReadonlyArray<ComposerTicket> | undefined
  readonly context?: ReactNode
  readonly toolbar?: ReactNode
}) {
  const listboxId = useId()
  const fieldRef = useRef<ComposerPromptFieldHandle>(null)
  const pendingCursor = useRef<number | null>(null)
  const [cursor, setCursor] = useState(text.length)
  const [expandedImage, setExpandedImage] = useState<ExpandedImagePreview | null>(null)
  const [pathEntries, setPathEntries] = useState<ReadonlyArray<WorkspacePathEntry>>([])
  const [pathSearchLoading, setPathSearchLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null)
  const trigger = detectComposerTrigger(text, cursor)
  const mentionQuery = trigger?.kind === "path" ? trigger.query : null
  const mentionMenuOpen =
    mentionQuery !== null &&
    dismissedQuery !== mentionQuery &&
    (searchPaths !== undefined || tickets.length > 0)
  const ticketEntries = mentionQuery === null ? [] : filterComposerTickets(tickets, mentionQuery)
  const mentionEntries = buildComposerMentionEntries(ticketEntries, pathEntries)
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

  useEffect(() => {
    const nextCursor = pendingCursor.current
    if (nextCursor === null) {
      return
    }
    pendingCursor.current = null
    fieldRef.current?.setCursor(nextCursor)
    setCursor(nextCursor)
  }, [text])

  useEffect(() => {
    if (searchPaths === undefined || mentionQuery === null || dismissedQuery === mentionQuery) {
      setPathEntries([])
      setPathSearchLoading(false)
      return
    }
    let cancelled = false
    setPathSearchLoading(true)
    const handle = globalThis.setTimeout(() => {
      void searchPaths(mentionQuery).then((entries) => {
        if (!cancelled) {
          setPathEntries(entries)
          setHighlightedIndex(0)
          setPathSearchLoading(false)
        }
        return undefined
      })
    }, 150)
    return () => {
      cancelled = true
      globalThis.clearTimeout(handle)
    }
  }, [dismissedQuery, mentionQuery, searchPaths])

  const insertMention = (entry: ComposerMentionEntry) => {
    if (trigger === null || trigger.kind !== "path") {
      return
    }
    const mention =
      entry.kind === "ticket"
        ? `@${serializeComposerTicketMention(entry.ticketId)} `
        : `@${serializeComposerMentionPath(entry.path)} `
    const next = replaceTextRange(text, trigger.rangeStart, trigger.rangeEnd, mention)
    pendingCursor.current = next.cursor
    setDismissedQuery(null)
    onTextChange(next.text)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      const next = replaceTextRange(text, cursor, cursor, "\n")
      pendingCursor.current = next.cursor
      onTextChange(next.text)
      return
    }
    if (mentionMenuOpen && mentionEntries.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setHighlightedIndex((index) => Math.min(mentionEntries.length - 1, index + 1))
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setHighlightedIndex((index) => Math.max(0, index - 1))
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const entry = mentionEntries[highlightedIndex]
        if (entry !== undefined) {
          event.preventDefault()
          insertMention(entry)
        }
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setDismissedQuery(mentionQuery)
        return
      }
    }
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
    event.currentTarget.closest("form")?.requestSubmit()
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(placement === "hero" ? "w-full" : "sticky bottom-0 shrink-0 px-4 pb-4 sm:px-6")}
    >
      <div
        className={cn(
          "relative flex flex-col",
          placement === "hero" ? "w-full" : "mx-auto max-w-3xl",
          context === undefined ? "gap-2" : "gap-0",
        )}
      >
        {mentionMenuOpen ? (
          <ComposerMentionMenu
            entries={mentionEntries}
            highlightedIndex={highlightedIndex}
            id={listboxId}
            loading={pathSearchLoading}
            onHighlight={setHighlightedIndex}
            onSelect={insertMention}
          />
        ) : null}
        {toolbar === undefined ? null : <div className="mb-2 flex justify-start">{toolbar}</div>}
        <InputGroup className="rounded-xl bg-background shadow-xs/5 dark:bg-background has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0">
          {images.length === 0 ? null : (
            <div className="flex w-full flex-wrap justify-start gap-2 px-3 pt-3">
              {images.map((image) => (
                <ImageThumbnail
                  key={image.localId}
                  alt={image.upload.name}
                  src={image.previewUrl}
                  className="size-16"
                  onExpand={() => {
                    const preview = buildExpandedImagePreview(
                      images.map((candidate) => ({
                        id: candidate.localId,
                        name: candidate.upload.name,
                        previewUrl: candidate.previewUrl,
                      })),
                      image.localId,
                    )
                    if (preview !== null) {
                      setExpandedImage(preview)
                    }
                  }}
                >
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
                </ImageThumbnail>
              ))}
            </div>
          )}
          <span className="relative inline-flex w-full flex-1 before:hidden">
            <ComposerPromptField
              ref={fieldRef}
              text={text}
              disabled={controlsDisabled}
              autoFocus
              pathMenuOpen={mentionMenuOpen}
              tickets={tickets}
              listboxId={listboxId}
              activeOptionId={
                mentionMenuOpen && mentionEntries[highlightedIndex] !== undefined
                  ? `composer-path-option-${highlightedIndex}`
                  : undefined
              }
              onTextChange={(value) => {
                setDismissedQuery(null)
                onTextChange(value)
              }}
              onCursorChange={setCursor}
              onKeyDown={handleKeyDown}
              onPaste={onPaste}
              onDrop={onDrop}
            />
          </span>
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
              <Button
                type={isRunning ? "button" : "submit"}
                size="icon-sm"
                variant={isRunning ? "destructive" : "default"}
                disabled={isRunning ? false : sendDisabled}
                aria-label={isRunning ? "Interrompre" : "Envoyer"}
                onClick={isRunning ? onInterrupt : undefined}
              >
                {isRunning ? (
                  <SquareIcon aria-hidden="true" className="size-3 fill-current" />
                ) : (
                  <ArrowUpIcon aria-hidden="true" />
                )}
              </Button>
            </div>
          </InputGroupAddon>
        </InputGroup>
        {context}
        {error === undefined ? null : (
          <div id="thread-composer-error" className={context === undefined ? undefined : "pt-2"}>
            {error}
          </div>
        )}
      </div>
      {expandedImage === null ? null : (
        <ExpandedImageDialog
          preview={expandedImage}
          onClose={() => {
            setExpandedImage(null)
          }}
        />
      )}
    </form>
  )
}
