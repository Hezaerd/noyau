const textLength = (value: string): number => value.replaceAll("\u00A0", " ").length

const mentionSource = (node: HTMLElement): string => node.dataset.mentionSource ?? ""

const mentionElement = (node: Node): HTMLElement | undefined =>
  node instanceof HTMLElement && node.dataset.composerMention === "true" ? node : undefined

const blockElement = (node: Node): HTMLElement | undefined =>
  node instanceof HTMLElement && (node.tagName === "DIV" || node.tagName === "P") ? node : undefined

const indexInParent = (node: Node): number => {
  const parent = node.parentNode
  if (parent === null) {
    return 0
  }
  let index = 0
  for (const child of parent.childNodes) {
    if (child === node) {
      return index
    }
    index += 1
  }
  return 0
}

export const serializedComposerPromptLength = (node: Node): number => {
  if (node.nodeType === Node.TEXT_NODE) {
    return textLength(node.textContent ?? "")
  }
  if (!(node instanceof HTMLElement)) {
    return 0
  }
  const mention = mentionElement(node)
  if (mention !== undefined) {
    return mentionSource(mention).length
  }
  if (node.tagName === "BR") {
    return 1
  }
  let length = 0
  for (const child of node.childNodes) {
    length += serializedComposerPromptLength(child)
  }
  return length
}

const serializeChildren = (parent: HTMLElement, isRoot: boolean): string => {
  let output = ""
  for (const [index, child] of [...parent.childNodes].entries()) {
    if (child.nodeType === Node.TEXT_NODE) {
      output += (child.textContent ?? "").replaceAll("\u00A0", " ")
      continue
    }
    if (!(child instanceof HTMLElement)) {
      continue
    }
    const mention = mentionElement(child)
    if (mention !== undefined) {
      output += mentionSource(mention)
      continue
    }
    if (child.tagName === "BR") {
      output += "\n"
      continue
    }
    if (blockElement(child) !== undefined && isRoot && index > 0 && !output.endsWith("\n")) {
      output += "\n"
    }
    output += serializeChildren(child, false)
  }
  return output
}

export const isComposerPromptDomEmpty = (root: HTMLElement): boolean =>
  (root.textContent ?? "").replaceAll("\u00A0", " ") === "" &&
  root.querySelector("[data-composer-mention]") === null

export const serializeComposerPromptField = (root: HTMLElement): string => {
  if (isComposerPromptDomEmpty(root)) {
    return ""
  }
  const serialized = serializeChildren(root, true)
  const onlyPlaceholderBreak =
    root.childNodes.length === 1 &&
    root.firstChild instanceof HTMLElement &&
    root.firstChild.tagName === "BR"
  return onlyPlaceholderBreak || serialized === "\n" ? "" : serialized
}

export interface ComposerPromptSelectionOffsets {
  readonly start: number
  readonly end: number
}

export const composerPromptFieldSelectionOffsets = (
  root: HTMLElement,
): ComposerPromptSelectionOffsets => {
  const selection = root.ownerDocument.getSelection()
  if (selection === null || selection.rangeCount === 0) {
    const caret = serializeComposerPromptField(root).length
    return { start: caret, end: caret }
  }
  const range = selection.getRangeAt(0)
  const start = positionToOffset(root, range.startContainer, range.startOffset)
  const end = positionToOffset(root, range.endContainer, range.endOffset)
  return start <= end ? { start, end } : { start: end, end: start }
}

export const serializeComposerPromptSelection = (root: HTMLElement): string => {
  const { start, end } = composerPromptFieldSelectionOffsets(root)
  return serializeComposerPromptField(root).slice(start, end)
}

export const composerPromptFieldCaretOffset = (root: HTMLElement): number => {
  const selection = root.ownerDocument.getSelection()
  if (selection === null || selection.rangeCount === 0) {
    return serializeComposerPromptField(root).length
  }
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) && range.startContainer !== root) {
    return serializeComposerPromptField(root).length
  }
  return positionToOffset(root, range.startContainer, range.startOffset)
}

const positionToOffset = (root: Node, container: Node, offset: number): number => {
  let count = 0
  const visit = (node: Node): boolean => {
    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) {
        count += offset
        return true
      }
      for (let index = 0; index < offset && index < node.childNodes.length; index += 1) {
        const child = node.childNodes[index]
        if (child !== undefined) {
          count += serializedComposerPromptLength(child)
        }
      }
      return true
    }
    const mention = mentionElement(node)
    if (mention !== undefined) {
      count += mentionSource(mention).length
      return mention.contains(container)
    }
    if (node.nodeType === Node.TEXT_NODE) {
      count += textLength(node.textContent ?? "")
      return false
    }
    if (node instanceof HTMLElement && node.tagName === "BR") {
      count += 1
      return false
    }
    for (const child of node.childNodes) {
      if (visit(child)) {
        return true
      }
    }
    return false
  }
  visit(root)
  return count
}

const offsetToPoint = (
  root: Node,
  target: number,
): { readonly node: Node; readonly offset: number } => {
  let remaining = target
  const visit = (node: Node): { readonly node: Node; readonly offset: number } | null => {
    const mention = mentionElement(node)
    if (mention !== undefined) {
      const length = mentionSource(mention).length
      const parent = mention.parentNode
      if (parent === null) {
        return null
      }
      if (remaining <= 0) {
        return { node: parent, offset: indexInParent(mention) }
      }
      remaining -= length
      if (remaining <= 0) {
        return { node: parent, offset: indexInParent(mention) + 1 }
      }
      return null
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const length = textLength(node.textContent ?? "")
      if (remaining <= length) {
        return { node, offset: remaining }
      }
      remaining -= length
      return null
    }
    if (node instanceof HTMLElement && node.tagName === "BR") {
      const parent = node.parentNode
      if (parent === null) {
        return null
      }
      if (remaining <= 0) {
        return { node: parent, offset: indexInParent(node) }
      }
      remaining -= 1
      return null
    }
    for (const child of node.childNodes) {
      const found = visit(child)
      if (found !== null) {
        return found
      }
    }
    return null
  }
  return visit(root) ?? { node: root, offset: root.childNodes.length }
}

export const setComposerPromptFieldCaret = (root: HTMLElement, offset: number): void => {
  const point = offsetToPoint(root, Math.max(0, offset))
  const selection = root.ownerDocument.getSelection()
  if (selection === null) {
    return
  }
  const range = root.ownerDocument.createRange()
  range.setStart(point.node, point.offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}
