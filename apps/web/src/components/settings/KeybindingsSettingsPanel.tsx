import {
  ChevronDownIcon,
  EllipsisIcon,
  FileJsonIcon,
  PlusIcon,
  SearchIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react"

import { WhenExpressionBuilder } from "@/components/settings/KeybindingWhenField"
import {
  SettingsPage,
  SettingsSection,
  SettingsTarget,
} from "@/components/settings/settings-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu"
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { useKeybindingHandler } from "@/hooks/use-keybinding-handler"
import { useKeybindings, useSetKeybindingRecorderActive } from "@/hooks/use-keybindings"
import { type KeybindingWhenNode } from "@/lib/keybinding-when"
import { type KeybindingRule } from "@/lib/keybindings"
import { commandLabel, isKeybindingId, type KeybindingId } from "@/lib/keybindings-catalog"
import {
  buildKeybindingCommandOptions,
  buildKeybindingRows,
  buildWhenVariableOptions,
  keybindingConflictLabels,
  keybindingFromKeyboardEvent,
  whenAstToExpression,
  type KeybindingRow,
} from "@/lib/keybindings-settings"
import { downloadKeybindingsRules, KEYBINDINGS_FILE_NAME } from "@/lib/keybinds-file"
import { cn } from "@/lib/utils"

function KeybindingPill({ value }: { readonly value: string }): ReactElement {
  const parts = value.split("+")
  const isMac = navigator.platform.toLowerCase().includes("mac")
  return (
    <KbdGroup className="bg-transparent p-0 shadow-none">
      {parts.map((part) => (
        <Kbd key={part} className="min-w-6 justify-center px-1.5">
          {part === "mod"
            ? isMac
              ? "⌘"
              : "Ctrl"
            : part === "shift"
              ? "⇧"
              : part === "alt"
                ? isMac
                  ? "⌥"
                  : "Alt"
                : part === "ctrl"
                  ? "⌃"
                  : part.length === 1
                    ? part.toUpperCase()
                    : part}
        </Kbd>
      ))}
    </KbdGroup>
  )
}

function ExpandableHeaderSearch({
  query,
  onChange,
  isOpen,
  onOpenChange,
  inputRef,
  collapsedAccessory,
}: {
  readonly query: string
  readonly onChange: (next: string) => void
  readonly isOpen: boolean
  readonly onOpenChange: (next: boolean) => void
  readonly inputRef?: RefObject<HTMLInputElement | null>
  readonly collapsedAccessory?: ReactNode
}): ReactElement {
  if (!isOpen) {
    return (
      <>
        {collapsedAccessory}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => {
                  onOpenChange(true)
                }}
                aria-label="Rechercher un Keybinding"
              />
            }
          >
            <SearchIcon />
          </TooltipTrigger>
          <TooltipPopup side="top">Rechercher</TooltipPopup>
        </Tooltip>
      </>
    )
  }

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        autoFocus
        type="search"
        value={query}
        onChange={(event) => {
          onChange(event.currentTarget.value)
        }}
        onBlur={() => {
          if (query.length === 0) {
            onOpenChange(false)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onChange("")
            onOpenChange(false)
          }
        }}
        placeholder="Rechercher…"
        aria-label="Rechercher un Keybinding"
        className="w-44 [&_[data-slot=input]]:pl-7"
        size="sm"
      />
    </div>
  )
}

function KeybindingConflictWarning({
  labels,
}: {
  readonly labels: ReadonlyArray<string>
}): ReactElement | null {
  if (labels.length === 0) {
    return null
  }
  const description =
    labels.length === 1
      ? `Conflit avec ${labels[0]}.`
      : `Conflit avec ${labels.slice(0, 3).join(", ")}${labels.length > 3 ? ", et plus" : ""}.`

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            aria-label={description}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-warning outline-none transition-colors hover:bg-warning/10 focus-visible:ring-[3px] focus-visible:ring-warning/25"
          />
        }
      >
        <TriangleAlertIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup side="top" className="max-w-72 whitespace-normal leading-relaxed">
        {description} La dernière règle qui match gagne quand les deux Conditions peuvent
        s’appliquer.
      </TooltipPopup>
    </Tooltip>
  )
}

