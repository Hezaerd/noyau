import { renderToStaticMarkup } from "react-dom/server"

import { ComposerPromptHighlight } from "@/components/thread/ComposerPromptHighlight"
import type { ComposerTicket } from "@/lib/composer-tickets"

let staging: HTMLTemplateElement | undefined

const getStaging = (): HTMLTemplateElement => {
  staging ??= document.createElement("template")
  return staging
}

/** Paint highlighted prompt HTML into a contentEditable host (sync, no flushSync). */
export const paintComposerPrompt = (
  editor: HTMLElement,
  text: string,
  tickets: ReadonlyArray<ComposerTicket> = [],
): void => {
  if (text.length === 0) {
    editor.replaceChildren()
    return
  }
  const host = getStaging()
  host.innerHTML = renderToStaticMarkup(
    <ComposerPromptHighlight text={text} trigger={null} tickets={tickets} />,
  )
  editor.replaceChildren(...Array.from(host.content.childNodes))
}
