export const MAX_WHEN_EXPRESSION_DEPTH = 64
export const MAX_KEYBINDING_WHEN_LENGTH = 256

export const KEYBINDING_SURFACES = ["tableau", "thread", "settings"] as const

export type KeybindingSurface = (typeof KEYBINDING_SURFACES)[number]

export const KEYBINDING_WHEN_IDENTIFIERS = [
  "tableau",
  "thread",
  "settings",
  "ticketSelected",
  "columnSelected",
  "dialogOpen",
  "editableFocused",
  "true",
  "false",
] as const

export type KeybindingWhenIdentifier = (typeof KEYBINDING_WHEN_IDENTIFIERS)[number]

export type KeybindingWhenNode =
  | { readonly type: "identifier"; readonly name: string }
  | { readonly type: "not"; readonly node: KeybindingWhenNode }
  | { readonly type: "and"; readonly left: KeybindingWhenNode; readonly right: KeybindingWhenNode }
  | { readonly type: "or"; readonly left: KeybindingWhenNode; readonly right: KeybindingWhenNode }

export interface KeybindingContext {
  readonly tableau: boolean
  readonly thread: boolean
  readonly settings: boolean
  readonly ticketSelected: boolean
  readonly columnSelected: boolean
  readonly dialogOpen: boolean
  readonly editableFocused: boolean
  readonly [key: string]: boolean
}

type WhenToken =
  | { readonly type: "identifier"; readonly value: string }
  | { readonly type: "not" }
  | { readonly type: "and" }
  | { readonly type: "or" }
  | { readonly type: "lparen" }
  | { readonly type: "rparen" }

export const resolveKeybindingSurface = (pathname: string): KeybindingSurface | undefined => {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings"
  }
  if (/^\/projects\/[^/]+\/board\/?$/.test(pathname)) {
    return "tableau"
  }
  if (/^\/projects\/[^/]+\/thread\/[^/]+\/?$/.test(pathname)) {
    return "thread"
  }
  if (pathname === "/") {
    return "tableau"
  }
  return undefined
}

export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false
  }
  return target.closest("input, textarea, select, [contenteditable=true]") !== null
}

export const isDialogOpen = (): boolean =>
  document.querySelector('[role="dialog"], [aria-modal="true"]') !== null

export const keybindingContextFromSurface = (
  surface: KeybindingSurface | undefined,
  flags: {
    readonly ticketSelected: boolean
    readonly columnSelected: boolean
    readonly dialogOpen: boolean
    readonly editableFocused: boolean
  },
): KeybindingContext => ({
  tableau: surface === "tableau",
  thread: surface === "thread",
  settings: surface === "settings",
  ticketSelected: flags.ticketSelected,
  columnSelected: flags.columnSelected,
  dialogOpen: flags.dialogOpen,
  editableFocused: flags.editableFocused,
})

const tokenizeWhenExpression = (expression: string): WhenToken[] | null => {
  const tokens: WhenToken[] = []
  let index = 0

  while (index < expression.length) {
    const current = expression[index]
    if (current === undefined) {
      break
    }
    if (/\s/.test(current)) {
      index += 1
      continue
    }
    if (expression.startsWith("&&", index)) {
      tokens.push({ type: "and" })
      index += 2
      continue
    }
    if (expression.startsWith("||", index)) {
      tokens.push({ type: "or" })
      index += 2
      continue
    }
    if (current === "!") {
      tokens.push({ type: "not" })
      index += 1
      continue
    }
    if (current === "(") {
      tokens.push({ type: "lparen" })
      index += 1
      continue
    }
    if (current === ")") {
      tokens.push({ type: "rparen" })
      index += 1
      continue
    }

    const identifier = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(expression.slice(index))
    if (identifier === null) {
      return null
    }
    tokens.push({ type: "identifier", value: identifier[0] })
    index += identifier[0].length
  }

  return tokens
}