type KeybindingRowDraftState = {
  readonly keyDraft: string
  readonly whenDraft: KeybindingWhenNode | undefined
  readonly isRecording: boolean
  readonly isWhenDraftValid: boolean
}

const createKeybindingRowDraft = (row: KeybindingRow): KeybindingRowDraftState => ({
  keyDraft: row.key,
  whenDraft: row.binding.whenAst,
  isRecording: false,
  isWhenDraftValid: true,
})

const keybindingRowDraftReducer = (
  state: KeybindingRowDraftState,
  patch: Partial<KeybindingRowDraftState>,
): KeybindingRowDraftState => ({ ...state, ...patch })

const rowKeybindingTarget = (row: KeybindingRow): KeybindingRule =>
  row.when.trim().length > 0
    ? { command: row.command, key: row.key, when: row.when }
    : { command: row.command, key: row.key }

function KeybindingTableRow({
  row,
  allRows,
  variables,
  onSave,
  onReset,
  onRemove,
}: {
  readonly row: KeybindingRow
  readonly allRows: ReadonlyArray<KeybindingRow>
  readonly variables: ReadonlyArray<string>
  readonly onSave: (input: {
    readonly command: KeybindingId
    readonly key: string
    readonly when?: string
    readonly replace?: KeybindingRule
  }) => void
  readonly onReset: (row: KeybindingRow) => void
  readonly onRemove: (row: KeybindingRow) => void
}): ReactElement {
  const [draft, setDraft] = useReducer(keybindingRowDraftReducer, row, createKeybindingRowDraft)
  const { keyDraft, whenDraft, isRecording, isWhenDraftValid } = draft
  const whenDraftExpression = whenAstToExpression(whenDraft)
  const isDirty = keyDraft !== row.key || whenDraftExpression !== row.when
  const canReset = row.source === "Custom" && row.defaultKey !== null
  const canRemove = row.source !== "Default"
  const hasRowActions = canReset || canRemove
  const showPill = !isRecording && keyDraft === row.key && row.key.length > 0 && !isDirty
  const conflictLabels = keybindingConflictLabels(allRows, {
    rowId: row.id,
    key: keyDraft,
    when: whenDraftExpression,
  })
  const label = commandLabel(row.command)

  const save = () => {
    const replace = rowKeybindingTarget(row)
    if (whenDraftExpression.trim().length > 0) {
      onSave({
        command: row.command,
        key: keyDraft,
        when: whenDraftExpression,
        replace,
      })
      return
    }
    onSave({
      command: row.command,
      key: keyDraft,
      replace,
    })
  }

  const captureKeybinding = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab") {
      return
    }
    event.preventDefault()
    if (event.key === "Escape") {
      setDraft({ keyDraft: row.key, isRecording: false })
      return
    }
    const next = keybindingFromKeyboardEvent(event.nativeEvent, navigator.platform)
    if (next === null) {
      return
    }
    setDraft({ keyDraft: next, isRecording: false })
  }

  return (
    <SettingsTarget
      id={row.id}
      className="grid grid-cols-[minmax(190px,1.1fr)_minmax(220px,0.85fr)_minmax(210px,1fr)_60px] items-center px-4 py-1.5 text-sm even:bg-muted/15 hover:bg-accent/40"
    >
      <div className="min-w-0 pr-4">
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                aria-label={row.command}
                className="truncate text-[13px] font-medium text-foreground"
              />
            }
          >
            {label}
          </TooltipTrigger>
          <TooltipPopup side="top">{row.command}</TooltipPopup>
        </Tooltip>
      </div>
      <div className="flex min-w-0 items-center gap-2 pr-4">
        {showPill ? (
          <button
            type="button"
            onClick={() => {
              setDraft({ isRecording: true })
            }}
            aria-label={`Modifier le Raccourci de ${label}`}
            className="group inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-1.5 outline-none transition-colors hover:border-border/70 hover:bg-background focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24"
          >
            <KeybindingPill value={row.key} />
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/0 transition-opacity group-hover:text-muted-foreground/70 group-focus-visible:text-muted-foreground/70">
              Edit
            </span>
          </button>
        ) : (
          <Input
            data-keybinding-capture=""
            autoFocus={isRecording}
            aria-label={`Raccourci de ${label}`}
            value={isRecording ? "" : keyDraft}
            placeholder={isRecording ? "Appuie sur un Raccourci" : "Non assigné"}
            className={cn(
              "h-7 w-44 rounded-md font-mono text-[12px] sm:h-7",
              isRecording && "border-primary/70 bg-primary/5",
            )}
            onFocus={() => {
              setDraft({ isRecording: true })
            }}
            onBlur={() => {
              setDraft({ isRecording: false })
            }}
            onChange={(event) => {
              setDraft({ keyDraft: event.currentTarget.value })
            }}
            onKeyDown={captureKeybinding}
          />
        )}
        {isDirty ? (
          <Button
            size="xs"
            disabled={keyDraft.trim().length === 0 || !isWhenDraftValid}
            onClick={save}
          >
            Enregistrer
          </Button>
        ) : null}
      </div>
      <div className="grid min-w-0 pr-4">
        <Popover>
          <PopoverTrigger
            className={cn(
              "flex h-7 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-left font-mono text-[12px] text-foreground shadow-xs/5 outline-none transition-colors hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24",
              whenDraftExpression.length === 0 && "text-muted-foreground",
            )}
            aria-label={`Modifier la Condition de ${label}`}
          >
            <span className="truncate">
              {whenDraftExpression.length === 0 ? "Toujours" : whenDraftExpression}
            </span>
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
          </PopoverTrigger>
          <PopoverPopup align="start" sideOffset={6} viewportClassName="px-3 py-3">
            <WhenExpressionBuilder
              value={whenDraft}
              variables={variables}
              onChange={(nextWhenDraft) => {
                setDraft({ whenDraft: nextWhenDraft })
              }}
              onValidityChange={(nextIsValid) => {
                setDraft({ isWhenDraftValid: nextIsValid })
              }}
            />
          </PopoverPopup>
        </Popover>
      </div>
      <div className="flex items-center justify-end gap-1">
        <KeybindingConflictWarning labels={conflictLabels} />
        {hasRowActions ? (
          <Menu>
            <MenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 text-muted-foreground hover:text-foreground sm:size-7"
                  aria-label={`Actions pour ${label}`}
                />
              }
            >
              <EllipsisIcon />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-36">
              {canReset ? (
                <MenuItem
                  onClick={() => {
                    onReset(row)
                  }}
                >
                  Rétablir le défaut
                </MenuItem>
              ) : null}
              {canRemove ? (
                <MenuItem
                  variant="destructive"
                  onClick={() => {
                    onRemove(row)
                  }}
                >
                  Retirer
                </MenuItem>
              ) : null}
            </MenuPopup>
          </Menu>
        ) : null}
      </div>
    </SettingsTarget>
  )
}

