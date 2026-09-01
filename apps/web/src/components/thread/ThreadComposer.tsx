import type { AgentSkillEntry } from "@noyau/contracts/entities/agent-skill"
import type { ContextUsage } from "@noyau/contracts/entities/context-usage"
import type { CursorModel, Provider } from "@noyau/contracts/entities/environment"
import type {
  DefaultModelSelection,
  ModelSelection,
} from "@noyau/contracts/entities/model-selection"
import type { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
import type { WorkspacePathEntry } from "@noyau/contracts/entities/workspace-path"
import { serializeComposerTicketMention } from "@noyau/shared/composer-inline-tokens"
import {
  detectComposerTrigger,
  replaceTextRange,
  serializeComposerMentionPath,
} from "@noyau/shared/composer-trigger"
import {
  ArrowUpIcon,
  BrainIcon,
  ChevronDownIcon,
  GaugeIcon,
  LockIcon,
  LockOpenIcon,
  PenLineIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
  ZapIcon,
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

import { ComposerContextUsage } from "@/components/thread/ComposerContextUsage"
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
  MenuTrigger,
} from "@/components/ui/menu"
import { Separator } from "@/components/ui/separator"
import { composerOverlayGlassClassName } from "@/lib/composer-glass"
import type { ComposerImage } from "@/lib/composer-images"
import {
  buildComposerMentionEntries,
  buildComposerSkillEntries,
  EMPTY_COMPOSER_SKILLS,
  EMPTY_COMPOSER_TICKETS,
  filterComposerSkills,
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

const defaultServiceTierMenuValue = (serviceTiers: CursorModel["serviceTiers"]) => {
  const providerValues = new Set(serviceTiers.map((tier) => tier.value))
  let value = "__noyau_default_service_tier__"
  while (providerValues.has(value)) {
    value += "_"
  }
  return value
}

const shouldSubmitComposerOnEnter = (event: {
  readonly key: string
  readonly shiftKey: boolean
  readonly isComposing: boolean
}) => event.key === "Enter" && !event.shiftKey && !event.isComposing

export function ThreadComposer({
  isRunning,
  disabled,
  submitDisabled = false,
  text,
  images,
  runtimeMode,
  models,
  modelsByProvider,
  availableProviders,
  lockedProvider,
  selectedProvider,
  modelSelection,
  defaultModelSelection,
  error,
  placement = "docked",
  onSubmit,
  onTextChange,
  onRuntimeModeChange,
  onModelSelectionChange,
  onDefaultModelSelectionChange,
  onProviderChange,
  onPaste,
  onDrop,
  onImageRemove,
  onInterrupt,
  searchPaths,
  tickets = EMPTY_COMPOSER_TICKETS,
  skills = EMPTY_COMPOSER_SKILLS,
  contextUsage,
  context,
  toolbar,
}: {
  readonly isRunning: boolean
  readonly disabled: boolean
  readonly submitDisabled?: boolean
  readonly text: string
  readonly images: ReadonlyArray<ComposerImage>
  readonly runtimeMode: RuntimeMode
  readonly models: ReadonlyArray<CursorModel>
  readonly modelsByProvider: Readonly<Record<string, ReadonlyArray<CursorModel>>>
  readonly availableProviders: ReadonlyArray<Provider>
  readonly lockedProvider?: Provider | undefined
  readonly selectedProvider?: Provider | undefined
  readonly modelSelection: ModelSelection | null
  readonly defaultModelSelection: DefaultModelSelection | null
  readonly error: ReactNode
  readonly placement?: "docked" | "hero"
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
  readonly onTextChange: (value: string) => void
  readonly onRuntimeModeChange: (runtimeMode: RuntimeMode) => void
  readonly onModelSelectionChange: (modelSelection: ModelSelection | null) => void
  readonly onDefaultModelSelectionChange: (selection: DefaultModelSelection | null) => void
  readonly onProviderChange?: ((provider: Provider) => void) | undefined
  readonly onPaste: (event: ClipboardEvent<HTMLElement>) => void
  readonly onDrop: (event: DragEvent<HTMLElement>) => void
  readonly onImageRemove: (localId: string) => void
  readonly onInterrupt: () => void
  readonly searchPaths?: ((query: string) => Promise<ReadonlyArray<WorkspacePathEntry>>) | undefined
  readonly tickets?: ReadonlyArray<ComposerTicket> | undefined
  readonly skills?: ReadonlyArray<AgentSkillEntry> | undefined
  readonly contextUsage?: ContextUsage | undefined
  readonly context?: ReactNode
  readonly toolbar?: ReactNode | undefined
}) {
  const listboxId = useId()
  const fieldRef = useRef<ComposerPromptFieldHandle>(null)
  const pendingCursor = useRef<number | null>(null)
  const [cursor, setCursor] = useState(text.length)
  const cursorRef = useRef(cursor)
  const caretBeforeOverlay = useRef<number | null>(null)
  cursorRef.current = cursor

  const rememberComposerCaret = () => {
    caretBeforeOverlay.current = cursorRef.current
  }

  const restoreComposerCaret = () => {
    const offset = caretBeforeOverlay.current ?? cursorRef.current
    caretBeforeOverlay.current = null
    fieldRef.current?.focus(offset)
  }

  const handleComposerOverlayOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      rememberComposerCaret()
      return
    }
    restoreComposerCaret()
  }
  const [expandedImage, setExpandedImage] = useState<ExpandedImagePreview | null>(null)
  const [pathEntries, setPathEntries] = useState<ReadonlyArray<WorkspacePathEntry>>([])
  const [pathSearchLoading, setPathSearchLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null)
  const trigger = detectComposerTrigger(text, cursor)
  const mentionQuery = trigger?.kind === "path" ? trigger.query : null
  const skillQuery = trigger?.kind === "skill" ? trigger.query : null
  const activeQueryKey =
    mentionQuery === null
      ? skillQuery === null
        ? null
        : `skill:${skillQuery}`
      : `path:${mentionQuery}`
  const mentionMenuOpen =
    activeQueryKey !== null &&
    dismissedQuery !== activeQueryKey &&
    ((mentionQuery !== null && (searchPaths !== undefined || tickets.length > 0)) ||
      (skillQuery !== null && skills.length > 0))
  const ticketEntries = mentionQuery === null ? [] : filterComposerTickets(tickets, mentionQuery)
  const mentionEntries =
    skillQuery === null
      ? buildComposerMentionEntries(ticketEntries, pathEntries)
      : buildComposerSkillEntries(filterComposerSkills(skills, skillQuery))
  const controlsDisabled = isRunning || disabled
  const sendDisabled =
    (text.trim() === "" && images.length === 0) || controlsDisabled || submitDisabled
  const selectedModel = models.find((model) => model.modelId === modelSelection?.modelId)
  const selectedEffort =
    selectedModel?.reasoningEfforts.find(
      (effort) => effort.value === modelSelection?.reasoningEffort,
    ) ?? selectedModel?.reasoningEfforts.find((effort) => effort.isDefault === true)
  const selectedTier =
    selectedModel?.serviceTiers.find((tier) => tier.value === modelSelection?.serviceTier) ??
    selectedModel?.serviceTiers.find((tier) => tier.isDefault === true)
  const hasAdvertisedDefaultTier = selectedModel?.serviceTiers.some(
    (tier) => tier.isDefault === true,
  )
  const defaultServiceTierValue = defaultServiceTierMenuValue(selectedModel?.serviceTiers ?? [])
  const selectedTierValue =
    modelSelection?.serviceTier ?? selectedTier?.value ?? defaultServiceTierValue
  const selectedThinking = modelSelection?.thinking ?? selectedModel?.thinking?.defaultValue
  const hasEffort = (selectedModel?.reasoningEfforts.length ?? 0) > 0
  const hasTier = (selectedModel?.serviceTiers.length ?? 0) > 0
  const hasThinking = selectedModel?.thinking !== undefined
  const hasTraits = hasEffort || hasTier || hasThinking
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
    if (
      searchPaths === undefined ||
      mentionQuery === null ||
      dismissedQuery === `path:${mentionQuery}`
    ) {
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

  useEffect(() => {
    setHighlightedIndex(0)
  }, [activeQueryKey])

  const insertMention = (entry: ComposerMentionEntry) => {
    if (trigger === null) {
      return
    }
    const mention =
      trigger.kind === "skill" && entry.kind === "skill"
        ? `$${entry.name} `
        : trigger.kind === "path" && entry.kind === "ticket"
          ? `@${serializeComposerTicketMention(entry.ticketId)} `
          : trigger.kind === "path" && entry.kind === "file"
            ? `@${serializeComposerMentionPath(entry.path)} `
            : null
    if (mention === null) {
      return
    }
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
        setDismissedQuery(activeQueryKey)
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
    <form onSubmit={onSubmit} className={cn(placement === "hero" ? "w-full" : "px-4 pb-4 sm:px-6")}>
      <div
        className={cn(
          "composer-glass relative flex flex-col",
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
        {toolbar === undefined ? null : (
          <div data-slot="composer-toolbar" className="z-10 mb-2 flex justify-start">
            <div className="flex items-center gap-2">{toolbar}</div>
          </div>
        )}
        <div
          className={cn(
            "composer-glass-shell relative",
            context === undefined ? undefined : "composer-glass-shell-with-context",
          )}
        >
          <InputGroup className="composer-glass-host relative z-10 rounded-xl border-transparent bg-transparent shadow-none dark:bg-transparent has-[[data-slot=input-group-control]:disabled]:bg-transparent has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0">
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
                      aria-label={`Remove ${image.upload.name}`}
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
                skills={skills}
                listboxId={listboxId}
                activeOptionId={
                  mentionMenuOpen && mentionEntries[highlightedIndex] !== undefined
                    ? `composer-mention-option-${highlightedIndex}`
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
                modelsByProvider={modelsByProvider}
                availableProviders={availableProviders}
                lockedProvider={lockedProvider}
                selectedProvider={selectedProvider}
                modelSelection={modelSelection}
                defaultModelSelection={defaultModelSelection}
                disabled={
                  controlsDisabled ||
                  Object.values(modelsByProvider).every((catalog) => catalog.length === 0)
                }
                onModelSelectionChange={onModelSelectionChange}
                onDefaultModelSelectionChange={onDefaultModelSelectionChange}
                onProviderChange={onProviderChange}
                onOpenChange={handleComposerOverlayOpenChange}
              />

              <Separator orientation="vertical" className="mx-0.5 h-4" />

              {modelSelection !== null && hasTraits ? (
                <>
                  {hasEffort ? (
                    <ComposerTraitMenu
                      ariaLabel="Effort level"
                      disabled={controlsDisabled}
                      icon={GaugeIcon}
                      label={selectedEffort?.label ?? "Effort"}
                      onOpenChange={handleComposerOverlayOpenChange}
                    >
                      <MenuGroup>
                        <MenuGroupLabel>Effort level</MenuGroupLabel>
                        <MenuRadioGroup
                          value={selectedEffort?.value ?? ""}
                          onValueChange={(reasoningEffort) => {
                            onModelSelectionChange({ ...modelSelection, reasoningEffort })
                          }}
                        >
                          {selectedModel?.reasoningEfforts.map((effort) => (
                            <ComposerTraitOption
                              key={effort.value}
                              description={effort.description}
                              isDefault={effort.isDefault}
                              label={effort.label}
                              value={effort.value}
                            />
                          ))}
                        </MenuRadioGroup>
                      </MenuGroup>
                    </ComposerTraitMenu>
                  ) : null}
                  {hasTier ? (
                    <ComposerTraitMenu
                      ariaLabel="Service tier"
                      disabled={controlsDisabled}
                      icon={ZapIcon}
                      label={selectedTier?.label ?? "Default"}
                      onOpenChange={handleComposerOverlayOpenChange}
                    >
                      <MenuGroup>
                        <MenuGroupLabel>Service tier</MenuGroupLabel>
                        <MenuRadioGroup
                          value={selectedTierValue}
                          onValueChange={(serviceTier) => {
                            const isDefault =
                              serviceTier === defaultServiceTierValue ||
                              selectedModel?.serviceTiers.some(
                                (tier) => tier.value === serviceTier && tier.isDefault === true,
                              )
                            if (isDefault && modelSelection !== null) {
                              const { serviceTier: _serviceTier, ...selection } = modelSelection
                              onModelSelectionChange(selection)
                              return
                            }
                            onModelSelectionChange({ ...modelSelection, serviceTier })
                          }}
                        >
                          {hasAdvertisedDefaultTier === false ? (
                            <ComposerTraitOption
                              value={defaultServiceTierValue}
                              label="Default"
                              description="Use the provider's default service tier."
                            />
                          ) : null}
                          {selectedModel?.serviceTiers.map((tier) => (
                            <ComposerTraitOption
                              key={tier.value}
                              description={tier.description}
                              isDefault={tier.isDefault}
                              label={tier.label}
                              value={tier.value}
                            />
                          ))}
                        </MenuRadioGroup>
                      </MenuGroup>
                    </ComposerTraitMenu>
                  ) : null}
                  {hasThinking && selectedModel?.thinking !== undefined ? (
                    <ComposerTraitMenu
                      ariaLabel="Thinking"
                      disabled={controlsDisabled}
                      icon={BrainIcon}
                      label={selectedThinking === true ? "On" : "Off"}
                      onOpenChange={handleComposerOverlayOpenChange}
                    >
                      <MenuGroup>
                        <MenuGroupLabel>{selectedModel.thinking.label}</MenuGroupLabel>
                        <MenuRadioGroup
                          value={selectedThinking === true ? "on" : "off"}
                          onValueChange={(value) => {
                            onModelSelectionChange({
                              ...modelSelection,
                              thinking: value === "on",
                            })
                          }}
                        >
                          <ComposerTraitOption
                            isDefault={selectedModel.thinking.defaultValue === false}
                            label="Off"
                            value="off"
                          />
                          <ComposerTraitOption
                            isDefault={selectedModel.thinking.defaultValue === true}
                            label="On"
                            value="on"
                          />
                        </MenuRadioGroup>
                      </MenuGroup>
                    </ComposerTraitMenu>
                  ) : null}
                  <Separator orientation="vertical" className="mx-0.5 h-4" />
                </>
              ) : null}

              <Menu onOpenChange={handleComposerOverlayOpenChange}>
                <MenuTrigger
                  render={
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={controlsDisabled}
                      aria-label="Access level"
                      className="max-w-52"
                    />
                  }
                >
                  <SelectedRuntimeModeIcon data-icon="inline-start" />
                  <span className="truncate">{selectedRuntimeMode.label}</span>
                  <ChevronDownIcon data-icon="inline-end" />
                </MenuTrigger>
                <MenuPopup
                  side="top"
                  align="start"
                  finalFocus={false}
                  className={cn("w-max", composerOverlayGlassClassName)}
                >
                  <MenuGroup>
                    <MenuGroupLabel>Access level</MenuGroupLabel>
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

              <div className="ml-auto flex items-center gap-2">
                {contextUsage === undefined ? null : <ComposerContextUsage usage={contextUsage} />}
                <Button
                  type={isRunning ? "button" : "submit"}
                  size="icon-sm"
                  variant={isRunning ? "destructive" : "default"}
                  disabled={isRunning ? false : sendDisabled}
                  aria-label={isRunning ? "Interrupt" : "Send"}
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
        </div>
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

function ComposerTraitMenu({
  ariaLabel,
  icon: Icon,
  label,
  disabled,
  onOpenChange,
  children,
}: {
  readonly ariaLabel: string
  readonly icon: ComponentType<{ className?: string }>
  readonly label: string
  readonly disabled: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly children: ReactNode
}) {
  return (
    <Menu onOpenChange={onOpenChange}>
      <MenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            aria-label={ariaLabel}
          />
        }
      >
        <Icon data-icon="inline-start" />
        <span className="max-w-24 truncate">{label}</span>
        <ChevronDownIcon data-icon="inline-end" />
      </MenuTrigger>
      <MenuPopup
        side="top"
        align="start"
        finalFocus={false}
        className={cn("w-max", composerOverlayGlassClassName)}
      >
        {children}
      </MenuPopup>
    </Menu>
  )
}

function ComposerTraitOption({
  value,
  label,
  description,
  isDefault,
}: {
  readonly value: string
  readonly label: string
  readonly description?: string | undefined
  readonly isDefault?: boolean | undefined
}) {
  return (
    <MenuRadioItem
      value={value}
      closeOnClick
      hideIndicator
      className="py-2 data-checked:bg-accent data-checked:text-accent-foreground"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span>{label}</span>
          {isDefault === true ? (
            <Badge variant="outline" size="sm">
              Default
            </Badge>
          ) : null}
        </span>
        {description === undefined ? null : (
          <span className="whitespace-nowrap text-muted-foreground text-xs">{description}</span>
        )}
      </span>
    </MenuRadioItem>
  )
}
