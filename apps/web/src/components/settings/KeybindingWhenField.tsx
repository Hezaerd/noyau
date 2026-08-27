import { CircleXIcon, MinusIcon, PlusIcon, TriangleAlertIcon } from "lucide-react"
import { useMemo, useState, type ReactElement } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import type { KeybindingWhenNode } from "@/lib/keybinding-when"
import {
  DEFAULT_WHEN_VARIABLE,
  isKnownWhenVariable,
  parseWhenExpressionDraft,
  unknownWhenVariables,
  whenAstToExpression,
  type WhenVariableOption,
} from "@/lib/keybindings-settings"
import { cn } from "@/lib/utils"

type BooleanOperator = "and" | "or"

const flattenWhenChildren = (
  node: KeybindingWhenNode,
  operator: BooleanOperator,
): KeybindingWhenNode[] => {
  if (node.type !== operator) {
    return [node]
  }
  return [...flattenWhenChildren(node.left, operator), ...flattenWhenChildren(node.right, operator)]
}

const buildWhenExpressionGroup = (
  children: ReadonlyArray<KeybindingWhenNode>,
  operator: BooleanOperator,
): KeybindingWhenNode | undefined => {
  const first = children[0]
  if (first === undefined) {
    return undefined
  }
  return children.slice(1).reduce<KeybindingWhenNode>(
    (left, right) => ({
      type: operator,
      left,
      right,
    }),
    first,
  )
}

const conditionParts = (
  node: KeybindingWhenNode,
): { readonly identifier: string; readonly negated: boolean } | null => {
  if (node.type === "identifier") {
    return { identifier: node.name, negated: false }
  }
  if (node.type === "not" && node.node.type === "identifier") {
    return { identifier: node.node.name, negated: true }
  }
  return null
}

const setConditionIdentifier = (
  node: KeybindingWhenNode,
  identifier: string,
): KeybindingWhenNode => {
  const parts = conditionParts(node)
  if (parts === null) {
    return node
  }
  const next: KeybindingWhenNode = { type: "identifier", name: identifier }
  return parts.negated ? { type: "not", node: next } : next
}

const setConditionNegated = (node: KeybindingWhenNode, negated: boolean): KeybindingWhenNode => {
  const parts = conditionParts(node)
  if (parts === null) {
    return negated ? { type: "not", node } : node
  }
  const identifier: KeybindingWhenNode = { type: "identifier", name: parts.identifier }
  return negated ? { type: "not", node: identifier } : identifier
}

const defaultWhenCondition = (): KeybindingWhenNode => ({
  type: "identifier",
  name: DEFAULT_WHEN_VARIABLE,
})

const defaultWhenGroup = (operator: BooleanOperator = "and"): KeybindingWhenNode => ({
  type: operator,
  left: defaultWhenCondition(),
  right: { type: "not", node: defaultWhenCondition() },
})

const notToggleClassName =
  "min-w-10 shrink-0 data-pressed:border-primary data-pressed:bg-primary data-pressed:text-primary-foreground dark:data-pressed:border-primary dark:data-pressed:bg-primary dark:data-pressed:text-primary-foreground"

function UnknownWhenVariableWarning({
  identifiers,
  focusable = true,
}: {
  readonly identifiers: ReadonlyArray<string>
  readonly focusable?: boolean
}): ReactElement | null {
  if (identifiers.length === 0) {
    return null
  }
  const label =
    identifiers.length === 1
      ? `Condition inconnue : ${identifiers[0]}`
      : `Conditions inconnues : ${identifiers.join(", ")}`

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={focusable ? 0 : undefined}
            aria-label={label}
            className="inline-flex size-4.5 shrink-0 items-center justify-center rounded-sm text-warning outline-none transition-colors hover:bg-warning/10 focus-visible:ring-[3px] focus-visible:ring-warning/25"
          />
        }
      >
        <TriangleAlertIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup side="top" className="max-w-72 whitespace-normal leading-relaxed">
        Noyau ne reconnaît pas encore cette Condition. Elle peut être enregistrée, mais elle ne
        matchera que si le runtime la fournit.
      </TooltipPopup>
    </Tooltip>
  )
}