function NewKeybindingTableRow({
  commandOptions,
  allRows,
  variables,
  onSave,
  onCancel,
}: {
  readonly commandOptions: ReadonlyArray<KeybindingId>
  readonly allRows: ReadonlyArray<KeybindingRow>
  readonly variables: ReadonlyArray<string>
  readonly onSave: (input: {
    readonly command: KeybindingId
    readonly key: string
    readonly when?: string
  }) => void
  readonly onCancel: () => void
}): ReactElement {
  const [commandDraft, setCommandDraft] = useState<KeybindingId | "">("")
  const [draft, setDraft] = useReducer(keybindingRowDraftReducer, {
    keyDraft: "",
    whenDraft: undefined,
    isRecording: false,
    isWhenDraftValid: true,
  })
  const { keyDraft, whenDraft, isRecording, isWhenDraftValid } = draft
  const whenDraftExpression = whenAstToExpression(whenDraft)
  const conflictLabels = keybindingConflictLabels(allRows, {
    rowId: "new",
    key: keyDraft,
    when: whenDraftExpression,
  })
  const commandLabelText = commandDraft === "" ? "nouveau Keybinding" : commandLabel(commandDraft)

  const captureKeybinding = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab") {
      return
    }
    event.preventDefault()
    if (event.key === "Escape") {
      setDraft({ keyDraft: "", isRecording: false })
      return
    }
    const next = keybindingFromKeyboardEvent(event.nativeEvent, navigator.platform)
    if (next === null) {
      return
    }
    setDraft({ keyDraft: next, isRecording: false })
  }

  return (
    <div className="grid grid-cols-[minmax(190px,1.1fr)_minmax(220px,0.85fr)_minmax(210px,1fr)_60px] items-center px-4 py-1.5 text-sm even:bg-muted/15 hover:bg-accent/40">
      <div className="grid min-w-0 pr-4">
        <Select
          value={commandDraft}
          onValueChange={(value) => {
            if (value !== null && isKeybindingId(value)) {
              setCommandDraft(value)
            }
          }}
        >
          <SelectTrigger size="sm" className="w-full min-w-0">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectPopup alignItemWithTrigger={false} className="max-h-72">
            {commandOptions.map((command) => (
              <SelectItem key={command} value={command} className="min-h-7 w-full py-1 text-[12px]">
                <span className="truncate">{commandLabel(command)}</span>
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
      <div className="flex min-w-0 items-center gap-2 pr-4">
        <Input
          data-keybinding-capture=""
          aria-label={`Raccourci de ${commandLabelText}`}
          value={isRecording ? "" : keyDraft}
          placeholder={isRecording ? "Appuie sur un Raccourci" : "Non assigné"}
          size="sm"
          className={cn("w-44 font-mono", isRecording && "border-primary/70 bg-primary/5")}
          onFocus={() => {
            setDraft({ isRecording: true })
          }}
          onBlur={() => {
            setDraft({ isRecording: false })
          }}
          onChange={(event) => {
            setDraft({ keyDraft: event.currentTarget.value })
          }}
          onKeyDown={captureKeybinding}
        />
        <Button
          size="xs"
          disabled={commandDraft === "" || keyDraft.trim().length === 0 || !isWhenDraftValid}
          onClick={() => {
            if (commandDraft === "") {
              return
            }
            if (whenDraftExpression.trim().length > 0) {
              onSave({
                command: commandDraft,
                key: keyDraft,
                when: whenDraftExpression,
              })
              return
            }
            onSave({
              command: commandDraft,
              key: keyDraft,
            })
          }}
        >
          Enregistrer
        </Button>
      </div>
      <div className="grid min-w-0 pr-4">
        <Popover>
          <PopoverTrigger
            className={cn(
              "flex h-7 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-left font-mono text-[12px] text-foreground shadow-xs/5 outline-none transition-colors hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24",
              whenDraftExpression.length === 0 && "text-muted-foreground",
            )}
            aria-label={`Modifier la Condition de ${commandLabelText}`}
          >
            <span className="truncate">
              {whenDraftExpression.length === 0 ? "Toujours" : whenDraftExpression}
            </span>
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
          </PopoverTrigger>
          <PopoverPopup align="start" sideOffset={6} viewportClassName="px-3 py-3">
            <WhenExpressionBuilder
              value={whenDraft}
              variables={variables}
              onChange={(nextWhenDraft) => {
                setDraft({ whenDraft: nextWhenDraft })
              }}
              onValidityChange={(nextIsValid) => {
                setDraft({ isWhenDraftValid: nextIsValid })
              }}
            />
          </PopoverPopup>
        </Popover>
      </div>
      <div className="flex items-center justify-end gap-1">
        <KeybindingConflictWarning labels={conflictLabels} />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label="Annuler le nouveau Keybinding"
                onClick={onCancel}
              />
            }
          >
            <XIcon />
          </TooltipTrigger>
          <TooltipPopup side="top">Annuler</TooltipPopup>
        </Tooltip>
      </div>
    </div>
  )
}

export function KeybindingsSettingsPanel(): ReactElement {
  const { rules, resolvedConfig, upsertKeybinding, removeKeybinding, resetKeybinding } =
    useKeybindings()
  const setRecorderActive = useSetKeybindingRecorderActive()
  const [query, setQuery] = useState("")
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [isAddingBinding, setIsAddingBinding] = useState(false)
  const rows = useMemo(() => buildKeybindingRows(resolvedConfig, query), [query, resolvedConfig])
  const commandOptions = useMemo(() => buildKeybindingCommandOptions(), [])
  const whenVariables = useMemo(() => buildWhenVariableOptions(), [])

  useKeybindingHandler("settings.keybindings.search", () => {
    setIsSearchOpen(true)
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  })

  useEffect(() => {
    const handleFocus = (event: FocusEvent) => {
      const focused = event.type === "focusout" ? event.relatedTarget : event.target
      setRecorderActive(
        focused instanceof HTMLElement && focused.hasAttribute("data-keybinding-capture"),
      )
    }
    window.addEventListener("focusin", handleFocus)
    window.addEventListener("focusout", handleFocus)
    return () => {
      window.removeEventListener("focusin", handleFocus)
      window.removeEventListener("focusout", handleFocus)
      setRecorderActive(false)
    }
  }, [setRecorderActive])

  const bindingsCount = (
    <span className="text-[11px] text-muted-foreground">
      {rows.length + (isAddingBinding ? 1 : 0)}{" "}
      {rows.length + (isAddingBinding ? 1 : 0) === 1 ? "Keybinding" : "Keybindings"}
    </span>
  )

  return (
    <SettingsPage>
      <SettingsSection id="keybindings" title="Raccourcis" className="max-w-5xl">
        <div className="mb-3 flex items-center justify-end gap-1.5 px-1">
          <ExpandableHeaderSearch
            query={query}
            onChange={setQuery}
            isOpen={isSearchOpen}
            onOpenChange={setIsSearchOpen}
            inputRef={searchInputRef}
            collapsedAccessory={bindingsCount}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => {
                    setIsAddingBinding(true)
                  }}
                  aria-label="Ajouter un Keybinding"
                />
              }
            >
              <PlusIcon />
            </TooltipTrigger>
            <TooltipPopup side="top">Ajouter un Keybinding</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Télécharger ${KEYBINDINGS_FILE_NAME}`}
                  onClick={() => {
                    downloadKeybindingsRules(rules)
                  }}
                />
              }
            >
              <FileJsonIcon />
            </TooltipTrigger>
            <TooltipPopup side="top">{KEYBINDINGS_FILE_NAME}</TooltipPopup>
          </Tooltip>
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[680px] grid-cols-[minmax(190px,1.1fr)_minmax(220px,0.85fr)_minmax(210px,1fr)_60px] border-b border-border/70 bg-muted/25 px-4 py-2 text-[11px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">
            <div>Action</div>
            <div>Raccourci</div>
            <div>Condition</div>
            <div>État</div>
          </div>
          <div className="min-w-[680px] divide-y divide-border/60">
            {isAddingBinding ? (
              <NewKeybindingTableRow
                commandOptions={commandOptions}
                allRows={rows}
                variables={whenVariables}
                onSave={(input) => {
                  upsertKeybinding(input)
                  setIsAddingBinding(false)
                }}
                onCancel={() => {
                  setIsAddingBinding(false)
                }}
              />
            ) : null}
            {rows.map((row) => (
              <KeybindingTableRow
                key={row.id}
                row={row}
                allRows={rows}
                variables={whenVariables}
                onSave={upsertKeybinding}
                onReset={resetKeybinding}
                onRemove={(target) => {
                  removeKeybinding(rowKeybindingTarget(target))
                }}
              />
            ))}
            {rows.length === 0 && !isAddingBinding ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                Aucun Keybinding ne correspond à ta recherche.
              </div>
            ) : null}
          </div>
        </div>
      </SettingsSection>
    </SettingsPage>
  )
}
