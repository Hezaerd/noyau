import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"

import { ComposerPromptHighlight } from "@/components/thread/ComposerPromptHighlight"
import type { ComposerTicket } from "@/lib/composer-tickets"

let staging: HTMLDivElement | undefined
let stagingRoot: Root | undefined

interface ComposerPromptStaging {
  readonly staging: HTMLDivElement
  readonly root: Root
}

const getStagingRoot = (): ComposerPromptStaging => {
  if (staging === undefined || stagingRoot === undefined) {
    staging = document.createElement("div")
    stagingRoot = createRoot(staging)
  }
  return { staging, root: stagingRoot }
}

export const paintComposerPrompt = (
  editor: HTMLElement,
  text: string,
  tickets: ReadonlyArray<ComposerTicket> = [],
): void => {
  if (text.length === 0) {
    editor.replaceChildren()
    return
  }
  const { staging: host, root } = getStagingRoot()
  flushSync(() => {
    root.render(<ComposerPromptHighlight text={text} trigger={null} tickets={tickets} />)
  })
  const clones = Array.from(host.childNodes, (node) => node.cloneNode(true))
  editor.replaceChildren(...clones)
}
