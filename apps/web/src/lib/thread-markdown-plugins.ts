import { createCodePlugin } from "@streamdown/code"
import { math } from "@streamdown/math"
import { createMermaidPlugin } from "@streamdown/mermaid"

/** [light, dark] — le CSS applique --sdm-c hors .dark, --shiki-dark sous html.dark. */
export const threadCodePlugin = createCodePlugin({
  themes: ["one-light", "one-dark-pro"],
})

export const threadMermaidPlugin = createMermaidPlugin({
  config: {
    securityLevel: "strict",
    startOnLoad: false,
    suppressErrorRendering: true,
  },
})

export const threadMarkdownPlugins = {
  code: threadCodePlugin,
  math,
  mermaid: threadMermaidPlugin,
}

export const threadPreviewMarkdownPlugins = {
  code: threadCodePlugin,
  math,
}
