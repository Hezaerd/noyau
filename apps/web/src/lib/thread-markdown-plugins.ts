import { createCodePlugin } from "@streamdown/code"
import { math } from "@streamdown/math"

/** [light, dark] — le CSS applique --sdm-c hors .dark, --shiki-dark sous html.dark. */
export const threadCodePlugin = createCodePlugin({
  themes: ["one-light", "one-dark-pro"],
})

export const threadMarkdownPlugins = {
  code: threadCodePlugin,
  math,
}