export const parseKeybindingWhenExpression = (expression: string): KeybindingWhenNode | null => {
  const tokens = tokenizeWhenExpression(expression)
  if (tokens === null || tokens.length === 0) {
    return null
  }
  let index = 0

  const parsePrimary = (depth: number): KeybindingWhenNode | null => {
    if (depth > MAX_WHEN_EXPRESSION_DEPTH) {
      return null
    }
    const token = tokens[index]
    if (token === undefined) {
      return null
    }
    if (token.type === "identifier") {
      index += 1
      return { type: "identifier", name: token.value }
    }
    if (token.type === "lparen") {
      index += 1
      const expressionNode = parseOr(depth + 1)
      const closeToken = tokens[index]
      if (expressionNode === null || closeToken === undefined || closeToken.type !== "rparen") {
        return null
      }
      index += 1
      return expressionNode
    }
    return null
  }

  const parseUnary = (depth: number): KeybindingWhenNode | null => {
    let notCount = 0
    while (tokens[index]?.type === "not") {
      index += 1
      notCount += 1
      if (notCount > MAX_WHEN_EXPRESSION_DEPTH) {
        return null
      }
    }
    let node = parsePrimary(depth)
    if (node === null) {
      return null
    }
    while (notCount > 0) {
      node = { type: "not", node }
      notCount -= 1
    }
    return node
  }

  const parseAnd = (depth: number): KeybindingWhenNode | null => {
    let left = parseUnary(depth)
    if (left === null) {
      return null
    }
    while (tokens[index]?.type === "and") {
      index += 1
      const right = parseUnary(depth)
      if (right === null) {
        return null
      }
      left = { type: "and", left, right }
    }
    return left
  }

  const parseOr = (depth: number): KeybindingWhenNode | null => {
    let left = parseAnd(depth)
    if (left === null) {
      return null
    }
    while (tokens[index]?.type === "or") {
      index += 1
      const right = parseAnd(depth)
      if (right === null) {
        return null
      }
      left = { type: "or", left, right }
    }
    return left
  }

  const ast = parseOr(0)
  if (ast === null || index !== tokens.length) {
    return null
  }
  return ast
}

export const whenAstToExpression = (node: KeybindingWhenNode | undefined): string => {
  if (node === undefined) {
    return ""
  }
  switch (node.type) {
    case "identifier":
      return node.name
    case "not":
      return `!${wrapWhenExpression(node.node)}`
    case "and":
      return `${wrapWhenExpression(node.left)} && ${wrapWhenExpression(node.right)}`
    case "or":
      return `${wrapWhenExpression(node.left)} || ${wrapWhenExpression(node.right)}`
  }
}

const wrapWhenExpression = (node: KeybindingWhenNode): string => {
  if (node.type === "identifier" || node.type === "not") {
    return whenAstToExpression(node)
  }
  return `(${whenAstToExpression(node)})`
}

export const parseWhenExpressionDraft = (
  expression: string,
):
  | { readonly ok: true; readonly value: KeybindingWhenNode | undefined }
  | { readonly ok: false; readonly message: string } => {
  const trimmed = expression.trim()
  if (trimmed.length === 0) {
    return { ok: true, value: undefined }
  }
  if (trimmed.length > MAX_KEYBINDING_WHEN_LENGTH) {
    return { ok: false, message: "Expression trop longue." }
  }
  const ast = parseKeybindingWhenExpression(trimmed)
  if (ast === null) {
    return { ok: false, message: "Utilise des variables avec !, &&, || et des parenthèses." }
  }
  return { ok: true, value: ast }
}

export const evaluateWhenNode = (node: KeybindingWhenNode, context: KeybindingContext): boolean => {
  switch (node.type) {
    case "identifier":
      if (node.name === "true") {
        return true
      }
      if (node.name === "false") {
        return false
      }
      return Boolean(context[node.name])
    case "not":
      return !evaluateWhenNode(node.node, context)
    case "and":
      return evaluateWhenNode(node.left, context) && evaluateWhenNode(node.right, context)
    case "or":
      return evaluateWhenNode(node.left, context) || evaluateWhenNode(node.right, context)
  }
}

export const matchesWhenClause = (
  whenAst: KeybindingWhenNode | undefined,
  context: KeybindingContext,
): boolean => {
  if (whenAst === undefined) {
    return true
  }
  return evaluateWhenNode(whenAst, context)
}

export const collectWhenIdentifiers = (
  node: KeybindingWhenNode | undefined,
  identifiers: Set<string> = new Set(),
): Set<string> => {
  if (node === undefined) {
    return identifiers
  }
  switch (node.type) {
    case "identifier":
      identifiers.add(node.name)
      return identifiers
    case "not":
      return collectWhenIdentifiers(node.node, identifiers)
    case "and":
    case "or":
      collectWhenIdentifiers(node.left, identifiers)
      collectWhenIdentifiers(node.right, identifiers)
      return identifiers
  }
}

const KNOWN_WHEN_VARIABLES = new Set<string>(KEYBINDING_WHEN_IDENTIFIERS)

export const isKnownWhenVariable = (identifier: string): boolean =>
  KNOWN_WHEN_VARIABLES.has(identifier)

export const unknownWhenVariables = (
  node: KeybindingWhenNode | undefined,
): ReadonlyArray<string> => {
  const identifiers = collectWhenIdentifiers(node)
  return [...identifiers].filter((identifier) => !isKnownWhenVariable(identifier)).toSorted()
}

export const whenExpressionsConflict = (leftWhen: string, rightWhen: string): boolean =>
  leftWhen.length === 0 || rightWhen.length === 0 || leftWhen === rightWhen