function WhenVariableSelect({
  value,
  variables,
  unknownIdentifiers,
  onChange,
}: {
  readonly value: string
  readonly variables: ReadonlyArray<WhenVariableOption>
  readonly unknownIdentifiers?: ReadonlyArray<string>
  readonly onChange: (value: string) => void
}): ReactElement {
  const options = variables.includes(value) ? variables : [value, ...variables]

  return (
    <div className="grid min-w-0 flex-1">
      <Select value={value} onValueChange={(nextValue) => nextValue && onChange(nextValue)}>
        <SelectTrigger size="sm" className="w-full min-w-0 font-mono">
          <SelectValue placeholder="Condition" className="leading-7" />
          {unknownIdentifiers !== undefined && unknownIdentifiers.length > 0 ? (
            <UnknownWhenVariableWarning identifiers={unknownIdentifiers} focusable={false} />
          ) : null}
        </SelectTrigger>
        <SelectPopup alignItemWithTrigger={false} className="max-h-72">
          {options.map((option) => (
            <SelectItem
              key={option}
              value={option}
              className="min-h-7 w-full py-1 font-mono text-[12px]"
            >
              <span className="truncate">{option}</span>
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  )
}

function WhenExpressionNodeEditor({
  node,
  variables,
  depth = 0,
  onChange,
  onRemove,
}: {
  readonly node: KeybindingWhenNode
  readonly variables: ReadonlyArray<WhenVariableOption>
  readonly depth?: number
  readonly onChange: (node: KeybindingWhenNode) => void
  readonly onRemove?: () => void
}): ReactElement {
  const condition = conditionParts(node)

  if (condition !== null) {
    const unknownIdentifiers = isKnownWhenVariable(condition.identifier)
      ? []
      : [condition.identifier]

    return (
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2 py-2">
        <Toggle
          pressed={condition.negated}
          onPressedChange={(pressed) => {
            onChange(setConditionNegated(node, pressed))
          }}
          aria-label={`Nier ${condition.identifier}`}
          variant="outline"
          size="compact"
          className={notToggleClassName}
        >
          Not
        </Toggle>
        <WhenVariableSelect
          value={condition.identifier}
          variables={variables}
          unknownIdentifiers={unknownIdentifiers}
          onChange={(value) => {
            onChange(setConditionIdentifier(node, value))
          }}
        />
        {onRemove === undefined ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7"
            aria-label="Retirer la Condition"
            onClick={onRemove}
          >
            <MinusIcon />
          </Button>
        )}
      </div>
    )
  }

  if (node.type === "not") {
    return (
      <div
        className={cn(
          "flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 p-2",
          depth > 0 && "border-border/50 bg-background/50",
        )}
      >
        <div className="flex items-center gap-2">
          <Toggle
            pressed
            onPressedChange={(pressed) => {
              onChange(pressed ? node : node.node)
            }}
            aria-label="Nier le groupe"
            variant="outline"
            size="compact"
            className={notToggleClassName}
          >
            Not
          </Toggle>
          {onRemove === undefined ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ms-auto size-7"
              aria-label="Retirer le groupe nié"
              onClick={onRemove}
            >
              <MinusIcon />
            </Button>
          )}
        </div>
        <div className="relative ps-4">
          <span className="absolute inset-y-0 start-1.5 w-px bg-border/70" aria-hidden />
          <span className="absolute top-4 start-1.5 h-px w-2.5 bg-border/70" aria-hidden />
          <WhenExpressionNodeEditor
            node={node.node}
            variables={variables}
            depth={depth + 1}
            onChange={(next) => {
              onChange({ type: "not", node: next })
            }}
          />
        </div>
      </div>
    )
  }

  const operator: BooleanOperator = node.type === "or" ? "or" : "and"
  const children = flattenWhenChildren(node, operator)
  const childKeyCounts = new Map<string, number>()
  const childEntries = children.map((child) => {
    const baseKey = `${child.type}-${whenAstToExpression(child)}`
    const count = childKeyCounts.get(baseKey) ?? 0
    childKeyCounts.set(baseKey, count + 1)
    return { child, key: count === 0 ? baseKey : `${baseKey}-${count}` }
  })

  const updateChild = (target: KeybindingWhenNode, next: KeybindingWhenNode) => {
    let didUpdate = false
    const nextChildren = children.map((child) => {
      if (!didUpdate && child === target) {
        didUpdate = true
        return next
      }
      return child
    })
    const nextNode = buildWhenExpressionGroup(nextChildren, operator)
    if (nextNode !== undefined) {
      onChange(nextNode)
    }
  }

  const removeChild = (target: KeybindingWhenNode) => {
    let didRemove = false
    const nextChildren = children.filter((child) => {
      if (!didRemove && child === target) {
        didRemove = true
        return false
      }
      return true
    })
    const nextNode = buildWhenExpressionGroup(nextChildren, operator)
    onChange(nextNode ?? defaultWhenCondition())
  }

  const setOperator = (nextOperator: BooleanOperator) => {
    if (nextOperator === operator) {
      return
    }
    const nextNode = buildWhenExpressionGroup(children, nextOperator)
    if (nextNode !== undefined) {
      onChange(nextNode)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/10 p-2",
        depth > 0 && "border-border/70 bg-background/55",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={operator}
          onValueChange={(value) => {
            if (value === "and" || value === "or") {
              setOperator(value)
            }
          }}
        >
          <SelectTrigger size="sm" className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup alignItemWithTrigger={false} className="w-fit min-w-24">
            <SelectItem value="and" className="min-h-7 py-1 font-mono text-[12px]">
              and
            </SelectItem>
            <SelectItem value="or" className="min-h-7 py-1 font-mono text-[12px]">
              or
            </SelectItem>
          </SelectPopup>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => {
            const nextNode = buildWhenExpressionGroup(
              [...children, defaultWhenCondition()],
              operator,
            )
            if (nextNode !== undefined) {
              onChange(nextNode)
            }
          }}
        >
          <PlusIcon />
          Condition
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => {
            const nestedOperator: BooleanOperator = operator === "and" ? "or" : "and"
            const group: KeybindingWhenNode = {
              type: nestedOperator,
              left: defaultWhenCondition(),
              right: { type: "not", node: defaultWhenCondition() },
            }
            const nextNode = buildWhenExpressionGroup([...children, group], operator)
            if (nextNode !== undefined) {
              onChange(nextNode)
            }
          }}
        >
          <PlusIcon />
          Groupe
        </Button>
        {onRemove === undefined ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ms-auto size-7"
            aria-label="Retirer le groupe"
            onClick={onRemove}
          >
            <MinusIcon />
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {childEntries.map(({ child, key }) => (
          <div key={key} className="relative ps-4">
            <span
              className={cn(
                "absolute inset-y-0 start-1.5 w-px",
                depth === 0 ? "bg-border" : "bg-border/70",
              )}
              aria-hidden
            />
            <span
              className={cn(
                "absolute top-4 start-1.5 h-px w-2.5",
                depth === 0 ? "bg-border" : "bg-border/70",
              )}
              aria-hidden
            />
            <WhenExpressionNodeEditor
              node={child}
              variables={variables}
              depth={depth + 1}
              onChange={(next) => {
                updateChild(child, next)
              }}
              onRemove={() => {
                removeChild(child)
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function WhenExpressionBuilder({
  value,
  variables,
  onChange,
  onValidityChange,
}: {
  readonly value: KeybindingWhenNode | undefined
  readonly variables: ReadonlyArray<WhenVariableOption>
  readonly onChange: (value: KeybindingWhenNode | undefined) => void
  readonly onValidityChange?: (valid: boolean) => void
}): ReactElement {
  const expression = whenAstToExpression(value)
  const [expressionDraft, setExpressionDraft] = useState(expression)
  const parseResult = useMemo(() => parseWhenExpressionDraft(expressionDraft), [expressionDraft])
  const parseError = parseResult.ok ? null : parseResult.message
  const unknownIdentifiers = parseResult.ok ? unknownWhenVariables(parseResult.value) : []

  const updateExpressionDraft = (nextExpression: string) => {
    setExpressionDraft(nextExpression)
    const nextResult = parseWhenExpressionDraft(nextExpression)
    onValidityChange?.(nextResult.ok)
    if (nextResult.ok) {
      onChange(nextResult.value)
    }
  }

  const updateExpressionValue = (nextValue: KeybindingWhenNode | undefined) => {
    setExpressionDraft(whenAstToExpression(nextValue))
    onValidityChange?.(true)
    onChange(nextValue)
  }

  return (
    <div className="flex w-[min(34rem,calc(100vw-2rem))] flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-foreground">Condition</div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              if (value === undefined) {
                updateExpressionValue(defaultWhenCondition())
                return
              }
              updateExpressionValue({ type: "and", left: value, right: defaultWhenCondition() })
            }}
          >
            <PlusIcon />
            Condition
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              const group = defaultWhenGroup("or")
              if (value === undefined) {
                updateExpressionValue(group)
                return
              }
              updateExpressionValue({ type: "and", left: value, right: group })
            }}
          >
            <PlusIcon />
            Groupe
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="relative">
          <Input
            value={expressionDraft}
            onChange={(event) => {
              updateExpressionDraft(event.currentTarget.value)
            }}
            placeholder="Toujours"
            aria-invalid={Boolean(parseError)}
            aria-label="Expression de Condition"
            className={cn(
              "h-7 rounded-md font-mono text-[12px] leading-7 sm:h-7 sm:leading-7",
              unknownIdentifiers.length > 0 && "pe-9",
              parseError && "border-destructive/70 focus-visible:border-destructive",
            )}
          />
          {unknownIdentifiers.length > 0 ? (
            <span className="absolute inset-y-0 end-2 flex items-center">
              <UnknownWhenVariableWarning identifiers={unknownIdentifiers} />
            </span>
          ) : null}
        </div>
        {parseError === null ? null : (
          <div className="flex items-center gap-1.5 text-[11px] text-destructive">
            <CircleXIcon className="size-3.5" />
            {parseError}
          </div>
        )}
      </div>

      <div className="relative">
        {value === undefined ? (
          <div className="rounded-md border border-dashed border-border/80 bg-muted/15 p-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="xs"
                onClick={() => {
                  updateExpressionValue(defaultWhenCondition())
                }}
              >
                <PlusIcon />
                Condition
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  updateExpressionValue(defaultWhenGroup("or"))
                }}
              >
                <PlusIcon />
                Groupe
              </Button>
            </div>
          </div>
        ) : (
          <WhenExpressionNodeEditor
            node={value}
            variables={variables}
            onChange={updateExpressionValue}
            onRemove={() => {
              updateExpressionValue(undefined)
            }}
          />
        )}
        {parseError === null ? null : (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border border-destructive/30 bg-background/75 p-4 text-center text-xs text-destructive backdrop-blur-[1px]">
            Corrige l’expression pour continuer l’édition visuelle.
          </div>
        )}
      </div>
    </div>
  )
}
